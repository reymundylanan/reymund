import { describe, expect, it } from "vitest";
import { categoryFacts, promoCardFacts, type GuidePromoCard, firstSentence, hookFor, moodFor, priceLabel, promoFor, reactionFor, serviceFacts, type GuideService } from "./glowGuide";

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
    expect(hookFor("Hair Coloring Hair Services")).toBe("Want a fresh new look?");
    expect(hookFor("Deep Glow Facial Facial Services")).toBe("Ready to glow?");
    expect(hookFor("Something")).toBe("Looking for something special?");
    expect(moodFor("Swedish Massage Body & Wellness")).toBe("relax");
    expect(moodFor("Nail Care")).toBe("hands");
    expect(moodFor("Deep Glow Facial Facial Services")).toBe("cheek");
    expect(moodFor("Hair Color Hair Services")).toBe("excited");
    expect(moodFor("Tummy Slimming Services")).toBe("point");
  });
});

describe("promo card facts (home page)", () => {
  const card = (o: Partial<GuidePromoCard>): GuidePromoCard => ({
    id: "p1",
    title: "Airy Lashes + Brow Thread",
    badge: null,
    description: "Fuller lashes and clean brows in one visit. Ends soon.",
    price: 1000,
    validUntil: "2026-10-31",
    category: "Lashes & Brows",
    department: null,
    branchNames: ["One Cecilia Center", "Robinsons Pagadian"],
    ...o,
  });

  it("introduces the promo with its price, end date and branches", () => {
    const f = promoCardFacts(card({}), [card({}), card({ id: "p2", title: "Gel Mani + Foot Spa", price: 600 })]);
    expect(f.label).toBe("Promo");
    expect(f.intro).toBe("Let me introduce our Airy Lashes + Brow Thread promo at both branches! Fuller lashes and clean brows in one visit.");
    expect(f.meta).toEqual(["₱1,000", "Until Oct 31", "Both branches"]);
    expect(f.answers.compare).toContain("Gel Mani + Foot Spa is ₱600");
  });

  it("uses the admin's badge as the headline", () => {
    const f = promoCardFacts(card({ badge: "20% OFF", branchNames: ["Robinsons Pagadian"] }), []);
    expect(f.hook).toBe("20% OFF — don't miss it!");
    expect(f.meta).toContain("Robinsons Pagadian");
    expect(f.answers.compare).toBe("It's our only promo right now.");
  });
});
