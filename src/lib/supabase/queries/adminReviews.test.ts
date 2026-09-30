import { describe, expect, it } from "vitest";
import { parseReviewFilters, reviewSearchFilter } from "./adminReviews";

describe("reviewSearchFilter", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("searches only the comment when no client matches", () => {
    expect(reviewSearchFilter("great", [])).toBe('text.ilike."%great%"');
  });
  it("also matches the reviewers whose name matched", () => {
    expect(reviewSearchFilter("maria", [id])).toBe(`text.ilike."%maria%",client_id.in.(${id})`);
  });
  it("quotes commas and escapes LIKE wildcards and quotes", () => {
    expect(reviewSearchFilter('a,b_"c"', [])).toBe('text.ilike."%a,b\\\\_\\"c\\"%"');
  });
  it("drops ids that are not uuids", () => {
    expect(reviewSearchFilter("x", ["1),(2", id])).toBe(`text.ilike."%x%",client_id.in.(${id})`);
  });
});

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
