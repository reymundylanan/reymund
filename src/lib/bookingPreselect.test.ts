import { describe, expect, it } from "vitest";
import { preselectService, type PreselectCandidate } from "./bookingPreselect";

const svc = (over: Partial<PreselectCandidate>): PreselectCandidate => ({
  id: "id",
  name: "Name",
  category: "Brows & Lashes",
  department: "Clinic",
  duration: "60 mins",
  price: 100,
  hairPrices: null,
  price41: null,
  ...over,
});

const services = [
  svc({ id: "a", name: "Brow Shaping", price: 100 }),
  svc({ id: "b", name: "Cat-eye Lashes", price: 1200 }),
  svc({ id: "c", name: "Brazilian", category: "Hair Services", department: "Hair", hairPrices: { short: 1000, medium: 1500, long: 2000 } }),
  svc({ id: "d", name: "Mesolipo", category: "Slimming Services", department: "Clinic", price: 2500, price41: 9999 }),
];

describe("preselectService", () => {
  it("adds the same service, matching name and category", () => {
    expect(preselectService({ name: "cat-eye  lashes", category: "Brows & Lashes" }, services)).toEqual({
      kind: "added",
      category: "Brows & Lashes",
      entry: { id: "b", name: "Cat-eye Lashes", category: "Brows & Lashes", department: "Clinic", duration: "60 mins", price: 1200 },
    });
  });

  it("falls back to the name when the branch files it under another category", () => {
    expect(preselectService({ name: "Brow Shaping", category: "General" }, services)).toMatchObject({ kind: "added", entry: { id: "a" } });
  });

  it("asks for the hair length instead of guessing a price", () => {
    expect(preselectService({ name: "Brazilian", category: "Hair Services" }, services)).toMatchObject({ kind: "choose_length", category: "Hair Services" });
  });

  it("pre-adds the per-session price for package services", () => {
    expect(preselectService({ name: "Mesolipo" }, services)).toMatchObject({
      kind: "added",
      entry: { id: "d·per-session", name: "Mesolipo · Per Session", price: 2500 },
    });
  });

  it("reports when the branch doesn't offer it", () => {
    expect(preselectService({ name: "Hydrafacial" }, services)).toEqual({ kind: "missing" });
  });
});
