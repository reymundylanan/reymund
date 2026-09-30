import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyVoucher, getDeskVouchers, undoVoucher, voucherDiscountMatches, type DeskVouchersResult } from "./frontdeskVouchers";

function fake(result: { data: unknown; error: { message: string } | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return result;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("applyVoucher", () => {
  it("returns the discount on success and normalizes the code", async () => {
    const { client, calls } = fake({ data: { voucherId: "1", code: "GLOW-AAAA-BBBB", discount: 50 }, error: null });
    const res = await applyVoucher(client, "appt-1", " glow-aaaa-bbbb ", 120);
    expect(res).toEqual({ discount: 50 });
    expect(calls[0]).toEqual({
      fn: "apply_voucher",
      args: { p_appointment_id: "appt-1", p_code: "GLOW-AAAA-BBBB", p_remaining: 120 },
    });
  });
  it("maps VOUCHER_WRONG_CLIENT to a friendly message", async () => {
    const { client } = fake({ data: null, error: { message: "VOUCHER_WRONG_CLIENT" } });
    expect(await applyVoucher(client, "a", "GLOW-AAAA-BBBB", 100)).toEqual({
      error: "This voucher belongs to a different client.",
    });
  });
});

describe("undoVoucher", () => {
  it("returns null on success", async () => {
    const { client, calls } = fake({ data: null, error: null });
    expect(await undoVoucher(client, "v1")).toBeNull();
    expect(calls[0]).toEqual({ fn: "undo_voucher", args: { p_voucher_id: "v1" } });
  });
  it("returns a message on failure", async () => {
    const { client } = fake({ data: null, error: { message: "VOUCHER_UNDO_EXPIRED" } });
    expect(await undoVoucher(client, "v1")).toBe("This voucher can no longer be removed.");
  });
});

describe("getDeskVouchers", () => {
  type Res = { data: unknown; error: { message: string; code?: string } | null };
  function table(res: Res) {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "or", "order"]) q[m] = () => q;
    q.maybeSingle = async () => res;
    q.then = (resolve: (r: Res) => unknown) => resolve(res);
    return q;
  }
  function client(vouchers: Res, settings: Res) {
    return { from: (t: string) => table(t === "reward_vouchers" ? vouchers : settings) } as unknown as SupabaseClient;
  }
  const row = (id: string, status: string, applied: number | null) => ({
    id, code: "GLOW-AAAA-BBBB", name: "₱50 OFF", discount_amount: "50", expires_at: "2027-01-01T00:00:00Z", status, discount_applied: applied,
  });

  it("maps ok with applied, available and the cap", async () => {
    const res = await getDeskVouchers(
      client({ data: [row("a", "active", null), row("u", "used", 50)], error: null }, { data: { max_voucher_discount: "100" }, error: null }),
      "c", "appt"
    );
    expect(res).toMatchObject({ status: "ok", maxPerBooking: 100 });
    if (res.status === "ok") {
      expect(res.applied?.id).toBe("u");
      expect(res.applied?.discountApplied).toBe(50);
      expect(res.available.map((v) => v.id)).toEqual(["a"]);
    }
  });
  it("is unavailable when the table isn't there yet", async () => {
    const res = await getDeskVouchers(
      client({ data: null, error: { message: "missing", code: "PGRST205" } }, { data: null, error: null }), "c", "appt"
    );
    expect(res).toEqual({ status: "unavailable" });
  });
  it("is an error for any other failure", async () => {
    const res = await getDeskVouchers(
      client({ data: null, error: { message: "boom", code: "XX000" } }, { data: null, error: null }), "c", "appt"
    );
    expect(res).toEqual({ status: "error" });
  });
});

describe("voucherDiscountMatches", () => {
  const voucher = { id: "v", code: "GLOW-AAAA-BBBB", name: "x", discountAmount: 100, expiresAt: "", status: "used", discountApplied: 50 };
  const ok = (applied: typeof voucher | null): DeskVouchersResult => ({ status: "ok", applied, available: [], maxPerBooking: 100 });

  it("matches when the applied discount equals the expected one", () => {
    expect(voucherDiscountMatches(ok(voucher), 50)).toBe(true);
  });
  it("matches no voucher with a zero discount", () => {
    expect(voucherDiscountMatches(ok(null), 0)).toBe(true);
  });
  it("differs when a voucher was applied or removed elsewhere", () => {
    expect(voucherDiscountMatches(ok(voucher), 0)).toBe(false);
    expect(voucherDiscountMatches(ok(null), 50)).toBe(false);
  });
  it("treats unavailable as no voucher", () => {
    expect(voucherDiscountMatches({ status: "unavailable" }, 0)).toBe(true);
    expect(voucherDiscountMatches({ status: "unavailable" }, 50)).toBe(false);
  });
  it("fails closed on a load error", () => {
    expect(voucherDiscountMatches({ status: "error" }, 0)).toBe(false);
  });
});
