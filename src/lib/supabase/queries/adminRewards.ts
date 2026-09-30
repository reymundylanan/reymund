import type { SupabaseClient } from "@supabase/supabase-js";
import { CRITERIA, type Criterion, type EvaluationRow } from "@/lib/reviewRewards";
import { logQueryError } from "@/lib/supabase/logQueryError";

export type RewardSettings = {
  ratingPoints: number;
  meaningfulPoints: number;
  specificPoints: number;
  relevantPoints: number;
  photoPoints: number;
  partialRatio: number;
  maxPoints: number;
  enabled: boolean;
};

export type Decision = "pass" | "partial" | "fail";

export type EvaluationOverride = {
  id: string;
  criterion: Criterion;
  originalResult: string | null;
  decision: Decision;
  reason: string;
  pointsDelta: number;
  adminName: string;
  createdAt: string;
};

export type EvaluationDetail = EvaluationRow & {
  id: string;
  appointmentId: string;
  lastError: string | null;
  createdAt: string;
  overrides: EvaluationOverride[];
};

export type QueuePart = {
  targetType: "service" | "staff" | "branch";
  serviceName: string | null;
  rating: number;
  text: string | null;
  tags: string[];
  photoPaths: string[];
};

export type QueueItem = {
  evaluation: EvaluationDetail;
  clientName: string;
  visitDate: string | null;
  serviceNames: string[];
  parts: QueuePart[];
};

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  return !v ? null : Array.isArray(v) ? (v[0] ?? null) : v;
}

const POINT_FIELDS = ["ratingPoints", "meaningfulPoints", "specificPoints", "relevantPoints", "photoPoints"] as const;

export function validateSettings(s: RewardSettings): string | null {
  for (const key of POINT_FIELDS) {
    const v = s[key];
    if (!Number.isInteger(v) || v < 0 || v > 1000) return "Points must be whole numbers from 0 to 1000.";
  }
  if (!Number.isFinite(s.partialRatio) || s.partialRatio < 0 || s.partialRatio > 1) return "Partial must be between 0% and 100%.";
  if (!Number.isInteger(s.maxPoints) || s.maxPoints < 0 || s.maxPoints > 5000) return "Max points must be a whole number from 0 to 5000.";
  return null;
}

function rpcMessage(error: { message?: string } | null): string | null {
  if (!error) return null;
  const m = error.message ?? "";
  if (m.includes("REVIEW_FORBIDDEN")) return "Only admins can do this.";
  if (m.includes("EVAL_BAD_STATE")) return "This review changed — refresh and try again.";
  if (m.includes("REVIEW_INVALID")) return "Check the values and try again.";
  return "Couldn't save. Please try again.";
}

export async function getRewardSettings(supabase: SupabaseClient): Promise<RewardSettings | null> {
  const { data, error } = await supabase
    .from("review_reward_settings")
    .select("rating_points, meaningful_points, specific_points, relevant_points, photo_points, partial_ratio, max_points, enabled")
    .eq("id", 1)
    .maybeSingle();
  if (error) logQueryError("getRewardSettings", error);
  if (!data) return null;
  const r = data as Record<string, number | boolean>;
  return {
    ratingPoints: Number(r.rating_points),
    meaningfulPoints: Number(r.meaningful_points),
    specificPoints: Number(r.specific_points),
    relevantPoints: Number(r.relevant_points),
    photoPoints: Number(r.photo_points),
    partialRatio: Number(r.partial_ratio),
    maxPoints: Number(r.max_points),
    enabled: !!r.enabled,
  };
}

export async function saveRewardSettings(supabase: SupabaseClient, s: RewardSettings): Promise<string | null> {
  const invalid = validateSettings(s);
  if (invalid) return invalid;
  const { error } = await supabase.rpc("update_review_reward_settings", {
    p_rating: s.ratingPoints,
    p_meaningful: s.meaningfulPoints,
    p_specific: s.specificPoints,
    p_relevant: s.relevantPoints,
    p_photo: s.photoPoints,
    p_partial_ratio: s.partialRatio,
    p_max: s.maxPoints,
    p_enabled: s.enabled,
  });
  return rpcMessage(error);
}

