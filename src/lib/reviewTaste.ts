/**
 * What a client's own reviews say about their taste — so recommendations line
 * up with what they loved (and steer away from what they didn't).
 * Pure; the query that feeds it lives in queries/reviewTaste.ts.
 */

export type TasteReview = {
  targetType: "service" | "staff" | "branch" | string;
  rating: number;
  text: string | null;
  tags: string[];
  serviceName: string | null;
  serviceCategory: string | null;
  staffName: string | null;
  createdAt: string;
};

export type ReviewTaste = {
  /** Services rated 4–5★, best first. */
  loved: { name: string; category: string | null; rating: number; quote: string | null }[];
  /** Services rated 1–2★. */
  disliked: { name: string; category: string | null; rating: number }[];
  /** Categories by average rating (≥ 4), best first. */
  lovedCategories: string[];
  /** Categories they rated poorly on average (≤ 2.5) and never loved. */
  avoidCategories: string[];
  /** Staff they rated 4–5★ / 1–2★. */
  favouriteStaff: string[];
  avoidStaff: string[];
  /** Most used review tags (e.g. "Relaxing", "Great value"). */
  tags: string[];
  count: number;
};

const LOVED = 4;
const POOR = 2;

/** One short quote from a review (first sentence, ≤ 90 chars). */
function shortQuote(text: string | null): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 4) return null;
  const first = t.split(/(?<=[.!?])\s/)[0];
  return first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;
}

export function summarizeReviewTaste(reviews: TasteReview[]): ReviewTaste {
  const sorted = [...reviews].sort((a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt));
  const services = sorted.filter((r) => r.targetType === "service" && r.serviceName);

  const seen = new Set<string>();
  const loved: ReviewTaste["loved"] = [];
  const disliked: ReviewTaste["disliked"] = [];
  for (const r of services) {
    const key = r.serviceName!.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.rating >= LOVED) loved.push({ name: r.serviceName!, category: r.serviceCategory, rating: r.rating, quote: shortQuote(r.text) });
    else if (r.rating <= POOR) disliked.push({ name: r.serviceName!, category: r.serviceCategory, rating: r.rating });
  }

  const byCategory = new Map<string, number[]>();
  for (const r of services) {
    if (!r.serviceCategory) continue;
    byCategory.set(r.serviceCategory, [...(byCategory.get(r.serviceCategory) ?? []), r.rating]);
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const categories = [...byCategory.entries()].map(([c, xs]) => ({ c, avg: avg(xs), n: xs.length }));
  const lovedCategories = categories.filter((x) => x.avg >= LOVED).sort((a, b) => b.avg - a.avg || b.n - a.n).map((x) => x.c);
  const avoidCategories = categories.filter((x) => x.avg <= 2.5 && !lovedCategories.includes(x.c)).map((x) => x.c);

  const staffRatings = new Map<string, number[]>();
  for (const r of sorted) {
    if (r.targetType !== "staff" || !r.staffName) continue;
    staffRatings.set(r.staffName, [...(staffRatings.get(r.staffName) ?? []), r.rating]);
  }
  const favouriteStaff = [...staffRatings.entries()].filter(([, xs]) => avg(xs) >= LOVED).map(([n]) => n);
  const avoidStaff = [...staffRatings.entries()].filter(([, xs]) => avg(xs) <= POOR).map(([n]) => n);

  const tagCount = new Map<string, number>();
  for (const r of sorted) for (const t of r.tags ?? []) if (r.rating >= LOVED) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);

  return { loved, disliked, lovedCategories, avoidCategories, favouriteStaff, avoidStaff, tags, count: reviews.length };
}

/** Lines for the assistant's context, or "" when they haven't reviewed anything. */
export function tasteContext(t: ReviewTaste): string {
  if (t.count === 0) return "";
  const lines = ["What this customer's own reviews say (use it to personalise recommendations):"];
  if (t.loved.length)
    lines.push(
      `- Loved: ${t.loved
        .slice(0, 4)
        .map((l) => `${l.name} (${l.rating}★${l.quote ? `, "${l.quote}"` : ""})`)
        .join("; ")}.`
    );
  if (t.lovedCategories.length) lines.push(`- Favourite kinds of treatment: ${t.lovedCategories.join(", ")}.`);
  if (t.tags.length) lines.push(`- What they enjoy most: ${t.tags.join(", ")}.`);
  if (t.favouriteStaff.length) lines.push(`- Staff they rated highly: ${t.favouriteStaff.join(", ")}.`);
  if (t.disliked.length) lines.push(`- Didn't enjoy: ${t.disliked.map((d) => `${d.name} (${d.rating}★)`).join(", ")}.`);
  if (t.avoidStaff.length) lines.push(`- Staff they rated low: ${t.avoidStaff.join(", ")}.`);
  lines.push(
    "Align recommendations with these reviews: prefer services similar to what they loved (same kind of treatment or a natural next step), " +
      "and say why in a few words (e.g. \"since you loved your …\"). Don't push services or staff they rated low unless they ask. " +
      "Never quote a review they didn't write."
  );
  return lines.join("\n");
}

/** A short "why" for a recommended service, based on their reviews (or null). */
export function reasonFromTaste(t: ReviewTaste, s: { name: string; category: string | null }): string | null {
  const same = t.loved.find((l) => l.name.toLowerCase() === s.name.toLowerCase());
  if (same) return `You rated it ${same.rating}★`;
  const sameCategory = s.category ? t.loved.find((l) => l.category === s.category) : undefined;
  if (sameCategory) return `Because you loved ${sameCategory.name}`;
  return null;
}
