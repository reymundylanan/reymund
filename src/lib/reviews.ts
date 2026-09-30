export type ReviewTarget = "service" | "staff" | "branch";
export type ReviewStatus = "visible" | "hidden" | "removed";

const MESSAGES: Record<string, string> = {
  REVIEW_INAPPROPRIATE: "Please keep your review respectful and appropriate.",
  REVIEW_DUPLICATE: "You've already reviewed this visit.",
  REVIEW_NOT_ALLOWED: "You can only review completed visits.",
  REVIEW_INVALID: "Please give a 1–5 star rating and keep comments under 1000 characters.",
};

/** Maps a Supabase RPC error (whose message is a REVIEW_* code) to client text. */
export function reviewErrorMessage(err: { message?: string } | null | undefined): string {
  const code = err?.message?.trim() ?? "";
  return MESSAGES[code] ?? "Couldn't submit your review. Please try again.";
}

export function summarizeRatings(ratings: number[]) {
  const counts = new Map<number, number>([5, 4, 3, 2, 1].map((s) => [s, 0]));
  let total = 0;
  for (const r of ratings) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
    total += r;
  }
  return {
    average: ratings.length ? Math.round((total / ratings.length) * 10) / 10 : 0,
    count: ratings.length,
    breakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.get(stars) ?? 0 })),
  };
}