const EVAL_SELECT =
  "id, appointment_id, client_id, status, points_awarded, ai_summary, settings_snapshot, last_error, created_at, " +
  CRITERIA.map((c) => `${c}_result, ${c}_confidence, ${c}_reason`).join(", ");

type RawEvaluation = Record<string, unknown> & {
  id: string;
  appointment_id: string;
  client_id: string;
  last_error: string | null;
  created_at: string;
};

type RawOverride = {
  id: string;
  evaluation_id: string;
  criterion: Criterion;
  original_result: string | null;
  decision: Decision;
  reason: string;
  points_delta: number;
  created_at: string;
  admin: Rel<{ full_name: string | null }>;
};

function toOverride(o: RawOverride): EvaluationOverride {
  return {
    id: o.id,
    criterion: o.criterion,
    originalResult: o.original_result,
    decision: o.decision,
    reason: o.reason,
    pointsDelta: o.points_delta,
    adminName: one(o.admin)?.full_name ?? "Admin",
    createdAt: o.created_at,
  };
}

function toDetail(raw: RawEvaluation, overrides: EvaluationOverride[]): EvaluationDetail {
  return {
    ...(raw as unknown as EvaluationRow),
    id: raw.id,
    appointmentId: raw.appointment_id,
    lastError: raw.last_error,
    createdAt: raw.created_at,
    overrides,
  };
}

const OVERRIDE_SELECT = "id, evaluation_id, criterion, original_result, decision, reason, points_delta, created_at, admin:profiles(full_name)";

async function overridesFor(supabase: SupabaseClient, ids: string[]): Promise<Map<string, EvaluationOverride[]>> {
  const map = new Map<string, EvaluationOverride[]>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("review_evaluation_overrides")
    .select(OVERRIDE_SELECT)
    .in("evaluation_id", ids)
    .order("created_at", { ascending: false });
  if (error) logQueryError("overridesFor", error);
  for (const o of (data ?? []) as unknown as RawOverride[]) {
    const list = map.get(o.evaluation_id) ?? [];
    list.push(toOverride(o));
    map.set(o.evaluation_id, list);
  }
  return map;
}

