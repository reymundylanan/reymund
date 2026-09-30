import { AI_RESPONSE_SCHEMA, buildEvaluationPrompt, parseAiEvaluation, type AiEvaluation, type EvaluationPart } from "@/lib/reviewRewards";
import type { GeminiImage } from "@/lib/ai/gemini";

export const MAX_PHOTOS_TO_AI = 8;
export { AI_RESPONSE_SCHEMA };

export type EvaluateDeps = {
  claim(appointmentId: string): Promise<{ evaluationId: string; parts: EvaluationPart[] } | null>;
  downloadPhoto(path: string): Promise<GeminiImage | null>;
  grade(input: { system: string; text: string; images: GeminiImage[] }): Promise<unknown>;
  apply(evaluationId: string, result: AiEvaluation): Promise<{ status: string; points: number; balance: number; applied: boolean }>;
  fail(evaluationId: string, error: string): Promise<void>;
};

export type EvaluateOutcome = {
  status: "evaluated" | "needs_review" | "pending" | "not_found";
  points?: number;
  balance?: number;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Never throws. Only short generic codes are stored via fail() because
// the owning client can read review_evaluations.last_error.
export async function evaluateAppointment(appointmentId: string, deps: EvaluateDeps): Promise<EvaluateOutcome> {
  let claimed: Awaited<ReturnType<EvaluateDeps["claim"]>>;
  try {
    claimed = await deps.claim(appointmentId);
  } catch (err) {
    console.warn("review evaluation claim failed:", errorMessage(err));
    return { status: "pending" };
  }
  if (!claimed) return { status: "not_found" };
  const { evaluationId, parts } = claimed;

  const failWith = async (code: string, detail: string): Promise<EvaluateOutcome> => {
    console.warn(`review evaluation ${evaluationId} failed (${code}): ${detail}`);
    await deps.fail(evaluationId, code).catch(() => {});
    return { status: "pending" };
  };

  let raw: unknown;
  try {
    const paths = parts.flatMap((p) => p.photos).slice(0, MAX_PHOTOS_TO_AI);
    const images = (await Promise.all(paths.map((p) => deps.downloadPhoto(p)))).filter((i): i is GeminiImage => !!i);
    raw = await deps.grade({ ...buildEvaluationPrompt(parts), images });
  } catch (err) {
    const aborted = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    const code = aborted ? "ai_timeout" : /GEMINI_API_KEY/.test(errorMessage(err)) ? "config_missing" : "ai_error";
    return failWith(code, errorMessage(err));
  }

  const parsed = parseAiEvaluation(raw);
  if (!parsed) return failWith("ai_invalid_response", "AI answer did not match the schema");

  try {
    const applied = await deps.apply(evaluationId, parsed);
    const status = applied.status === "needs_review" ? "needs_review" : applied.status === "evaluated" ? "evaluated" : "pending";
    return { status, points: applied.points, balance: applied.balance };
  } catch (err) {
    return failWith("apply_error", errorMessage(err));
  }
}
