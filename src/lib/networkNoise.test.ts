import { afterEach, describe, expect, it, vi } from "vitest";
import { isNetworkDrop, quietNetworkDrops } from "./networkNoise";

describe("isNetworkDrop", () => {
  it("recognises the browser's connection errors", () => {
    expect(isNetworkDrop(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkDrop(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkDrop(Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError" }))).toBe(true);
  });

  it("leaves real errors alone", () => {
    expect(isNetworkDrop(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isNetworkDrop(new Error("Failed to fetch"))).toBe(false); // not a network error type
    expect(isNetworkDrop("Failed to fetch")).toBe(false);
    expect(isNetworkDrop(null)).toBe(false);
  });
});

describe("quietNetworkDrops", () => {
  afterEach(() => vi.restoreAllMocks());

  it("turns repeated connection drops into one warning, and passes other errors through", () => {
    const original = vi.fn();
    console.error = original;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("window", {});
    quietNetworkDrops();
    console.error(new TypeError("Failed to fetch"));
    console.error(new TypeError("Failed to fetch"));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(original).not.toHaveBeenCalled();
    console.error("Something real broke", new Error("boom"));
    expect(original).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
