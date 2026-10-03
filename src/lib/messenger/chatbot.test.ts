import { describe, expect, it } from "vitest";
import { isPaused, recommendationButton, trimHistory, welcomeText } from "./chatbot";
import { withBotMetadata } from "./graph";
import type { LiveService } from "@/lib/ai/spaAssistant";

const svc = (id: string, name: string, price: number, hair: LiveService["hairPrices"] = null): LiveService => ({
  id,
  name,
  category: "Hair Services",
  department: "Hair",
  duration: "60 mins",
  price,
  description: null,
  branchId: "b1",
  branchName: "One Cecilia Center",
  hairPrices: hair,
});

describe("messenger chatbot helpers", () => {
  it("keeps only the last turns", () => {
    const turns = Array.from({ length: 12 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}` }));
    const kept = trimHistory(turns, 8);
    expect(kept).toHaveLength(8);
    expect(kept[0].content).toBe("m4");
    expect(trimHistory([{ role: "user", content: "a" }, null as never, { role: "system" as never, content: "x" }])).toHaveLength(1);
  });

  it("knows when a staff member has paused the bot", () => {
    const now = new Date("2026-10-03T10:00:00Z");
    expect(isPaused("2026-10-03T12:00:00Z", now)).toBe(true);
    expect(isPaused("2026-10-03T09:00:00Z", now)).toBe(false);
    expect(isPaused(null, now)).toBe(false);
  });

  it("lists recommended services with a booking link", () => {
    expect(recommendationButton([], "https://x.app")).toBeNull();
    const one = recommendationButton([svc("s1", "Brazilian", 0, { short: 1000, medium: 1500, long: 2000 })], "https://x.app");
    expect(one).toEqual({ text: "• Brazilian — Short ₱1,000 · Medium ₱1,500 · Long ₱2,000", url: "https://x.app/services/s1" });
    const two = recommendationButton([svc("s1", "Hair Color", 800), svc("s2", "Rebond", 1500)], "https://x.app");
    expect(two?.url).toBe("https://x.app/services?category=Hair%20Services");
    expect(two?.text).toBe("• Hair Color — ₱800\n• Rebond — ₱1,500");
  });

  it("greets by first name when known", () => {
    expect(welcomeText("Oceana")).toMatch(/^Hi Oceana! 👋/);
    expect(welcomeText(null)).toMatch(/^Hi! 👋/);
  });

  it("tags outgoing messages so their echoes are recognised", () => {
    expect(withBotMetadata({ recipient: { id: "u" }, message: { text: "hi" } })).toEqual({
      recipient: { id: "u" },
      message: { text: "hi", metadata: "glowsync" },
    });
    // Typing indicators have no message; already-tagged messages are left alone.
    expect(withBotMetadata({ recipient: { id: "u" }, sender_action: "typing_on" })).toEqual({ recipient: { id: "u" }, sender_action: "typing_on" });
    expect(withBotMetadata({ message: { text: "x", metadata: "other" } })).toEqual({ message: { text: "x", metadata: "other" } });
  });
});