export async function listRewardQueue(supabase: SupabaseClient): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from("review_evaluations")
    .select(EVAL_SELECT)
    .in("status", ["needs_review", "failed"])
    .order("created_at", { ascending: true });
  if (error) logQueryError("listRewardQueue", error);
  const evals = (data ?? []) as unknown as RawEvaluation[];
  if (evals.length === 0) return [];

  const evalIds = evals.map((e) => e.id);
  const apptIds = [...new Set(evals.map((e) => e.appointment_id))];
  const clientIds = [...new Set(evals.map((e) => e.client_id))];

  const [overrides, profiles, appts, svcs, reviews] = await Promise.all([
    overridesFor(supabase, evalIds),
    supabase.from("profiles").select("id, full_name").in("id", clientIds),
    supabase.from("appointments").select("id, scheduled_date").in("id", apptIds),
    supabase.from("appointment_services").select("appointment_id, position, service_name").in("appointment_id", apptIds).order("position"),
    supabase
      .from("reviews")
      .select("appointment_id, target_type, service_position, rating, text, tags, review_photos(storage_path, position)")
      .in("appointment_id", apptIds),
  ]);
  if (profiles.error) logQueryError("listRewardQueue profiles", profiles.error);
  if (appts.error) logQueryError("listRewardQueue appointments", appts.error);
  if (svcs.error) logQueryError("listRewardQueue services", svcs.error);
  if (reviews.error) logQueryError("listRewardQueue reviews", reviews.error);

  const names = new Map(((profiles.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  const dates = new Map(((appts.data ?? []) as { id: string; scheduled_date: string }[]).map((a) => [a.id, a.scheduled_date]));
  const services = (svcs.data ?? []) as { appointment_id: string; position: number; service_name: string }[];
  const rawReviews = (reviews.data ?? []) as unknown as {
    appointment_id: string;
    target_type: QueuePart["targetType"];
    service_position: number | null;
    rating: number;
    text: string | null;
    tags: string[] | null;
    review_photos: { storage_path: string; position: number }[] | null;
  }[];

  return evals.map((e) => {
    const visitServices = services.filter((s) => s.appointment_id === e.appointment_id);
    const parts: QueuePart[] = rawReviews
      .filter((r) => r.appointment_id === e.appointment_id)
      .map((r) => ({
        targetType: r.target_type,
        serviceName:
          r.target_type === "service" ? (visitServices.find((s) => s.position === r.service_position)?.service_name ?? null) : null,
        rating: r.rating,
        text: r.text,
        tags: r.tags ?? [],
        photoPaths: [...(r.review_photos ?? [])].sort((a, b) => a.position - b.position).map((p) => p.storage_path),
      }));
    return {
      evaluation: toDetail(e, overrides.get(e.id) ?? []),
      clientName: names.get(e.client_id) ?? "",
      visitDate: dates.get(e.appointment_id) ?? null,
      serviceNames: visitServices.map((s) => s.service_name),
      parts,
    };
  });
}

export async function getEvaluationForAppointment(supabase: SupabaseClient, appointmentId: string): Promise<EvaluationDetail | null> {
  const { data, error } = await supabase.from("review_evaluations").select(EVAL_SELECT).eq("appointment_id", appointmentId).maybeSingle();
  if (error) logQueryError("getEvaluationForAppointment", error);
  if (!data) return null;
  const raw = data as unknown as RawEvaluation;
  const overrides = await overridesFor(supabase, [raw.id]);
  return toDetail(raw, overrides.get(raw.id) ?? []);
}

export async function overrideCriterion(
  supabase: SupabaseClient,
  evaluationId: string,
  criterion: Criterion,
  decision: Decision,
  reason: string
): Promise<string | null> {
  const { error } = await supabase.rpc("override_review_criterion", {
    p_evaluation_id: evaluationId,
    p_criterion: criterion,
    p_decision: decision,
    p_reason: reason.trim(),
  });
  return rpcMessage(error);
}

export async function retryEvaluation(supabase: SupabaseClient, evaluationId: string): Promise<string | null> {
  const { error } = await supabase.rpc("retry_review_evaluation", { p_evaluation_id: evaluationId });
  return rpcMessage(error);
}

export async function getRewardStats(
  supabase: SupabaseClient
): Promise<{ pointsThisMonth: number; reviewsRewarded: number; averagePoints: number }> {
  const manila = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
  const { data, error } = await supabase
    .from("points_transactions")
    .select("type, points, review_evaluation_id")
    .not("review_evaluation_id", "is", null)
    .gte("created_at", `${manila}-01T00:00:00+08:00`);
  if (error) logQueryError("getRewardStats", error);
  return computeRewardStats((data ?? []) as RewardTxRow[]);
}

export type RewardTxRow = { type: string; points: number };

/** "Rewarded" counts review_reward rows only; the average is review_reward
 * points per rewarded review; points issued also include admin adjustments. */
export function computeRewardStats(rows: RewardTxRow[]): { pointsThisMonth: number; reviewsRewarded: number; averagePoints: number } {
  const rewards = rows.filter((r) => r.type === "review_reward");
  const rewardPoints = rewards.reduce((sum, r) => sum + r.points, 0);
  const pointsThisMonth = rows
    .filter((r) => r.type === "review_reward" || r.type === "admin_adjustment")
    .reduce((sum, r) => sum + r.points, 0);
  return {
    pointsThisMonth,
    reviewsRewarded: rewards.length,
    averagePoints: rewards.length ? Math.round(rewardPoints / rewards.length) : 0,
  };
}
