import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeRatings, type ReviewStatus, type ReviewTarget } from "@/lib/reviews";
import { logQueryError } from "@/lib/supabase/logQueryError";

export const PAGE_SIZE = 25;

export type ReviewFilters = {
  type?: ReviewTarget;
  staff?: string;
  branch?: string;
  service?: string;
  rating?: number;
  from?: string;
  to?: string;
  status?: ReviewStatus | "new";
  photos?: boolean;
  q?: string;
  page?: number;
};

const TYPES = new Set(["service", "staff", "branch"]);
const STATUSES = new Set(["visible", "flagged", "hidden", "removed", "new"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(v: string | undefined) {
  if (!v || !DATE_RE.test(v)) return undefined;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined;
}

export function parseReviewFilters(sp: Record<string, string | string[] | undefined>): ReviewFilters {
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const rating = Number(get("rating"));
  const page = Number(get("page"));
  return {
    type: TYPES.has(get("type") ?? "") ? (get("type") as ReviewTarget) : undefined,
    staff: UUID_RE.test(get("staff") ?? "") ? get("staff") : undefined,
    branch: UUID_RE.test(get("branch") ?? "") ? get("branch") : undefined,
    service: get("service")?.trim().slice(0, 100) || undefined,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
    from: validDate(get("from")),
    to: validDate(get("to")),
    status: STATUSES.has(get("status") ?? "") ? (get("status") as ReviewFilters["status"]) : undefined,
    photos: get("photos") === "1" ? true : undefined,
    q: get("q")?.trim().slice(0, 100) || undefined,
    page: page >= 1 ? Math.floor(page) : 1,
  };
}

export type AdminReviewRow = {
  id: string;
  targetType: ReviewTarget;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  createdAt: string;
  isNew: boolean;
  clientName: string;
  targetName: string;
  appointmentId: string | null;
  photoCount: number;
  reportCount: number;
};

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  return !v ? null : Array.isArray(v) ? (v[0] ?? null) : v;
}

const LIST_SELECT =
  "id, target_type, rating, text, status, created_at, admin_seen_at, appointment_id, client:profiles!reviews_client_id_fkey(full_name), staff:staff_members(full_name), branch:branches(name), service:branch_services(name), review_photos(count), review_reports(count)";

type RawRow = {
  id: string;
  target_type: ReviewTarget;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  created_at: string;
  admin_seen_at: string | null;
  appointment_id: string | null;
  client: Rel<{ full_name: string | null }>;
  staff: Rel<{ full_name: string }>;
  branch: Rel<{ name: string }>;
  service: Rel<{ name: string }>;
  review_photos?: { count: number }[] | null;
  review_reports?: { count: number }[] | null;
};

function toRow(r: RawRow): AdminReviewRow {
  return {
    id: r.id,
    targetType: r.target_type,
    rating: r.rating,
    text: r.text,
    status: r.status,
    createdAt: r.created_at,
    isNew: r.admin_seen_at === null,
    clientName: one(r.client)?.full_name ?? "Client",
    targetName:
      r.target_type === "staff"
        ? one(r.staff)?.full_name ?? "Former staff"
        : r.target_type === "branch"
          ? one(r.branch)?.name ?? "Branch"
          : one(r.service)?.name ?? "Service",
    appointmentId: r.appointment_id,
    photoCount: r.review_photos?.[0]?.count ?? 0,
    reportCount: r.review_reports?.[0]?.count ?? 0,
  };
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listAdminReviews(supabase: SupabaseClient, f: ReviewFilters) {
  const select = f.photos ? `${LIST_SELECT}, has_photos:review_photos!inner(id)` : LIST_SELECT;
  let q = supabase.from("reviews").select(select, { count: "exact" }).order("created_at", { ascending: false });
  if (f.type) q = q.eq("target_type", f.type);
  if (f.staff) q = q.eq("staff_id", f.staff);
  if (f.branch) q = q.eq("branch_id", f.branch);
  if (f.service) {
    const { data: svc, error: svcError } = await supabase.from("branch_services").select("id").eq("name", f.service);
    if (svcError) logQueryError("listAdminReviews service lookup", svcError);
    const ids = ((svc ?? []) as { id: string }[]).map((s) => s.id);
    if (ids.length === 0) return { rows: [] as AdminReviewRow[], total: 0 };
    q = q.in("service_id", ids);
  }
  if (f.rating) q = q.eq("rating", f.rating);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+08:00`);
  if (f.to) q = q.lte("created_at", `${f.to}T23:59:59.999+08:00`);
  if (f.status === "new") q = q.is("admin_seen_at", null);
  else if (f.status) q = q.eq("status", f.status);
  if (f.q) q = q.ilike("text", `%${escapeLike(f.q)}%`);
  const page = f.page ?? 1;
  q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await q;
  if (error) logQueryError("listAdminReviews", error);
  return { rows: ((data as unknown as RawRow[]) ?? []).map(toRow), total: count ?? 0 };
}

export async function getAdminReviewStats(supabase: SupabaseClient) {
  const [visible, fresh, hidden, removed, flagged] = await Promise.all([
    supabase.from("reviews").select("target_type, rating").eq("status", "visible"),
    supabase.from("reviews").select("id", { count: "exact", head: true }).is("admin_seen_at", null),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "hidden"),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "removed"),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "flagged"),
  ]);
  if (flagged.error) logQueryError("getAdminReviewStats flagged", flagged.error);
  const rows = (visible.data ?? []) as { target_type: ReviewTarget; rating: number }[];
  const byType = Object.fromEntries(
    (["service", "staff", "branch"] as ReviewTarget[]).map((t) => {
      const s = summarizeRatings(rows.filter((r) => r.target_type === t).map((r) => r.rating));
      return [t, { average: s.average, count: s.count }];
    })
  ) as Record<ReviewTarget, { average: number; count: number }>;
  return { byType, newCount: fresh.count ?? 0, hiddenCount: hidden.count ?? 0, removedCount: removed.count ?? 0, flaggedCount: flagged.count ?? 0 };
}

export async function getReviewFilterOptions(supabase: SupabaseClient) {
  const [staff, branches, services] = await Promise.all([
    supabase.from("staff_members").select("id, full_name").order("full_name"),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("branch_services").select("id, name").order("name"),
  ]);
  const uniqByName = (list: { id: string; name: string }[]) => {
    const seen = new Set<string>();
    return list
      .map((x) => ({ id: x.id, name: x.name.trim() }))
      .filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true)));
  };
  return {
    staff: ((staff.data ?? []) as { id: string; full_name: string }[]).map((s) => ({ id: s.id, name: s.full_name })),
    branches: (branches.data ?? []) as { id: string; name: string }[],
    services: uniqByName((services.data ?? []) as { id: string; name: string }[]).map((s) => ({ id: s.name, name: s.name })),
  };
}

export type AdminReviewDetail = {
  review: AdminReviewRow;
  appointment: {
    id: string;
    bookingCode: string | null;
    scheduledDate: string;
    startTime: string;
    serviceName: string | null;
    therapistName: string | null;
    branchName: string | null;
  } | null;
  siblings: AdminReviewRow[];
  photos: string[];
  reports: { id: string; reason: string; note: string | null; reporterName: string; createdAt: string }[];
  history: { id: string; action: string; fromStatus: string; toStatus: string; reason: string | null; createdAt: string; actorName: string }[];
};

export async function getAdminReviewDetail(supabase: SupabaseClient, id: string): Promise<AdminReviewDetail | null> {
  const { data, error: detailError } = await supabase.from("reviews").select(LIST_SELECT).eq("id", id).maybeSingle();
  if (detailError) logQueryError("getAdminReviewDetail", detailError);
  if (!data) return null;
  const review = toRow(data as unknown as RawRow);

  const [appt, siblings, history, photoRows, reportRows] = await Promise.all([
    review.appointmentId
      ? supabase
          .from("appointments")
          .select("id, booking_code, scheduled_date, start_time, notes, service:branch_services(name), professional:staff_members(full_name), branch:branches(name)")
          .eq("id", review.appointmentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    review.appointmentId
      ? supabase.from("reviews").select(LIST_SELECT).eq("appointment_id", review.appointmentId).neq("id", id)
      : Promise.resolve({ data: [] }),
    supabase
      .from("review_moderation_log")
      .select("id, action, from_status, to_status, reason, created_at, actor:profiles(full_name)")
      .eq("review_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("review_photos").select("storage_path").eq("review_id", id).order("position", { ascending: true }),
    supabase
      .from("review_reports")
      .select("id, reason, note, created_at, reporter:profiles!review_reports_reporter_id_fkey(full_name)")
      .eq("review_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (photoRows.error) logQueryError("getAdminReviewDetail photos", photoRows.error);
  if (reportRows.error) logQueryError("getAdminReviewDetail reports", reportRows.error);

  const paths = ((photoRows.data ?? []) as { storage_path: string }[]).map((p) => p.storage_path);
  let photos: string[] = [];
  if (paths.length > 0) {
    const { data: signed, error: signError } = await supabase.storage.from("review-photos").createSignedUrls(paths, 3600);
    if (signError) logQueryError("getAdminReviewDetail sign photos", signError);
    photos = (signed ?? []).map((s) => s.signedUrl).filter((u): u is string => !!u);
  }

  const a = appt.data as unknown as {
    id: string;
    booking_code: string | null;
    scheduled_date: string;
    start_time: string;
    notes: string | null;
    service: Rel<{ name: string }>;
    professional: Rel<{ full_name: string }>;
    branch: Rel<{ name: string }>;
  } | null;

  return {
    review,
    appointment: a
      ? {
          id: a.id,
          bookingCode: a.booking_code,
          scheduledDate: a.scheduled_date,
          startTime: a.start_time,
          serviceName: one(a.service)?.name ?? a.notes,
          therapistName: one(a.professional)?.full_name ?? null,
          branchName: one(a.branch)?.name ?? null,
        }
      : null,
    siblings: ((siblings.data as unknown as RawRow[]) ?? []).map(toRow),
    photos,
    reports: (
      (reportRows.data as unknown as {
        id: string;
        reason: string;
        note: string | null;
        created_at: string;
        reporter: Rel<{ full_name: string | null }>;
      }[]) ?? []
    ).map((r) => ({
      id: r.id,
      reason: r.reason,
      note: r.note,
      reporterName: one(r.reporter)?.full_name ?? "Client",
      createdAt: r.created_at,
    })),
    history: (
      (history.data as unknown as {
        id: string;
        action: string;
        from_status: string;
        to_status: string;
        reason: string | null;
        created_at: string;
        actor: Rel<{ full_name: string | null }>;
      }[]) ?? []
    ).map((h) => ({
      id: h.id,
      action: h.action,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      reason: h.reason,
      createdAt: h.created_at,
      actorName: one(h.actor)?.full_name ?? "Admin",
    })),
  };
}

export async function moderateReview(
  supabase: SupabaseClient,
  id: string,
  action: "hide" | "show" | "remove" | "restore" | "keep",
  reason: string
): Promise<string | null> {
  const { error } = await supabase.rpc("moderate_review", { p_review_id: id, p_action: action, p_reason: reason });
  if (!error) return null;
  if (error.message === "REVIEW_BAD_TRANSITION") return "That review changed in the meantime — refresh and try again.";
  if (error.message === "REVIEW_FORBIDDEN") return "Only admins can moderate reviews.";
  return "Couldn't update the review. Please try again.";
}

export async function markReviewsSeen(supabase: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.rpc("mark_reviews_seen", { p_ids: ids });
  if (error) logQueryError("markReviewsSeen", error);
}
