import { describe, expect, it } from "vitest";
import { NO_BRANCH, departmentSummary, formatDateRuns, groupByColumn } from "./branchBoard";

describe("groupByColumn", () => {
  it("puts people in their branch, and unknown or missing branches in No branch", () => {
    const cols = groupByColumn(
      [
        { id: "a", branchId: "b1" },
        { id: "b", branchId: null },
        { id: "c", branchId: "gone" },
        { id: "d", branchId: "b2" },
      ],
      ["b1", "b2", "b3"]
    );
    expect(cols.b1.map((x) => x.id)).toEqual(["a"]);
    expect(cols.b2.map((x) => x.id)).toEqual(["d"]);
    expect(cols.b3).toEqual([]);
    expect(cols[NO_BRANCH].map((x) => x.id)).toEqual(["b", "c"]);
  });
});

describe("departmentSummary", () => {
  it("lists the biggest departments first", () => {
    expect(departmentSummary(["Nails", "Massage", "Massage", null])).toBe("2 Massage · 1 Nails · 1 Other");
  });
  it("caps the list", () => {
    expect(departmentSummary(["A", "B", "C", "D", "E"], 2)).toBe("1 A · 1 B · +3 more");
  });
  it("is empty for no one", () => {
    expect(departmentSummary([])).toBe("");
  });
});

describe("formatDateRuns", () => {
  it("collapses consecutive days", () => {
    expect(formatDateRuns(["2026-10-14", "2026-10-12", "2026-10-13", "2026-10-20"])).toBe("Oct 12–14, 20");
  });
  it("splits months and handles runs across months", () => {
    expect(formatDateRuns(["2026-10-31", "2026-11-01", "2026-11-05"])).toBe("Oct 31–Nov 1, 5");
    expect(formatDateRuns(["2026-10-02", "2026-11-05"])).toBe("Oct 2 · Nov 5");
  });
  it("ignores duplicates", () => {
    expect(formatDateRuns(["2026-10-02", "2026-10-02"])).toBe("Oct 2");
  });
});
