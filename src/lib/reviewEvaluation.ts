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

export async function evaluateAppointment(appointmentId: string, deps: EvaluateDeps): Promise<EvaluateOutcome> {
  const claimed = await deps.claim(appointmentId);
  if (!claimed) return { status: "not_found" };
  const { evaluationId, parts } = claimed;
  try {
    const paths = parts.flatMap((p) => p.photos).slice(0, MAX_PHOTOS_TO_AI);
    const images = (await Promise.all(paths.map((p) => deps.downloadPhoto(p)))).filter((i): i is GeminiImage => !!i);
    const prompt = buildEvaluationPrompt(parts);
    const parsed = parseAiEvaluation(await deps.grade({ ...prompt, images }));
    if (!parsed) {
      await deps.fail(evaluationId, "invalid AI response");
      return { status: "pending" };
    }
    const applied = await deps.apply(evaluationId, parsed);
    const status = applied.status === "needs_review" ? "needs_review" : applied.status === "evaluated" ? "evaluated" : "pending";
    return { status, points: applied.points, balance: applied.balance };
  } catch (err) {
    await deps.fail(evaluationId, err instanceof Error ? err.message : String(err)).catch(() => {});
    return { status: "pending" };
  }
}
