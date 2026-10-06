import { describe, expect, it } from "vitest";
import { categoryFacts, firstSentence, priceLabel, promoFor, reactionFor, serviceFacts, type GuideService } from "./glowGuide";

const svc = (o: Partial<GuideService>): GuideService => ({
  id: "s1",
  name: "Deep Glow Facial",
  category: "Facial Services",
  duration: "60 mins",
  price: 1200,
  description: "A deep cleansing facial for refreshed skin. Includes a mask.",
  benefits: "Brightens dull skin and unclogs pores.",
  ...o,
});

describe("GlowSync guide", () => {
  it("introduces a service from its real data", () => {
    const s = svc({});
    const f = serviceFacts(s, [s, svc({ id: "s2", name: "Basic Facial", price: 750 })], [], { average: 4.8, count: 12 }, "");
    expect(f.intro).toBe("Let me introduce Deep Glow Facial! A deep cleansing facial for refreshed skin.");
    expect(f.why).toBe("Brightens dull skin and unclogs pores.");
    expect(f.meta).toEqual(["₱1,200", "60 mins", "★ 4.8 (12)"]);
    expect(f.reaction).toBe("✨");
    expect(f.answers.compare).toContain("Basic Facial is ₱750");
  });

  it("prices hair by length and never invents a price", () => {
    expect(priceLabel(svc({ hairPrices: { short: 1000, medium: 1500, long: 2000 } }))).toBe("Short ₱1,000 · Medium ₱1,500 · Long ₱2,000");
    expect(priceLabel(svc({ price: 0 }))).toBe("Price on consultation");
    expect(serviceFacts(svc({ duration: null }), [], [], null, "").answers.duration).toContain("don't have the duration");
  });

  it("mentions only promos that are really for this service or category", () => {
    const promos = [
      { id: "p1", title: "Deep Glow Facial Special", price: 999, validUntil: "2026-10-31", category: "Facial Services" },
      { id: "p2", title: "Nail Art Sale", price: 300, validUntil: null, category: "Nail Care" },
    ];
    expect(promoFor({ name: "Deep Glow Facial", category: "Facial Services" }, promos)?.id).toBe("p1");
    expect(promoFor({ name: "Basic Facial", category: "Facial Services" }, promos)).toBeNull();
    expect(serviceFacts(svc({}), [], promos, null, "").answers.promotions).toContain("Deep Glow Facial Special for ₱999");
    expect(categoryFacts("Nail Care", [], promos, null, "").promo?.id).toBe("p2");
  });

  it("summarizes a category", () => {
    const f = categoryFacts("Facial Services", [svc({}), svc({ id: "s2", price: 750 })], [], null, "Expert facials for every concern. More text.");
    expect(f.why).toBe("2 treatments to choose from, from ₱750 – ₱1,200.");
    expect(f.intro).toBe("Let me introduce Facial Services! Expert facials for every concern.");
  });

  it("helpers", () => {
    expect(reactionFor("Nail Care")).toBe("💅");
    expect(firstSentence("One. Two.")).toBe("One.");
    expect(firstSentence("")).toBe("");
  });
});
