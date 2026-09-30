import { describe, expect, it } from "vitest";
import { parseReviewFilters } from "./adminReviews";

describe("parseReviewFilters", () => {
  it("accepts the flagged status", () => {
    expect(parseReviewFilters({ status: "flagged" }).status).toBe("flagged");
  });

  it("parses photos=1 as true and ignores other values", () => {
    expect(parseReviewFilters({ photos: "1" }).photos).toBe(true);
    expect(parseReviewFilters({ photos: "yes" }).photos).toBeUndefined();
    expect(parseReviewFilters({}).photos).toBeUndefined();
  });
});
