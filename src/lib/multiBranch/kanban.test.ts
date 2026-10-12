import { describe, expect, it } from "vitest";
import { kanbanColumn, planStatusChange } from "./kanban";

describe("kanbanColumn", () => {
  it("places each visit by its status", () => {
    expect(kanbanColumn({ status: "pending", sessionStatus: null })).toBe("pending");
    expect(kanbanColumn({ status: "confirmed", sessionStatus: null })).toBe("confirmed");
    expect(kanbanColumn({ status: "confirmed", sessionStatus: "arrived" })).toBe("checked_in");
    expect(kanbanColumn({ status: "confirmed", sessionStatus: "in_service" })).toBe("in_service");
    expect(kanbanColumn({ status: "confirmed", sessionStatus: "paid" })).toBe("completed");
    expect(kanbanColumn({ status: "pending", sessionStatus: "no_show" })).toBe("closed");
    expect(kanbanColumn({ status: "cancelled", sessionStatus: null })).toBe("closed");
  });
});

describe("planStatusChange", () => {
  const today = { isToday: true, clientName: "Maria" };

  it("allows the next steps forward", () => {
    expect(planStatusChange("pending", "confirmed", { ...today, isToday: false })).toMatchObject({ ok: true, action: "confirm" });
    expect(planStatusChange("confirmed", "checked_in", today)).toMatchObject({ ok: true, action: "check_in" });
    expect(planStatusChange("confirmed", "in_service", today)).toMatchObject({ ok: true, action: "start" });
    expect(planStatusChange("in_service", "completed", today)).toMatchObject({ ok: true, action: "complete" });
  });

  it("refuses moves that skip a required step, go backwards, or aren't today", () => {
    expect(planStatusChange("pending", "checked_in", today)).toMatchObject({ ok: false });
    expect(planStatusChange("confirmed", "completed", today)).toMatchObject({ ok: false });
    expect(planStatusChange("in_service", "confirmed", today)).toMatchObject({ ok: false });
    expect(planStatusChange("confirmed", "checked_in", { ...today, isToday: false })).toMatchObject({ ok: false });
    expect(planStatusChange("confirmed", "closed", today)).toMatchObject({ ok: false });
  });
});
