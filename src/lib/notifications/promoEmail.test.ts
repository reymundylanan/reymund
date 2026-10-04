import { describe, expect, it } from "vitest";
import { buildPromoEmail, groupPromos } from "./promoEmail";

describe("new promo email", () => {
  const promo = {
    id: "p1",
    title: "Glow Facial <Special>",
    description: "Up to 20% off facials",
    badge: "20% OFF",
    price: 1500,
    validUntil: "2026-10-31",
    branchNames: ["One Cecilia Center", "Robinsons Pagadian"],
  };

  it("links to the promo, names the branches and escapes text", () => {
    const mail = buildPromoEmail(promo, "https://glow.test/");
    expect(mail.subject).toBe("New at Blush Spa: Glow Facial <Special>");
    expect(mail.html).toContain("https://glow.test/promos/p1");
    expect(mail.html).toContain("Glow Facial &lt;Special&gt;");
    expect(mail.html).not.toContain("<Special>");
    expect(mail.text).toContain("One Cecilia Center & Robinsons Pagadian until October 31, 2026");
    expect(mail.text).toContain("₱1,500");
    expect(mail.unsubscribeUrl).toBe("https://glow.test/my-glow/profile#notifications");
  });

  it("sends one email for a promo saved at several branches", () => {
    const groups = groupPromos([
      { id: "a", title: "Hair Promo", branchName: "One Cecilia Center" },
      { id: "b", title: "hair promo ", branchName: "Robinsons Pagadian" },
      { id: "c", title: "Nail Promo", branchName: "One Cecilia Center" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].first.id).toBe("a");
    expect(groups[0].branchNames).toEqual(["One Cecilia Center", "Robinsons Pagadian"]);
  });
});
