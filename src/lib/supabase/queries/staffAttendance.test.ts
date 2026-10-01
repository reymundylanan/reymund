import { describe, expect, it } from "vitest";
import { breakErrorMessage } from "./staffAttendance";

describe("breakErrorMessage", () => {
  it("explains refusals from the break functions", () => {
    expect(breakErrorMessage("BREAK_FORBIDDEN: this staff member is clocked in at another branch")).toBe(
      "Not allowed: this staff member is clocked in at another branch."
    );
    expect(breakErrorMessage("BREAK_INVALID: punch in before starting a break")).toBe("Punch in before starting a break.");
    expect(breakErrorMessage("something else")).toBe("something else");
  });
});
