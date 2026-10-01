import { describe, expect, it } from "vitest";
import { HIGH_SPEND_MIN, filterClients, formatVisitDate, matchesClientSearch, statsFromVisits } from "./clientDirectory";

const ana = { name: "Ana Cruz", phone: "+63 917 123 4567", email: "ana@x.com", vip: true, totalSpend: 12000 };
const ben = { name: "Ben Lee", phone: "09981112222", email: null, vip: false, totalSpend: 6000 };
const cy = { name: "Cy Tan", phone: null, email: null, vip: false, totalSpend: 0 };

describe("client directory", () => {
  it("searches name, email and phone in any format", () => {
    expect(matchesClientSearch(ana, "ana")).toBe(true);
    expect(matchesClientSearch(ana, "ANA@X")).toBe(true);
    expect(matchesClientSearch(ana, "0917 123")).toBe(true);
    expect(matchesClientSearch(ana, "+639171234567")).toBe(true);
    expect(matchesClientSearch(ana, "4567")).toBe(true);
    expect(matchesClientSearch(ana, "12")).toBe(false);
    expect(matchesClientSearch(cy, "0917")).toBe(false);
    expect(matchesClientSearch(cy, "  ")).toBe(true);
  });

  it("filters VIP only and high spend (biggest first)", () => {
    const all = [cy, ben, ana];
    expect(filterClients(all, { query: "", vipOnly: true, highSpend: false })).toEqual([ana]);
    expect(filterClients(all, { query: "", vipOnly: false, highSpend: true })).toEqual([ana, ben]);
    expect(filterClients(all, { query: "", vipOnly: true, highSpend: true })).toEqual([ana]);
    expect(filterClients(all, { query: "", vipOnly: false, highSpend: false })).toEqual(all);
    expect(HIGH_SPEND_MIN).toBe(5000);
  });

  it("counts visits from history as a fallback", () => {
    const stats = statsFromVisits(
      [
        { scheduledDate: "2026-09-30", completed: true },
        { scheduledDate: "2026-01-02", completed: true },
        { scheduledDate: "2025-12-01", completed: true },
        { scheduledDate: "2026-10-01", completed: false },
      ],
      new Date(2026, 9, 1)
    );
    expect(stats).toEqual({ totalVisits: 3, visitsThisYear: 2, lastVisit: "2026-09-30" });
  });

  it("formats dates without timezone drift", () => {
    expect(formatVisitDate("2026-09-30")).toBe("Sep 30, 2026");
    expect(formatVisitDate(null)).toBe("—");
  });
});
