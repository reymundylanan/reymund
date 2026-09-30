import { describe, expect, it } from "vitest";
import { canEditReview, parseStarFilter, reviewErrorMessage, reviewerName, isPublicStatus, summarizeRatings } from "./reviews";

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

describe("review helpers", () => {
  it("maps new error codes", () => {
    expect(reviewErrorMessage({ message: "REVIEW_BAD_PHOTO" })).toBe("One of your photos couldn't be used. Please remove it and try again.");
    expect(reviewErrorMessage({ message: "REVIEW_LOCKED" })).toBe("This review can no longer be edited.");
    expect(reviewErrorMessage({ message: "REVIEW_EDIT_EXPIRED" })).toBe("Reviews can only be edited within 30 days.");
    expect(reviewErrorMessage({ message: "REVIEW_REPORTED" })).toBe("You already reported this review.");
  });
  it("edit window is 30 days and locked by hidden/removed", () => {
    const now = new Date("2026-10-30T00:00:00Z");
    expect(canEditReview("2026-10-01T00:00:01Z", ["visible"], now)).toBe(true);
    expect(canEditReview("2026-09-30T00:00:00Z", ["visible"], now)).toBe(false);
    expect(canEditReview("2026-10-20T00:00:00Z", ["visible", "hidden"], now)).toBe(false);
    expect(canEditReview("2026-10-20T00:00:00Z", ["flagged"], now)).toBe(true);
  });
  it("shows first name + initial", () => {
    expect(reviewerName("Maria Clara Santos")).toBe("Maria C.");
    expect(reviewerName("Cher")).toBe("Cher");
    expect(reviewerName("  ")).toBe("Client");
    expect(reviewerName(null)).toBe("Client");
  });
  it("parses star filters", () => {
    expect(parseStarFilter("4")).toBe(4);
    expect(parseStarFilter("photos")).toBe("photos");
    expect(parseStarFilter("9")).toBe("all");
    expect(parseStarFilter(null)).toBe("all");
  });
  it("public statuses", () => {
    expect(isPublicStatus("flagged")).toBe(true);
    expect(isPublicStatus("hidden")).toBe(false);
  });
});
