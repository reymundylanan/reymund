import { describe, expect, it } from "vitest";
import { shortHours, summarizeServices } from "./homeSummary";

describe("summarizeServices", () => {
  it("counts each treatment once per department and finds the lowest price", () => {
    const out = summarizeServices([
      { name: "Hydra Facial", category: "Facial Services", department: "Clinic", price: 1500 },
      { name: "hydra facial ", category: "Facial Services", department: "Clinic", price: 1200 },
      { name: "Diode Laser", category: "Laser Services", department: "Clinic", price: 1000 },
      { name: "Rebond", category: "Hair Services", department: "Hair", price: 0 },
    ]);
    expect(out).toEqual([
      {
        department: "Clinic",
        treatments: 2,
        fromPrice: 1000,
        categories: [
          { name: "Facial Services", count: 1 },
          { name: "Laser Services", count: 1 },
        ],
        examples: ["Diode Laser", "Hydra Facial"],
      },
      { department: "Hair", treatments: 1, fromPrice: null, categories: [{ name: "Hair Services", count: 1 }], examples: ["Rebond"] },
    ]);
  });

  it("skips rows without a department or name", () => {
    expect(summarizeServices([{ name: "X", category: null, department: null, price: 5 }])).toEqual([]);
  });
});

describe("shortHours", () => {
  it("drops the :00s", () => {
    expect(shortHours("8:00 AM - 7:00 PM")).toBe("8 AM – 7 PM");
    expect(shortHours("10:30 AM - 9:00 PM")).toBe("10:30 AM – 9 PM");
    expect(shortHours(null)).toBeNull();
  });
});
