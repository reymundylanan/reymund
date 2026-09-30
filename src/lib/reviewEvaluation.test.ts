import { describe, expect, it, vi } from "vitest";
import { evaluateAppointment, MAX_PHOTOS_TO_AI, type EvaluateDeps } from "./reviewEvaluation";
import type { EvaluationPart } from "./reviewRewards";

const grade = { result: "pass", confidence: "high", reason: "ok" };
const goodAi = { rating: grade, meaningful: grade, specific: grade, relevant: grade, photo: grade, summary: "Talks about the visit." };

function part(photos: string[]): EvaluationPart {
  return { target: "service", position: 0, service: "Massage", rating: 5, text: "Great", tags: [], photos };
}

function makeDeps(over: Partial<EvaluateDeps> & { photos?: string[] } = {}) {
  const { photos = ["a.jpg", "b.jpg"], ...rest } = over;
  const deps = {
    claim: vi.fn(async () => ({ evaluationId: "ev1", parts: [part(photos)] })),
    downloadPhoto: vi.fn(async (p: string) => ({ mimeType: "image/jpeg", base64: p })),
    grade: vi.fn(async () => goodAi as unknown),
    apply: vi.fn(async () => ({ status: "evaluated", points: 50, balance: 70, applied: true })),
    fail: vi.fn(async () => {}),
    ...rest,
  };
  return deps as typeof deps & EvaluateDeps;
}

describe("evaluateAppointment", () => {
  it("grades, applies and returns the outcome", async () => {
    const deps = makeDeps();
    const out = await evaluateAppointment("ap1", deps);
    expect(out).toEqual({ status: "evaluated", points: 50, balance: 70 });
    expect(deps.downloadPhoto).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.grade).mock.calls[0][0].images).toHaveLength(2);
    expect(deps.apply).toHaveBeenCalledWith("ev1", expect.objectContaining({ summary: "Talks about the visit." }));
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it("returns not_found when nothing can be claimed", async () => {
    const deps = makeDeps({ claim: vi.fn(async () => null) });
    expect(await evaluateAppointment("ap1", deps)).toEqual({ status: "not_found" });
    expect(deps.grade).not.toHaveBeenCalled();
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it("records a failure and stays pending when grading throws", async () => {
    const deps = makeDeps({ grade: vi.fn(async () => { throw new Error("timeout"); }) });
    expect(await evaluateAppointment("ap1", deps)).toEqual({ status: "pending" });
    expect(deps.fail).toHaveBeenCalledWith("ev1", "timeout");
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it("records a failure when the AI answer is junk", async () => {
    const deps = makeDeps({ grade: vi.fn(async () => "not json") });
    expect(await evaluateAppointment("ap1", deps)).toEqual({ status: "pending" });
    expect(deps.fail).toHaveBeenCalledWith("ev1", "invalid AI response");
    expect(deps.apply).not.toHaveBeenCalled();
  });

  it("does not fail when a concurrent call already applied", async () => {
    const deps = makeDeps({ apply: vi.fn(async () => ({ status: "needs_review", points: 0, balance: 5, applied: false })) });
    expect(await evaluateAppointment("ap1", deps)).toEqual({ status: "needs_review", points: 0, balance: 5 });
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it("caps photos sent to the AI and skips failed downloads", async () => {
    const many = Array.from({ length: MAX_PHOTOS_TO_AI + 4 }, (_, i) => `p${i}.jpg`);
    const deps = makeDeps({
      photos: many,
      downloadPhoto: vi.fn(async (p: string) => (p === "p1.jpg" ? null : { mimeType: "image/jpeg", base64: p })),
    });
    await evaluateAppointment("ap1", deps);
    expect(deps.downloadPhoto).toHaveBeenCalledTimes(MAX_PHOTOS_TO_AI);
    expect(vi.mocked(deps.grade).mock.calls[0][0].images).toHaveLength(MAX_PHOTOS_TO_AI - 1);
  });
});
