import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redeemReward, sortVouchers, type Voucher } from "./vouchers";

function v(over: Partial<Voucher>): Voucher {
  return {
    id: "x",
    name: "₱50 OFF",
    code: "GLOW-AAAA-BBBB",
    discountAmount: 50,
    pointsUsed: 500,
    status: "active",
    expiresAt: "2026-12-01T00:00:00Z",
    createdAt: "2026-09-01T00:00:00Z",
    usedAt: null,
    discountApplied: null,
    ...over,
  };
}

function fake(result: { data: unknown; error: { message: string } | null }) {
  return { rpc: async () => result } as unknown as SupabaseClient;
}

describe("sortVouchers", () => {
  it("puts active first by soonest expiry, then others newest first", () => {
    const list = [
      v({ id: "used-old", status: "used", createdAt: "2026-08-01T00:00:00Z" }),
      v({ id: "late", expiresAt: "2026-12-30T00:00:00Z" }),
      v({ id: "expired-new", status: "expired", createdAt: "2026-09-10T00:00:00Z" }),
      v({ id: "soon", expiresAt: "2026-10-05T00:00:00Z" }),
    ];
    expect(sortVouchers(list).map((x) => x.id)).toEqual(["soon", "late", "expired-new", "used-old"]);
  });
});

describe("redeemReward", () => {
  it("maps a successful redemption", async () => {
    const res = await redeemReward(
      fake({ data: { voucherId: "1", code: "GLOW-AAAA-BBBB", expiresAt: "2026-12-01T00:00:00Z", balance: 250 }, error: null }),
      "opt"
    );
    expect(res).toEqual({ code: "GLOW-AAAA-BBBB", expiresAt: "2026-12-01T00:00:00Z", balance: 250 });
  });
  it("maps REDEEM_NOT_ENOUGH to a friendly message", async () => {
    const res = await redeemReward(fake({ data: null, error: { message: "REDEEM_NOT_ENOUGH" } }), "opt");
    expect(res).toEqual({ error: "You don't have enough GlowPoints for this reward." });
  });
  it("falls back to a generic message for unknown errors", async () => {
    const res = await redeemReward(fake({ data: null, error: { message: "boom" } }), "opt");
    expect("error" in res).toBe(true);
  });
});
