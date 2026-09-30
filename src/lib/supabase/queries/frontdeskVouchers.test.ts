import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyVoucher, undoVoucher } from "./frontdeskVouchers";

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
