import { describe, expect, it } from "vitest";
import {
  durationMinutes,
  formatMinutes,
  packageDepartments,
  packageMinutes,
  promoLengths,
  promoNotes,
  promoOpenOn,
  promoPriceFor,
  regularPrice,
  type PackageService,
} from "./promoPackage";

const svc = (name: string, duration: string, price: number, department = "Hair"): PackageService => ({
  id: name,
  name,
  category: "Hair Services",
  department,
  duration,
  price,
});

const pkg = {
  services: [svc("Full Bleach", "120 mins", 3000), svc("Balayage", "150 mins", 2500), svc("Botox Tx", "60 mins", 1000)],
  department: "Hair",
};

describe("promoPackage", () => {
  it("reads duration labels", () => {
    expect(durationMinutes("90 mins")).toBe(90);
    expect(durationMinutes("2 hours")).toBe(120);
    expect(durationMinutes("1 hour 30 mins")).toBe(90);
    expect(durationMinutes(null)).toBe(60);
  });

  it("adds up the package time and regular price", () => {
    expect(packageMinutes(pkg)).toBe(330);
    expect(formatMinutes(330)).toBe("5 hours 30 minutes");
    expect(regularPrice(pkg)).toBe(6500);
    expect(packageMinutes({ services: [] })).toBe(60);
    expect(regularPrice({ services: [] })).toBeNull();
  });

  it("offers length prices only for hair-style promos", () => {
    expect(promoLengths({ price: 5500, priceMedium: null, priceLong: null })).toEqual([]);
    const hair = { price: 1000, priceMedium: 1500, priceLong: 2000 };
    expect(promoLengths(hair).map((l) => l.length)).toEqual(["short", "medium", "long"]);
    expect(promoPriceFor(hair, "long")).toBe(2000);
    expect(promoPriceFor(hair, null)).toBe(1000);
  });

  it("enforces the promo dates", () => {
    const p = { validFrom: "2026-10-01", validUntil: "2026-10-31" };
    expect(promoOpenOn(p, "2026-10-10")).toBe(true);
    expect(promoOpenOn(p, "2026-11-01")).toBe(false);
    expect(promoOpenOn({ validFrom: null, validUntil: null }, "2030-01-01")).toBe(true);
  });

  it("knows when one professional can do the whole package", () => {
    expect(packageDepartments(pkg)).toEqual(["Hair"]);
    expect(packageDepartments({ services: [svc("Facial", "60 mins", 500, "Clinic"), ...pkg.services], department: null })).toEqual(["Clinic", "Hair"]);
    expect(packageDepartments({ services: [], department: "Clinic" })).toEqual(["Clinic"]);
  });

  it("writes notes the rest of the app can read", () => {
    const notes = promoNotes("Love Handle - with free RF", "Ms. Mary", 5500);
    expect(notes).toBe("🎁 Love Handle - w/ free RF with Ms. Mary — ₱5,500.00");
    expect(notes.split(" with ")[0]).toBe("🎁 Love Handle - w/ free RF");
  });
});
