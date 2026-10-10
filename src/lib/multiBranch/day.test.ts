import { describe, expect, it } from "vitest";
import { layoutLanes, visitState } from "./day";

describe("layoutLanes", () => {
  it("keeps non-overlapping visits full width", () => {
    const out = layoutLanes([
      { id: "a", start: 600, duration: 60 },
      { id: "b", start: 660, duration: 60 },
    ]);
    expect(out.map((o) => [o.id, o.lane, o.lanes])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
    ]);
  });

  it("puts overlapping visits side by side and reuses free lanes", () => {
    const out = layoutLanes([
      { id: "long", start: 600, duration: 180 },
      { id: "x", start: 630, duration: 30 },
      { id: "y", start: 690, duration: 30 },
    ]);
    const by = Object.fromEntries(out.map((o) => [o.id, o]));
    expect(by.long.lane).toBe(0);
    expect(by.x.lane).toBe(1);
    expect(by.y.lane).toBe(1);
    expect(out.every((o) => o.lanes === 2)).toBe(true);
  });
});

describe("visitState", () => {
  it("labels each state", () => {
    expect(visitState({ status: "confirmed", sessionStatus: "in_service" }).label).toBe("In service");
    expect(visitState({ status: "confirmed", sessionStatus: "no_show" }).label).toBe("No-show");
    expect(visitState({ status: "confirmed", sessionStatus: "paid" }).label).toBe("Done");
    expect(visitState({ status: "pending", sessionStatus: null }).label).toBe("Pending");
    expect(visitState({ status: "cancelled", sessionStatus: null }).label).toBe("Cancelled");
  });
});
