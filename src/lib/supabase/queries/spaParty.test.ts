import { describe, expect, it } from "vitest";
import { groupSpaPackages } from "./spaParty";

const row = (badge: string, price: number, branch: string, description = "Good for ten (10) pax\n3 hours exclusive use of spa area") => ({
  badge: "SPA PKG",
  title: badge,
  price,
  description,
  branch: { name: branch },
});

describe("Spa Party packages", () => {
  it("shows the same package at several branches once, cheapest first", () => {
    const out = groupSpaPackages([row("PREMIUM", 14500, "One Cecilia Center"), row("BASIC", 8500, "One Cecilia Center"), row("PREMIUM", 14500, "Robinsons Pagadian")]);
    expect(out.map((p) => p.tier)).toEqual(["BASIC", "PREMIUM"]);
    expect(out[1].branches).toEqual(["One Cecilia Center", "Robinsons Pagadian"]);
    expect(out[1].inclusions).toEqual(["Good for ten (10) pax", "3 hours exclusive use of spa area"]);
  });

  it("keeps a branch's different price as its own card", () => {
    expect(groupSpaPackages([row("PREMIUM", 14500, "A"), row("PREMIUM", 15000, "B")])).toHaveLength(2);
  });
});
