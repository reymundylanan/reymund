/** What GlowSync AI says when it introduces a branch on the About page.
 * Built only from real data about that branch (no invented claims). */

export type BranchStats = {
  name: string;
  /** Short place for sentences ("One Cecilia Center", "Robinsons Mall"). */
  place: string;
  hours: string | null;
  services: number;
  /** Departments offered, biggest first (e.g. "Facial", "Hair"). */
  departments: string[];
  staff: number;
  livePromos: number;
  /** A live promo's title to mention, if any. */
  promoTitle: string | null;
  rating: number | null;
  reviews: number;
  /** "flagship" or "mall" — from the branch's own description. */
  kind: "flagship" | "mall" | "branch";
};

export type BranchPitch = { hook: string; intro: string; why: string; highlights: string[] };

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function branchPitch(s: BranchStats): BranchPitch {
  const hook =
    s.kind === "flagship" ? "Our flagship glow spot ✨" : s.kind === "mall" ? "Pamper break, right in the mall 🛍️" : `Hello from ${s.place}! ✨`;

  const what = s.departments.length ? list(s.departments.slice(0, 3).map((d) => d.toLowerCase())) : "beauty and wellness";
  const intro =
    s.kind === "mall"
      ? `Let me show you our ${s.name} branch — perfect for a treat while you're out in the city. Choose from ${s.services} services, from ${what}.`
      : `Let me introduce our ${s.name} branch! ${s.services} services under one roof — ${what} and more — with our certified team.`;

  const reasons: string[] = [];
  if (s.rating && s.reviews > 0) reasons.push(`clients rate it ${s.rating.toFixed(1)}★ from ${s.reviews} review${s.reviews === 1 ? "" : "s"}`);
  if (s.staff > 0) reasons.push(`${s.staff} specialist${s.staff === 1 ? "" : "s"} ready for you`);
  if (s.livePromos > 0) reasons.push(`${s.livePromos} live promo${s.livePromos === 1 ? "" : "s"}${s.promoTitle ? `, like ${s.promoTitle}` : ""}`);
  const why = reasons.length ? `${reasons[0][0].toUpperCase()}${reasons[0].slice(1)}${reasons.length > 1 ? `, ${list(reasons.slice(1))}` : ""}.` : "Book a visit and see why our clients keep coming back.";

  const highlights = [
    s.hours ? `Open daily · ${s.hours}` : "Open daily",
    `${s.services} services`,
    ...(s.livePromos ? [`${s.livePromos} live promos`] : []),
  ];
  return { hook, intro, why, highlights };
}
