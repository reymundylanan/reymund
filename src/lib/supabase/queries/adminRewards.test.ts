import { describe, expect, it } from "vitest";
import { computeRewardStats, validateSettings, type RewardSettings } from "./adminRewards";

const OK: RewardSettings = {
  ratingPoints: 10,
  meaningfulPoints: 10,
  specificPoints: 10,
  relevantPoints: 10,
  photoPoints: 10,
  partialRatio: 0.5,
  maxPoints: 50,
  enabled: true,
};

const POINTS = "Points must be whole numbers from 0 to 1000.";
const PARTIAL = "Partial must be between 0% and 100%.";
const MAX = "Max points must be a whole number from 0 to 5000.";

describe("validateSettings", () => {
  it("accepts the defaults", () => {
    expect(validateSettings(OK)).toBeNull();
  });
  it("accepts the bounds", () => {
    expect(validateSettings({ ...OK, ratingPoints: 0, photoPoints: 1000, partialRatio: 0, maxPoints: 5000 })).toBeNull();
    expect(validateSettings({ ...OK, partialRatio: 1, maxPoints: 0 })).toBeNull();
  });
  it("rejects bad points values", () => {
    for (const key of ["ratingPoints", "meaningfulPoints", "specificPoints", "relevantPoints", "photoPoints"] as const) {
      expect(validateSettings({ ...OK, [key]: -1 })).toBe(POINTS);
      expect(validateSettings({ ...OK, [key]: 1001 })).toBe(POINTS);
      expect(validateSettings({ ...OK, [key]: 2.5 })).toBe(POINTS);
      expect(validateSettings({ ...OK, [key]: NaN })).toBe(POINTS);
    }
  });
  it("rejects a partial ratio outside 0-1", () => {
    expect(validateSettings({ ...OK, partialRatio: -0.1 })).toBe(PARTIAL);
    expect(validateSettings({ ...OK, partialRatio: 1.01 })).toBe(PARTIAL);
    expect(validateSettings({ ...OK, partialRatio: NaN })).toBe(PARTIAL);
  });
  it("rejects bad max points", () => {
    expect(validateSettings({ ...OK, maxPoints: -1 })).toBe(MAX);
    expect(validateSettings({ ...OK, maxPoints: 5001 })).toBe(MAX);
    expect(validateSettings({ ...OK, maxPoints: 10.5 })).toBe(MAX);
  });
});

describe("computeRewardStats", () => {
  it("counts only review_reward rows and averages their points", () => {
    const stats = computeRewardStats([
      { type: "review_reward", points: 30 },
      { type: "review_reward", points: 40 },
      { type: "admin_adjustment", points: 20 },
    ]);
    expect(stats).toEqual({ pointsThisMonth: 90, reviewsRewarded: 2, averagePoints: 35 });
  });
  it("handles no rewards", () => {
    expect(computeRewardStats([{ type: "admin_adjustment", points: 10 }])).toEqual({ pointsThisMonth: 10, reviewsRewarded: 0, averagePoints: 0 });
  });
});
