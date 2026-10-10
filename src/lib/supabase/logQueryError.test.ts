import { afterEach, describe, expect, it, vi } from "vitest";
import { isNetworkError, logQueryError } from "./logQueryError";

afterEach(() => vi.restoreAllMocks());

describe("logQueryError", () => {
  it("recognises a dropped connection", () => {
    expect(isNetworkError({ message: "TypeError: fetch failed" })).toBe(true);
    expect(isNetworkError({ message: "permission denied for table x", code: "42501" })).toBe(false);
  });

  it("warns once for an outage instead of an error per query", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logQueryError("a", { message: "TypeError: fetch failed" });
    logQueryError("b", { message: "TypeError: fetch failed" });
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("still reports real query errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logQueryError("c", { message: "permission denied", code: "42501" });
    expect(error).toHaveBeenCalledWith("c failed: permission denied [42501]");
  });
});
