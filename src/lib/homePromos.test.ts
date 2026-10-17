import { describe, expect, it } from "vitest";
import { branchLabel, pickHomePromotions } from "./homePromos";
import type { ActivePromotion } from "@/lib/supabase/queries/publicContent";

const promo = (id: string, title: string, category: string, branchName = "One Cecilia Center", price = 1000): ActivePromotion => ({
  id,
  title,
  badge: null,
  description: null,
  price,
  branchName,
  validUntil: null,
  category,
  department: null,
});

// Deterministic "random" for tests.
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe("home promotions", () => {
  const list = [
    promo("h1", "Full Bleach + Balayage", "Hair Services"),
    promo("h1b", "Full Bleach + Balayage", "Hair Services", "Robinsons Pagadian"),
    promo("h2", "Hair Color + Botox", "Hair Services"),
    promo("h3", "Brazilian", "Hair Services"),
    promo("f1", "Glow Facial", "Facial Services"),
    promo("n1", "Gel Mani", "Nail Care"),
    promo("d1", "Gluta Drip", "Cocktail Drips"),
  ];

  it("shows a deal at both branches once", () => {
    const out = pickHomePromotions(list, 10, seq(0.5));
    expect(out.filter((p) => p.title === "Full Bleach + Balayage")).toHaveLength(1);
    expect(out.find((p) => p.title === "Full Bleach + Balayage")!.branchNames).toEqual(["One Cecilia Center", "Robinsons Pagadian"]);
  });

  it("mixes categories before repeating one", () => {
    const out = pickHomePromotions(list, 4, seq(0.1, 0.9, 0.3, 0.7, 0.5));
    expect(new Set(out.map((p) => p.category)).size).toBe(4);
  });

  it("fills up with more of a category when there aren't enough", () => {
    expect(pickHomePromotions(list, 6, seq(0.2, 0.6))).toHaveLength(6);
  });

  it("labels the branches", () => {
    expect(branchLabel(["One Cecilia Center"])).toBe("One Cecilia Center");
    expect(branchLabel(["A", "B"])).toBe("Both branches");
  });
});
