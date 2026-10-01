import { describe, expect, it } from "vitest";
import { buildJourney, type JourneyVisit } from "./glowJourney";

const v = (date: string, services: string[], staff = "Ms. Mary", branch = "One Cecilia"): JourneyVisit => ({ id: date + services.join(), date, services, staff, branch, reviewed: false });

describe("buildJourney", () => {
  it("computes stats and milestones from real visits", () => {
    const j = buildJourney({
      visits: [
        v("2026-09-01", ["Facial"]),
        v("2026-09-10", ["Facial", "Massage"], "Ms. Gema"),
        v("2026-09-20", ["Nails"]),
        v("2026-09-25", ["Facial"], "Ms. Mary", "Robinsons"),
        v("2026-09-28", ["Hair", "Lashes"]),
      ],
      reviewDates: ["2026-09-12", "2026-09-05"],
      totalSpent: 5000,
    });
    expect(j.totalVisits).toBe(5);
    expect(j.servicesTried).toBe(5);
    expect(j.favoriteService).toEqual({ value: "Facial", count: 3 });
    expect(j.favoriteStaff).toEqual({ value: "Ms. Mary", count: 4 });
    expect(j.branchesVisited).toBe(2);
    expect(j.firstVisit).toBe("2026-09-01");
    const m = Object.fromEntries(j.milestones.map((x) => [x.key, x]));
    expect(m["visits-1"]).toMatchObject({ achieved: true, date: "2026-09-01" });
    expect(m["first-review"]).toMatchObject({ achieved: true, date: "2026-09-05" });
    expect(m["visits-5"]).toMatchObject({ achieved: true, date: "2026-09-28" });
    expect(m["visits-10"].achieved).toBe(false);
    expect(m.explorer).toMatchObject({ achieved: true, date: "2026-09-28" });
    expect(j.nextGoal).toEqual({ visits: 10, remaining: 5, percent: 50 });
    expect(j.timeline[0].date).toBe("2026-09-28");
  });

  it("handles a brand-new client", () => {
    const j = buildJourney({ visits: [], reviewDates: [], totalSpent: 0 });
    expect(j.totalVisits).toBe(0);
    expect(j.favoriteService).toBeNull();
    expect(j.nextGoal).toEqual({ visits: 1, remaining: 1, percent: 0 });
    expect(j.milestones.every((m) => !m.achieved)).toBe(true);
  });
});
