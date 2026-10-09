import { describe, expect, it } from "vitest";
import { knowledgeText, openNow, parseHours, staffText, type SpaKnowledge } from "./spaKnowledge";

const k: SpaKnowledge = {
  branches: [
    { name: "One Cecilia Center", address: "3rd Floor, One Cecilia Center", phone: "+63 970 081 0473", hours: "8:00 AM - 7:00 PM" },
    { name: "Robinsons Pagadian", address: "Robinsons Mall", phone: "+63 916 560 6052", hours: "10:00 AM - 9:00 PM" },
  ],
  gracePeriodMinutes: 10,
  promos: [
    {
      id: "p1",
      title: "Glow Facial",
      badge: "20% OFF",
      description: "Brightening facial",
      price: 1200,
      branchName: "Robinsons Pagadian",
      validUntil: "2026-10-31",
      category: "Facial Services",
      department: "Clinic",
    },
  ],
};

describe("spaKnowledge", () => {
  it("reads branch hours", () => {
    expect(parseHours("8:00 AM - 7:00 PM")).toEqual({ open: 480, close: 1140 });
    expect(parseHours("10:00 AM - 9:00 PM")).toEqual({ open: 600, close: 1260 });
    expect(parseHours("by appointment")).toBeNull();
  });

  it("knows if a branch is open in Philippine time", () => {
    // 01:00 UTC = 9:00 AM Manila.
    const nineAm = new Date("2026-10-05T01:00:00Z");
    expect(openNow("8:00 AM - 7:00 PM", nineAm)).toBe(true);
    expect(openNow("10:00 AM - 9:00 PM", nineAm)).toBe(false);
  });

  it("puts the real hours, promos and rules in the instructions", () => {
    const text = knowledgeText(k, new Date("2026-10-05T01:00:00Z"));
    expect(text).toContain("One Cecilia Center: open daily 8:00 AM - 7:00 PM (open now)");
    expect(text).toContain("Robinsons Pagadian: open daily 10:00 AM - 9:00 PM (closed now)");
    expect(text).toContain("Glow Facial [20% OFF] — ₱1,200 at Robinsons Pagadian (until October 31)");
    expect(text).toContain("10 minutes after their start time");
    expect(text).toContain("non-refundable");
  });
});

describe("staffText", () => {
  it("groups professionals by branch and department", () => {
    const text = staffText([
      { name: "Ana", department: "Clinic", branch: "One Cecilia Center" },
      { name: "Bea", department: "Clinic", branch: "One Cecilia Center" },
      { name: "Carla", department: "Hair", branch: "One Cecilia Center" },
      { name: "Dina", department: "Nails", branch: "Robinsons Pagadian" },
    ]);
    expect(text).toBe("- One Cecilia Center — Clinic: Ana, Bea · Hair: Carla\n- Robinsons Pagadian — Nails: Dina");
    expect(staffText([])).toContain("any professional");
  });
});
