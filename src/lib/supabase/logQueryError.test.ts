import { afterEach, describe, expect, it, vi } from "vitest";
import { isNotMigratedError, logQueryError } from "./logQueryError";

afterEach(() => vi.restoreAllMocks());

describe("logQueryError", () => {
  it("treats missing tables/views/columns as not migrated", () => {
    expect(isNotMigratedError({ code: "PGRST205" })).toBe(true);
    expect(isNotMigratedError({ code: "42703" })).toBe(true);
    expect(isNotMigratedError({ code: "PGRST200" })).toBe(true);
    expect(isNotMigratedError({ code: "23505" })).toBe(false);
    expect(isNotMigratedError(null)).toBe(false);
  });

  it("warns once per label for a missing table, never console.error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logQueryError("testLabelA", { code: "PGRST205", message: "Could not find the table" });
    logQueryError("testLabelA", { code: "PGRST205", message: "Could not find the table" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("logs real errors as readable text instead of {}", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logQueryError("testLabelB", { code: "42501", message: "permission denied" });
    expect(error).toHaveBeenCalledWith("testLabelB failed: permission denied [42501]");
  });

  it("does nothing without an error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logQueryError("testLabelC", null);
    expect(error).not.toHaveBeenCalled();
  });
});
