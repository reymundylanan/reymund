import { describe, expect, it } from "vitest";
import { fallbackReply, findServices, priceText, type FallbackService } from "./assistantFallback";

const svc = (id: string, name: string, category: string, price: number, hair: FallbackService["hairPrices"] = null): FallbackService => ({
  id,
  name,
  category,
  price,
  hairPrices: hair,
});

const services = [
  svc("1", "Brazilian", "Hair Services", 0, { short: 1000, medium: 1500, long: 2000 }),
  svc("2", "Hair Color", "Hair Services", 0, { short: 800, medium: 1000, long: 1200 }),
  svc("3", "Deep Glow Facial", "Facial Services", 750),
  svc("4", "Brazilian", "Hair Services", 0, { short: 1000, medium: 1500, long: 2000 }),
];
const ctx = { firstName: "Jomari", upcoming: null, hours: "8:00 AM – 6:00 PM", branches: ["One Cecilia Center"] };

describe("assistantFallback", () => {
  it("prices hair services by length", () => {
    expect(priceText(services[0])).toBe("Short ₱1,000 · Medium ₱1,500 · Long ₱2,000");
    expect(priceText(services[2])).toBe("₱750");
  });

  it("finds a named service once even if two branches offer it", () => {
    expect(findServices("how much for brazilian tx", services).map((s) => s.id)).toEqual(["1"]);
    expect(findServices("price of hair color?", services).map((s) => s.id)).toEqual(["2"]);
  });

  it("answers a price question with the catalog price", () => {
    const r = fallbackReply("how much for brazilian tx", services, ctx);
    expect(r.reply).toContain("Brazilian: Short ₱1,000 · Medium ₱1,500 · Long ₱2,000");
    expect(r.ids).toEqual(["1"]);
  });

  it("lists a category when no service is named", () => {
    const r = fallbackReply("do you have facials?", services, ctx);
    expect(r.ids).toEqual(["3"]);
  });

  it("handles bookings and unknown questions without errors", () => {
    expect(fallbackReply("check my bookings", services, ctx).reply).toContain("don't have an upcoming booking");
    expect(fallbackReply("tell me a joke", services, ctx).reply).toContain("short break");
  });
});
