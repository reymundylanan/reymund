export type ReviewTarget = "service" | "staff" | "branch";
export type ReviewStatus = "visible" | "flagged" | "hidden" | "removed";

const MESSAGES: Record<string, string> = {
  REVIEW_INAPPROPRIATE: "Please keep your review respectful and appropriate.",
  REVIEW_DUPLICATE: "You've already reviewed this visit.",
  REVIEW_NOT_ALLOWED: "You can only review completed visits.",
  REVIEW_INVALID: "Please give a 1–5 star rating and keep comments under 1000 characters.",
  REVIEW_BAD_PHOTO: "One of your photos couldn't be used. Please remove it and try again.",
  REVIEW_LOCKED: "This review can no longer be edited.",
  REVIEW_EDIT_EXPIRED: "Reviews can only be edited within 30 days.",
  REVIEW_REPORTED: "You already reported this review.",
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

export function isPublicStatus(s: ReviewStatus): boolean {
  return s === "visible" || s === "flagged";
}

export const EDIT_WINDOW_DAYS = 30;

export function canEditReview(firstSubmittedAt: string, statuses: ReviewStatus[], now: Date = new Date()): boolean {
  if (statuses.some((s) => s === "hidden" || s === "removed")) return false;
  return now.getTime() < Date.parse(firstSubmittedAt) + EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Mirrors the SQL views: "Maria Clara Santos" → "Maria C.". */
export function reviewerName(fullName: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Client";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[1].charAt(0)}.`;
}

export type ReportReason = "spam" | "offensive" | "inappropriate_photo" | "fake" | "other";
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "offensive", label: "Offensive content" },
  { value: "inappropriate_photo", label: "Inappropriate photo" },
  { value: "fake", label: "Fake/misleading review" },
  { value: "other", label: "Other" },
];

export type StarFilter = "all" | 1 | 2 | 3 | 4 | 5 | "photos";
export function parseStarFilter(v: string | null): StarFilter {
  if (v === "photos") return "photos";
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as StarFilter) : "all";
}
