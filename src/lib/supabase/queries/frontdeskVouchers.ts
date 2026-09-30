import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import { normalizeVoucherCode, voucherErrorMessage } from "@/lib/vouchers";

export type DeskVoucher = {
  id: string;
  code: string;
  name: string;
  discountAmount: number;
  expiresAt: string;
  status: string;
  discountApplied: number | null;
};

type Row = {
  id: string;
  code: string;
  name: string;
  discount_amount: number | string;
  expires_at: string;
  status: string;
  discount_applied: number | string | null;
};

function toVoucher(r: Row): DeskVoucher {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    discountAmount: Number(r.discount_amount),
    expiresAt: r.expires_at,
    status: r.status,
    discountApplied: r.discount_applied === null ? null : Number(r.discount_applied),
  };
}

export type DeskVouchersResult =
  | { status: "ok"; applied: DeskVoucher | null; available: DeskVoucher[]; maxPerBooking: number }
  /** Migration 053 not applied: nothing to show, payment can proceed. */
  | { status: "unavailable" }
  /** Any other load failure: the caller must not assume there is no voucher. */
  | { status: "error" };

export async function getDeskVouchers(
  supabase: SupabaseClient,
  clientId: string,
  appointmentId: string
): Promise<DeskVouchersResult> {
  const nowIso = new Date().toISOString();
  const [vouchersRes, settingsRes] = await Promise.all([
    supabase
      .from("reward_vouchers")
      .select("id, code, name, discount_amount, expires_at, status, discount_applied")
      .eq("client_id", clientId)
      .or(`and(status.eq.active,expires_at.gt.${nowIso}),and(status.eq.used,used_appointment_id.eq.${appointmentId})`)
      .order("expires_at", { ascending: true }),
    supabase.from("review_reward_settings").select("max_voucher_discount").maybeSingle(),
  ]);
  if (vouchersRes.error || settingsRes.error) {
    const err = vouchersRes.error ?? settingsRes.error;
    logQueryError("getDeskVouchers", err);
    return isNotMigratedError(err) ? { status: "unavailable" } : { status: "error" };
  }
  const all = ((vouchersRes.data ?? []) as Row[]).map(toVoucher);
  return {
    status: "ok",
    applied: all.find((v) => v.status === "used") ?? null,
    available: all.filter((v) => v.status === "active"),
    maxPerBooking: Number(settingsRes.data?.max_voucher_discount ?? 100),
  };
}

export async function applyVoucher(
  supabase: SupabaseClient,
  appointmentId: string,
  code: string,
  remaining: number
): Promise<{ discount: number } | { error: string }> {
  const { data, error } = await supabase.rpc("apply_voucher", {
    p_appointment_id: appointmentId,
    p_code: normalizeVoucherCode(code),
    p_remaining: remaining,
  });
  if (error) {
    const errCode = /VOUCHER_[A-Z_]+/.exec(error.message ?? "")?.[0];
    if (!errCode) logQueryError("applyVoucher", error);
    return { error: voucherErrorMessage(errCode) };
  }
  const row = data as { discount?: number | string } | null;
  if (row?.discount === undefined || row.discount === null) return { error: voucherErrorMessage(null) };
  return { discount: Number(row.discount) };
}

export async function undoVoucher(supabase: SupabaseClient, voucherId: string): Promise<string | null> {
  const { error } = await supabase.rpc("undo_voucher", { p_voucher_id: voucherId });
  if (!error) return null;
  const errCode = /VOUCHER_[A-Z_]+/.exec(error.message ?? "")?.[0];
  if (!errCode) logQueryError("undoVoucher", error);
  return voucherErrorMessage(errCode);
}
