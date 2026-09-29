import { describe, expect, it } from "vitest";
import { reviewErrorMessage, summarizeRatings } from "./reviews";

describe("reviewErrorMessage", () => {
  it.each([
    ["REVIEW_INAPPROPRIATE", "Please keep your review respectful and appropriate."],
    ["REVIEW_DUPLICATE", "You've already reviewed this visit."],
    ["REVIEW_NOT_ALLOWED", "You can only review completed visits."],
    ["REVIEW_INVALID", "Please give a 1–5 star rating and keep comments under 1000 characters."],
    ["something else", "Couldn't submit your review. Please try again."],
  ])("%s", (code, message) => {
    expect(reviewErrorMessage({ message: code })).toBe(message);
  });

  it("handles a missing error", () => {
    expect(reviewErrorMessage(null)).toBe("Couldn't submit your review. Please try again.");
  });
});

describe("summarizeRatings", () => {
  it("averages to one decimal with a 5→1 breakdown", () => {
    expect(summarizeRatings([5, 4, 4, 1])).toEqual({
      average: 3.5,
      count: 4,
      breakdown: [
        { stars: 5, count: 1 },
        { stars: 4, count: 2 },
        { stars: 3, count: 0 },
        { stars: 2, count: 0 },
        { stars: 1, count: 1 },
      ],
    });
  });

  it("returns zeros for no ratings", () => {
    expect(summarizeRatings([]).average).toBe(0);
    expect(summarizeRatings([]).count).toBe(0);
  });
});
