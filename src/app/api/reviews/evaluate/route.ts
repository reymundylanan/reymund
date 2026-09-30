import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeEqual } from "@/lib/messenger/signature";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { GEMINI_REVIEW_MODEL, geminiJson, type GeminiImage } from "@/lib/ai/gemini";
import { AI_RESPONSE_SCHEMA, evaluateAppointment, type EvaluateDeps, type EvaluateOutcome } from "@/lib/reviewEvaluation";
import type { EvaluationPart } from "@/lib/reviewRewards";

export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CRON_BATCH = 10;
const CRON_ITEM_TIMEOUT_MS = 20_000;
const PHOTO_DOWNLOAD_TIMEOUT_MS = 5_000;
// Start a new item only if it can finish (Gemini + photo + slack) inside maxDuration.
const CRON_START_DEADLINE_MS = 50_000 - CRON_ITEM_TIMEOUT_MS - PHOTO_DOWNLOAD_TIMEOUT_MS;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const EVALUATION_SELECT =
  "id, status, points_awarded, ai_summary, settings_snapshot, " +
  "rating_result, rating_confidence, rating_reason, " +
  "meaningful_result, meaningful_confidence, meaningful_reason, " +
  "specific_result, specific_confidence, specific_reason, " +
  "relevant_result, relevant_confidence, relevant_reason, " +
  "photo_result, photo_confidence, photo_reason";

function buildDeps(admin: SupabaseClient, timeoutMs: number): EvaluateDeps {
  return {
    async claim(appointmentId) {
      const { data, error } = await admin.rpc("claim_review_evaluation", { p_appointment_id: appointmentId });
      if (error) throw new Error(`claim_review_evaluation: ${error.message}`);
      if (!data) return null;
      return { evaluationId: data.evaluationId as string, parts: (data.parts ?? []) as EvaluationPart[] };
    },
    async downloadPhoto(path) {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), PHOTO_DOWNLOAD_TIMEOUT_MS));
      const result = await Promise.race([admin.storage.from("review-photos").download(path), timeout]);
      if (!result) {
        console.warn("review-photos download timed out");
        return null;
      }
      const { data, error } = result;
      if (error || !data) {
        logQueryError("review-photos download", error ?? { message: "empty download" });
        return null;
      }
      return {
        mimeType: ALLOWED_MIME.has(data.type) ? data.type : "image/jpeg",
        base64: Buffer.from(await data.arrayBuffer()).toString("base64"),
      } satisfies GeminiImage;
    },
    grade(input) {
      return geminiJson({ ...input, schema: AI_RESPONSE_SCHEMA, timeoutMs });
    },
    async apply(evaluationId, result) {
      const { data, error } = await admin.rpc("apply_review_evaluation", {
        p_evaluation_id: evaluationId,
        p_result: result,
        p_model: GEMINI_REVIEW_MODEL,
      });
      if (error) throw new Error(`apply_review_evaluation: ${error.message}`);
      return data as { status: string; points: number; balance: number; applied: boolean };
    },
    async fail(evaluationId, message) {
      const { error } = await admin.rpc("fail_review_evaluation", { p_evaluation_id: evaluationId, p_error: message });
      logQueryError("fail_review_evaluation", error);
    },
  };
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");

  // Cron retry ping.
  if (authHeader !== null) {
    const expected = process.env.REVIEW_EVAL_SECRET;
    if (!expected || !safeEqual(authHeader, `Bearer ${expected}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not set; leaving review evaluations pending");
      return NextResponse.json({ processed: 0 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("due_review_evaluations", { p_limit: CRON_BATCH });
    if (error) {
      logQueryError("due_review_evaluations", error);
      return NextResponse.json({ error: "Could not load due evaluations" }, { status: 500 });
    }
    const ids = (data as string[] | null) ?? [];
    const deps = buildDeps(admin, CRON_ITEM_TIMEOUT_MS);
    const started = Date.now();
    let processed = 0;
    for (const id of ids) {
      if (Date.now() - started > CRON_START_DEADLINE_MS) break;
      try {
        await evaluateAppointment(id, deps);
      } catch (err) {
        console.error("Review evaluation failed:", id, err);
      }
      processed += 1;
    }
    return NextResponse.json({ processed });
  }

  // Client-triggered evaluation right after submitting a review.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { appointmentId?: unknown } | null;
  const appointmentId = body?.appointmentId;
  if (typeof appointmentId !== "string" || !UUID_RE.test(appointmentId)) {
    return NextResponse.json({ error: "appointmentId must be a UUID" }, { status: 400 });
  }

  const { data: owned, error: ownedError } = await supabase
    .from("review_evaluations")
    .select("id, status, attempts, next_attempt_at")
    .eq("appointment_id", appointmentId)
    .eq("client_id", user.id)
    .maybeSingle();
  if (ownedError) {
    logQueryError("review_evaluations ownership", ownedError);
    return NextResponse.json({ error: "Could not check the review" }, { status: 500 });
  }
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = createAdminClient();
  const state = owned as { status: string; attempts: number; next_attempt_at: string | null };
  const claimable =
    state.status === "pending" &&
    (state.attempts === 0 || !state.next_attempt_at || new Date(state.next_attempt_at).getTime() <= Date.now());
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  if (claimable && !hasKey) console.warn("GEMINI_API_KEY is not set; leaving review evaluation pending");
  // Repeated client calls must not burn attempts or Gemini cost.
  const outcome: EvaluateOutcome = claimable && hasKey
    ? await evaluateAppointment(appointmentId, buildDeps(admin, 15_000))
    : { status: "not_found" };

  const { data: evaluation, error: evalError } = await admin
    .from("review_evaluations")
    .select(EVALUATION_SELECT)
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  logQueryError("review_evaluations read", evalError);

  const { data: rewards, error: rewardsError } = await admin
    .from("client_rewards")
    .select("current_points")
    .eq("client_id", user.id)
    .maybeSingle();
  logQueryError("client_rewards read", rewardsError);

  const row = evaluation as unknown as { status: string; points_awarded: number } | null;
  const balance = rewards?.current_points ?? outcome.balance ?? 0;

  // Already evaluated or skipped earlier: report the stored state.
  if (outcome.status === "not_found" && row) {
    return NextResponse.json({ status: row.status, points: row.points_awarded, balance, evaluation: row });
  }

  return NextResponse.json({
    status: outcome.status,
    points: outcome.points ?? row?.points_awarded ?? 0,
    balance,
    evaluation: row,
  });
}
