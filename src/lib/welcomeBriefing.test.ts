import { describe, expect, it } from "vitest";
import { buildBriefing, type BriefingData } from "./welcomeBriefing";

const empty: BriefingData = {
  upcoming: null,
  unreadNotifications: 0,
  toReview: { count: 0, firstAppointmentId: null },
  vouchers: { count: 0, soonestExpiry: null },
  points: 0,
  tier: null,
};

describe("welcome briefing", () => {
  it("suggests booking when there's nothing else", () => {
    const r = buildBriefing(empty, "2026-10-10");
    expect(r.map((x) => x.kind)).toEqual(["book"]);
    expect(r[0].href).toBe("/services");
  });

  it("puts a booking waiting for confirmation first", () => {
    const r = buildBriefing(
      { ...empty, upcoming: { id: "a1", date: "2026-10-15", time: "14:00:00", status: "pending", serviceName: "Vitamin C", branchName: "One Cecilia Center" }, unreadNotifications: 2 },
      "2026-10-10"
    );
    expect(r[0].kind).toBe("pending");
    expect(r[0].detail).toBe("Vitamin C — Thu, Oct 15 at 2:00 PM at One Cecilia Center. We'll notify you once the branch confirms.");
    expect(r[0].href).toBe("/my-glow/appointments/a1");
    expect(r[1].title).toBe("2 new notifications");
    expect(r.some((x) => x.kind === "book")).toBe(false);
  });

  it("says today / tomorrow for confirmed bookings", () => {
    const base = { id: "a2", time: "09:30", status: "confirmed" as const, serviceName: "Facial", branchName: null };
    expect(buildBriefing({ ...empty, upcoming: { ...base, date: "2026-10-10" } }, "2026-10-10")[0].title).toBe("Your appointment is today!");
    expect(buildBriefing({ ...empty, upcoming: { ...base, date: "2026-10-11" } }, "2026-10-10")[0].detail).toContain("tomorrow at 9:30 AM");
    expect(buildBriefing({ ...empty, upcoming: { ...base, date: "2026-10-20" } }, "2026-10-10")[0].kind).toBe("booking");
  });

  it("lists reviews, vouchers and points from real counts", () => {
    const r = buildBriefing(
      { ...empty, toReview: { count: 1, firstAppointmentId: "v9" }, vouchers: { count: 2, soonestExpiry: "2026-10-31" }, points: 1250, tier: "Gold" },
      "2026-10-10"
    );
    expect(r.find((x) => x.kind === "review")?.href).toBe("/my-glow?review=v9#services");
    expect(r.find((x) => x.kind === "voucher")?.title).toBe("2 vouchers ready to use");
    expect(r.find((x) => x.kind === "points")?.title).toBe("1,250 GlowPoints · Gold");
  });
});

import { buildBubbles } from "./welcomeBriefing";

describe("character bubbles", () => {
  it("welcomes by name, then shows real updates by importance", () => {
    const reminders = buildBriefing(
      {
        ...empty,
        upcoming: { id: "a1", date: "2026-10-15", time: "14:00", status: "pending", serviceName: "Vitamin C", branchName: null },
        unreadNotifications: 2,
        points: 100,
        tier: "Bronze",
      },
      "2026-10-10"
    );
    const b = buildBubbles({ firstName: "Arnel", reminders, pointsGained: 20, promo: { id: "p1", title: "Glow Week" } });
    expect(b.map((x) => x.key)).toEqual(["greeting", "pending", "notifications", "points", "promo:p1"]);
    expect(b[0].text).toBe("Hi, Arnel! Welcome back! You have 3 updates for you.");
    expect(b[1].text).toBe("Your appointment is waiting for confirmation!");
    expect(b[1].important).toBe(true);
    expect(b[2].text).toBe("You have 2 new notifications!");
    expect(b[3].text).toBe("You've earned 20 new GlowPoints!");
    expect(b[4].href).toBe("/promos/p1");
  });

  it("just says hello when there's nothing new", () => {
    const b = buildBubbles({ firstName: null, reminders: buildBriefing(empty, "2026-10-10"), pointsGained: 0, promo: null });
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe("Hi! Welcome back! Everything's up to date ✨");
  });

  it("says today's time", () => {
    const reminders = buildBriefing(
      { ...empty, upcoming: { id: "a", date: "2026-10-10", time: "15:30", status: "confirmed", serviceName: "Facial", branchName: "One Cecilia Center" } },
      "2026-10-10"
    );
    expect(buildBubbles({ firstName: "A", reminders, pointsGained: 0, promo: null })[1].text).toBe("Your appointment is today at 3:30 PM at One Cecilia Center!");
  });
});
