import { describe, expect, it } from "vitest";
import { findPossibleDuplicates, memberSinceLabel, phoneHint, providerLabel, type ClientMatch } from "./walkinLinking";

const match = (over: Partial<ClientMatch> = {}): ClientMatch => ({
  id: "c1",
  fullName: "Maria Santos",
  emailMasked: "m***@gmail.com",
  phoneLast4: "4567",
  provider: "email",
  avatarUrl: null,
  memberSince: "2026-09-02T03:00:00Z",
  ...over,
});

describe("providerLabel", () => {
  it("names each sign-in method", () => {
    expect(providerLabel("facebook")).toBe("Facebook Account");
    expect(providerLabel("google")).toBe("Google Account");
    expect(providerLabel("email")).toBe("GlowSync Account");
  });
});

describe("memberSinceLabel", () => {
  it("shows month and year in Manila time", () => {
    expect(memberSinceLabel("2026-09-02T03:00:00Z")).toBe("Member since Sep 2026");
    expect(memberSinceLabel("2026-08-31T20:00:00Z")).toBe("Member since Sep 2026");
  });
});

describe("phoneHint", () => {
  it("masks all but the last 4 digits", () => {
    expect(phoneHint("4567")).toBe("•••• 4567");
    expect(phoneHint(null)).toBeNull();
  });
});

describe("findPossibleDuplicates", () => {
  const list = [
    match(),
    match({ id: "c2", fullName: "Maria Santos-Cruz", phoneLast4: null }),
    match({ id: "c3", fullName: "Ana Reyes", phoneLast4: "9999" }),
  ];
  it("matches the exact name, ignoring case and extra spaces", () => {
    expect(findPossibleDuplicates(list, "  maria   santos ", "").map((m) => m.id)).toEqual(["c1"]);
  });
  it("matches the phone's last 4 digits only when the full phone was typed", () => {
    expect(findPossibleDuplicates(list, "Someone Else", "09171119999").map((m) => m.id)).toEqual(["c3"]);
    expect(findPossibleDuplicates(list, "Someone Else", "9999").map((m) => m.id)).toEqual([]);
  });
  it("returns nothing for a different name and no phone", () => {
    expect(findPossibleDuplicates(list, "Juan Dela Cruz", "")).toEqual([]);
  });
});
