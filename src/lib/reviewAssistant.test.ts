import { describe, expect, it } from "vitest";
import { actionHref, buildReviewFacts, reviewLines, trimConversation, type AssistantReview } from "./reviewAssistant";

let n = 0;
function r(over: Partial<AssistantReview>): AssistantReview {
  n += 1;
  return { id: `r${n}`, type: "staff", rating: 5, text: "Great", status: "visible", date: "2026-10-01", client: "Ana", target: "Ms. Mary", photos: 0, ...over };
}

describe("buildReviewFacts", () => {
  const reviews = [
    r({}),
    r({ rating: 4 }),
    r({ target: "Ms. Gema", rating: 5 }),
    r({ type: "service", target: "Ear Candling", rating: 4, photos: 2 }),
    r({ type: "branch", target: "One Cecilia Center", rating: 3, date: "2026-09-15" }),
    r({ status: "removed", rating: 1 }),
  ];
  const facts = buildReviewFacts(reviews, "2026-10-01");

  it("ranks by review count, not rating, and skips removed reviews", () => {
    expect(facts.staff[0]).toMatchObject({ name: "Ms. Mary", count: 2, average: 4.5 });
    expect(facts.staff[0].stars).toMatchObject({ 5: 1, 4: 1, 1: 0 });
    expect(facts.staff[1]).toMatchObject({ name: "Ms. Gema", count: 1, average: 5 });
  });

  it("totals periods, photos and statuses", () => {
    expect(facts.totals.reviews).toBe(5);
    expect(facts.totals.withPhotos).toBe(1);
    expect(facts.totals.thisMonth).toBe(4);
    expect(facts.totals.thisWeek).toBe(4);
    expect(facts.totals.fiveStarThisMonth).toBe(2);
    expect(facts.totals.byStatus.removed).toBe(1);
    expect(facts.totals.byMonth).toEqual({ "2026-10": 4, "2026-09": 1 });
    expect(facts.periods).toEqual({ thisWeekFrom: "2026-09-28", thisMonthFrom: "2026-10-01", lastMonth: "2026-09" });
    expect(facts.services[0]).toMatchObject({ name: "Ear Candling", photoReviews: 1 });
  });
});

describe("helpers", () => {
  const options = {
    staff: [{ id: "11111111-1111-1111-1111-111111111111", name: "Ms. Mary" }],
    branches: [{ id: "22222222-2222-2222-2222-222222222222", name: "One Cecilia Center" }],
    services: [{ id: "Ear Candling", name: "Ear Candling" }],
  };

  it("builds Reviews links from known names only", () => {
    expect(actionHref({ label: "x", type: "staff", staff: "ms. mary", rating: 5 }, options)).toBe(
      "/admin/reviews?type=staff&staff=11111111-1111-1111-1111-111111111111&rating=5"
    );
    expect(actionHref({ label: "x", service: "Ear Candling", photos: true, q: "wait" }, options)).toBe(
      "/admin/reviews?service=Ear+Candling&photos=1&q=wait"
    );
    expect(actionHref({ label: "x", staff: "Nobody", rating: 9, from: "bad" }, options)).toBe("/admin/reviews");
  });

  it("formats review lines and trims the chat", () => {
    expect(reviewLines([r({ text: "Too  long\nwait", photos: 1 })])).toMatch(/\| 1 photo\(s\) \| client: Ana \| "Too long wait"$/);
    const turns = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: `m${i}` }));
    expect(trimConversation(turns)).toHaveLength(12);
    expect(trimConversation([{ role: "user", content: "  " }])).toHaveLength(0);
  });
});
