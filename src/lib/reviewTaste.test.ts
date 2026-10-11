import { describe, expect, it } from "vitest";
import { reasonFromTaste, summarizeReviewTaste, tasteContext, type TasteReview } from "./reviewTaste";

const r = (over: Partial<TasteReview>): TasteReview => ({
  targetType: "service",
  rating: 5,
  text: null,
  tags: [],
  serviceName: "Hydrafacial",
  serviceCategory: "Facial Services",
  staffName: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

describe("summarizeReviewTaste", () => {
  const taste = summarizeReviewTaste([
    r({ rating: 5, text: "My skin glowed for days. Will book again!", tags: ["Glowing skin"] }),
    r({ rating: 4, serviceName: "Foot Spa", serviceCategory: "Nail Care", tags: ["Relaxing"] }),
    r({ rating: 1, serviceName: "Underarm Laser", serviceCategory: "Laser Services" }),
    r({ targetType: "staff", rating: 5, serviceName: null, staffName: "Ms. Mary" }),
    r({ targetType: "staff", rating: 2, serviceName: null, staffName: "Ms. X" }),
  ]);

  it("splits loved and disliked services and keeps a short quote", () => {
    expect(taste.loved.map((l) => l.name)).toEqual(["Hydrafacial", "Foot Spa"]);
    expect(taste.loved[0].quote).toBe("My skin glowed for days.");
    expect(taste.disliked.map((d) => d.name)).toEqual(["Underarm Laser"]);
  });

  it("ranks favourite categories and flags ones to avoid", () => {
    expect(taste.lovedCategories).toEqual(["Facial Services", "Nail Care"]);
    expect(taste.avoidCategories).toEqual(["Laser Services"]);
  });

  it("finds favourite and low-rated staff, and the tags of good visits", () => {
    expect(taste.favouriteStaff).toEqual(["Ms. Mary"]);
    expect(taste.avoidStaff).toEqual(["Ms. X"]);
    expect(taste.tags).toEqual(["Glowing skin", "Relaxing"]);
  });

  it("tells the assistant to align with them", () => {
    const text = tasteContext(taste);
    expect(text).toContain('Hydrafacial (5★, "My skin glowed for days.")');
    expect(text).toContain("Didn't enjoy: Underarm Laser (1★)");
    expect(text).toContain("Align recommendations");
  });

  it("explains a pick from their reviews", () => {
    expect(reasonFromTaste(taste, { name: "hydrafacial", category: "Facial Services" })).toBe("You rated it 5★");
    expect(reasonFromTaste(taste, { name: "Diamond Peel", category: "Facial Services" })).toBe("Because you loved Hydrafacial");
    expect(reasonFromTaste(taste, { name: "Brow Threading", category: "Brows & Lashes" })).toBeNull();
  });

  it("is empty without reviews", () => {
    expect(tasteContext(summarizeReviewTaste([]))).toBe("");
  });
});
