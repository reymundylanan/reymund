import { describe, expect, it } from "vitest";
import { rankPromos, type ClientHistory, type PromoCandidate } from "./promoPicker";

const promo = (over: Partial<PromoCandidate>): PromoCandidate => ({
  id: "p",
  branchId: "b1",
  title: "Promo",
  department: null,
  category: null,
  validUntil: null,
  ...over,
});

const noHistory: ClientHistory = { branchIds: [], departments: [], bookedCategories: [] };

describe("rankPromos", () => {
  it("skips promos dismissed this session", () => {
    const ranked = rankPromos([promo({ id: "a" }), promo({ id: "b" })], noHistory, new Set(["a"]));
    expect(ranked.map((p) => p.id)).toEqual(["b"]);
  });

  it("returns nothing when everything was dismissed", () => {
    expect(rankPromos([promo({ id: "a" })], noHistory, new Set(["a"]))).toEqual([]);
  });

  it("pushes promos for an already-booked category to the end (case-insensitive)", () => {
    const history: ClientHistory = { ...noHistory, bookedCategories: ["Facial Services"] };
    const ranked = rankPromos(
      [promo({ id: "facial", category: "facial services", validUntil: "2026-10-01" }), promo({ id: "nail", category: "Nail Care", validUntil: "2026-12-01" })],
      history,
      new Set()
    );
    expect(ranked.map((p) => p.id)).toEqual(["nail", "facial"]);
  });

  it("prefers a visited branch, then a used department, then the soonest end date", () => {
    const history: ClientHistory = { branchIds: ["b2"], departments: ["Body"], bookedCategories: [] };
    const ranked = rankPromos(
      [
        promo({ id: "other-branch-soon", branchId: "b1", validUntil: "2026-10-01" }),
        promo({ id: "visited-later", branchId: "b2", validUntil: "2026-12-31" }),
        promo({ id: "visited-body", branchId: "b2", department: "body", validUntil: "2027-01-31" }),
        promo({ id: "visited-sooner", branchId: "b2", validUntil: "2026-11-01" }),
      ],
      history,
      new Set()
    );
    expect(ranked.map((p) => p.id)).toEqual(["visited-body", "visited-sooner", "visited-later", "other-branch-soon"]);
  });

  it("puts promos without an end date after dated ones, then orders by title", () => {
    const ranked = rankPromos(
      [promo({ id: "open-b", title: "B" }), promo({ id: "dated", validUntil: "2026-10-05" }), promo({ id: "open-a", title: "A" })],
      noHistory,
      new Set()
    );
    expect(ranked.map((p) => p.id)).toEqual(["dated", "open-a", "open-b"]);
  });
});
