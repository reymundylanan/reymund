import { describe, expect, it } from "vitest";
import { addDaysKey, dayLabel, donutSegments, lastDays, manilaKey, niceMax, pctChange, pesoShort } from "./adminOverview";

describe("adminOverview helpers", () => {
  it("uses Manila dates", () => {
    expect(manilaKey(new Date("2026-09-30T17:00:00Z"))).toBe("2026-10-01");
    expect(manilaKey(new Date("2026-09-30T15:59:00Z"))).toBe("2026-09-30");
  });

  it("walks days across months", () => {
    expect(addDaysKey("2026-10-01", -1)).toBe("2026-09-30");
    expect(lastDays("2026-10-02", 3)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(dayLabel("2026-10-02")).toBe("Oct 2");
  });

  it("computes change and axis tops", () => {
    expect(pctChange(112, 100)).toBe(12);
    expect(pctChange(5, 0)).toBeNull();
    expect(niceMax(18450)).toBe(20000);
    expect(niceMax(0)).toBe(1000);
    expect(niceMax(30000)).toBe(50000);
    expect(pesoShort(18450.4)).toBe("₱18,450");
  });

  it("splits a donut", () => {
    const segs = donutSegments(
      [
        { label: "A", value: 3, color: "x" },
        { label: "B", value: 1, color: "y" },
      ],
      100
    );
    expect(segs.map((s) => [s.dash, s.offset, s.pct])).toEqual([
      [75, 0, 75],
      [25, 75, 25],
    ]);
    expect(donutSegments([{ label: "A", value: 0, color: "x" }], 100)[0].dash).toBe(0);
  });
});
