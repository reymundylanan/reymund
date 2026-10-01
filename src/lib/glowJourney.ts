// My Glow → Your Glow Journey: stats, milestones and a visit timeline from
// the client's real completed visits, reviews and payments. Pure.

export type JourneyVisit = {
  id: string;
  date: string; // YYYY-MM-DD
  services: string[];
  staff: string | null;
  branch: string | null;
  reviewed: boolean;
};

export type JourneyInput = {
  visits: JourneyVisit[]; // completed visits
  reviewDates: string[]; // YYYY-MM-DD of each review the client wrote
  totalSpent: number;
};

export type Milestone = { key: string; title: string; detail: string; achieved: boolean; date: string | null };

const VISIT_GOALS = [1, 5, 10, 25, 50];

function mostCommon(values: string[]): { value: string; count: number } | null {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  const top = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return top ? { value: top[0], count: top[1] } : null;
}

export function buildJourney(input: JourneyInput) {
  const visits = [...input.visits].sort((a, b) => a.date.localeCompare(b.date));
  const services = visits.flatMap((v) => v.services);
  const favoriteService = mostCommon(services);
  const favoriteStaff = mostCommon(visits.map((v) => v.staff).filter((s): s is string => !!s));
  const branches = new Set(visits.map((v) => v.branch).filter(Boolean));

  const milestones: Milestone[] = VISIT_GOALS.map((n) => {
    const reached = visits[n - 1];
    return {
      key: `visits-${n}`,
      title: n === 1 ? "First Glow" : `${n} Visits`,
      detail: n === 1 ? "Your first completed visit" : `${n} completed visits`,
      achieved: !!reached,
      date: reached?.date ?? null,
    };
  });
  const firstReview = [...input.reviewDates].sort()[0] ?? null;
  milestones.splice(1, 0, { key: "first-review", title: "First Review", detail: "Shared your experience", achieved: !!firstReview, date: firstReview });
  const triedFive = (() => {
    const seen = new Set<string>();
    for (const v of visits) {
      for (const s of v.services) {
        seen.add(s);
        if (seen.size >= 5) return v.date;
      }
    }
    return null;
  })();
  milestones.push({ key: "explorer", title: "Explorer", detail: "Tried 5 different services", achieved: !!triedFive, date: triedFive });

  const nextGoal = VISIT_GOALS.find((n) => visits.length < n) ?? null;

  return {
    totalVisits: visits.length,
    servicesTried: new Set(services).size,
    favoriteService,
    favoriteStaff,
    branchesVisited: branches.size,
    totalSpent: input.totalSpent,
    firstVisit: visits[0]?.date ?? null,
    milestones,
    nextGoal: nextGoal ? { visits: nextGoal, remaining: nextGoal - visits.length, percent: Math.round((visits.length / nextGoal) * 100) } : null,
    timeline: [...visits].reverse(),
  };
}

export type Journey = ReturnType<typeof buildJourney>;
