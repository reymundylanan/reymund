import { describe, expect, it } from "vitest";
import { timeAgo } from "./timeAgo";

const now = new Date("2026-09-30T12:00:00+08:00");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();

describe("timeAgo", () => {
  it("says 'just now' under a minute (and for clock skew into the future)", () => {
    expect(timeAgo(minutesAgo(0.5), now)).toBe("just now");
    expect(timeAgo(minutesAgo(-2), now)).toBe("just now");
  });

  it("uses minutes, hours, then days", () => {
    expect(timeAgo(minutesAgo(5), now)).toBe("5m ago");
    expect(timeAgo(minutesAgo(59), now)).toBe("59m ago");
    expect(timeAgo(minutesAgo(60), now)).toBe("1h ago");
    expect(timeAgo(minutesAgo(23 * 60), now)).toBe("23h ago");
    expect(timeAgo(minutesAgo(24 * 60), now)).toBe("1d ago");
    expect(timeAgo(minutesAgo(6 * 24 * 60), now)).toBe("6d ago");
  });

  it("falls back to a short Manila date after a week", () => {
    expect(timeAgo("2026-09-12T02:00:00Z", now)).toBe("Sep 12");
  });
});
