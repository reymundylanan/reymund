// GlowSync AI introducing a team member (home page "Meet the Team"). Built
// only from real data: department, branch, ratings, reviews and the services
// their department offers at their branch. Pure so it can be tested.

export type StaffQuote = { text: string; reviewer: string; rating: number };

export type StaffGuideInput = {
  fullName: string;
  department: string;
  branchName: string | null;
  average: number;
  count: number;
  quote: StaffQuote | null;
  /** Service categories their department offers at their branch, most services first. */
  categories: string[];
};

export type StaffFacts = {
  hook: string;
  intro: string;
  why: string;
  specialties: string;
  quote: string | null;
  meta: string[];
};

const HOOKS: Record<string, string> = {
  Hair: "Ready for your best hair day? 💇‍♀️",
  Nails: "Perfect nails, every time 💅",
  Clinic: "Glowing skin starts here ✨",
};

/** "A", "A and B", "A, B and C". */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function trimQuote(text: string, max = 110): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function staffFacts(s: StaffGuideInput): StaffFacts {
  const where = s.branchName ? ` at ${s.branchName}` : "";
  const why =
    s.count > 0
      ? `Clients rate ${s.fullName} ${s.average.toFixed(1)}★ from ${s.count} review${s.count === 1 ? "" : "s"}${s.average >= 4.5 ? " — a client favorite!" : "."}`
      : `${s.fullName} is new to reviews — book a visit and be one of the first to share your experience!`;
  const top = s.categories.slice(0, 3);
  const specialties = top.length
    ? `Book ${s.fullName} for ${listJoin(top)}${s.categories.length > 3 ? " and more" : ""}.`
    : `Book ${s.fullName} for our ${s.department} services.`;
  return {
    hook: HOOKS[s.department] ?? "Meet one of our experts ✨",
    intro: `Let me introduce ${s.fullName}! Part of our ${s.department} team${where}.`,
    why,
    specialties,
    quote: s.quote ? `“${trimQuote(s.quote.text)}” — ${s.quote.reviewer}` : null,
    meta: [s.department, s.branchName ?? "", s.count > 0 ? `★ ${s.average.toFixed(1)} (${s.count})` : ""].filter(Boolean),
  };
}

/** The newest review worth quoting: 4★ or more, with words in it. */
export function pickQuote(reviews: { rating: number; text: string | null; reviewer: string; createdAt: string }[]): StaffQuote | null {
  const good = reviews
    .filter((r) => r.rating >= 4 && (r.text ?? "").trim().length >= 8)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return good ? { text: good.text!.trim(), reviewer: good.reviewer, rating: good.rating } : null;
}
