import { describe, expect, it } from "vitest";
import { branchPitch, type BranchStats } from "./branchGuide";

const base: BranchStats = {
  name: "One Cecilia Center",
  place: "One Cecilia Center",
  hours: "8:00 AM - 7:00 PM",
  services: 91,
  departments: ["Clinic", "Hair", "Nails", "Facial"],
  staff: 9,
  livePromos: 64,
  promoTitle: "Body Scrub + Body Bleaching",
  rating: 4.8,
  reviews: 12,
  kind: "flagship",
};

describe("branchPitch", () => {
  it("introduces the flagship with real numbers", () => {
    const p = branchPitch(base);
    expect(p.hook).toContain("flagship");
    expect(p.intro).toContain("91 services");
    expect(p.intro).toContain("clinic, hair and nails");
    expect(p.why).toBe("Clients rate it 4.8★ from 12 reviews, 9 specialists ready for you and 64 live promos, like Body Scrub + Body Bleaching.");
    expect(p.highlights).toEqual(["Open daily · 8:00 AM - 7:00 PM", "91 services", "64 live promos"]);
  });

  it("pitches the mall branch differently", () => {
    const p = branchPitch({ ...base, name: "Robinsons Pagadian", place: "Robinsons Mall", kind: "mall" });
    expect(p.hook).toContain("mall");
    expect(p.intro).toContain("while you're out in the city");
  });

  it("never invents a rating or promos it doesn't have", () => {
    const p = branchPitch({ ...base, rating: null, reviews: 0, livePromos: 0, promoTitle: null, staff: 0 });
    expect(p.why).toBe("Book a visit and see why our clients keep coming back.");
    expect(p.highlights).toEqual(["Open daily · 8:00 AM - 7:00 PM", "91 services"]);
  });
});
