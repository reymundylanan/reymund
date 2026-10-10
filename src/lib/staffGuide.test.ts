import { describe, expect, it } from "vitest";
import { listJoin, pickQuote, staffFacts } from "./staffGuide";

const base = { fullName: "Ms. Mary", department: "Clinic", branchName: "One Cecilia Center", average: 4.7, count: 3, quote: null, categories: [] as string[] };

describe("staff guide", () => {
  it("introduces a team member from real data", () => {
    const f = staffFacts({ ...base, categories: ["Facial Services", "Laser Services", "Slimming Services", "Doctor's Procedure"] });
    expect(f.intro).toBe("Let me introduce Ms. Mary! Part of our Clinic team at One Cecilia Center.");
    expect(f.why).toBe("Clients rate Ms. Mary 4.7★ from 3 reviews — a client favorite!");
    expect(f.specialties).toBe("Book Ms. Mary for Facial Services, Laser Services and Slimming Services and more.");
    expect(f.hook).toBe("Glowing skin starts here ✨");
    expect(f.meta).toEqual(["Clinic", "One Cecilia Center", "★ 4.7 (3)"]);
  });

  it("never invents ratings", () => {
    const f = staffFacts({ ...base, count: 0, average: 0, department: "Nails" });
    expect(f.why).toContain("new to reviews");
    expect(f.meta).toEqual(["Nails", "One Cecilia Center"]);
    expect(f.specialties).toBe("Book Ms. Mary for our Nails services.");
  });

  it("quotes the newest good review", () => {
    const q = pickQuote([
      { rating: 5, text: "Old but lovely service!", reviewer: "Ana", createdAt: "2026-01-01" },
      { rating: 3, text: "It was okay I guess", reviewer: "Bea", createdAt: "2026-09-01" },
      { rating: 5, text: "So gentle and kind, my skin is glowing!", reviewer: "Cara", createdAt: "2026-08-01" },
    ]);
    expect(q?.reviewer).toBe("Cara");
    expect(staffFacts({ ...base, quote: q }).quote).toBe("“So gentle and kind, my skin is glowing!” — Cara");
    expect(pickQuote([{ rating: 5, text: "ok", reviewer: "D", createdAt: "2026-01-01" }])).toBeNull();
  });

  it("joins lists naturally", () => {
    expect(listJoin(["A"])).toBe("A");
    expect(listJoin(["A", "B"])).toBe("A and B");
    expect(listJoin(["A", "B", "C"])).toBe("A, B and C");
  });
});
