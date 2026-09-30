import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { redeemErrorMessage } from "@/lib/vouchers";

export type RewardOption = { id: string; name: string; pointsCost: number; discountAmount: number; validDays: number };
export type Voucher = {
  id: string;
  name: string;
  code: string;
  discountAmount: number;
  pointsUsed: number;
  status: "active" | "used" | "expired" | "cancelled";
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
  discountApplied: number | null;
};
/** null = redemption isn't set up yet (migration 053 not applied). */
export type RedemptionState = { enabled: boolean; options: RewardOption[] } | null;

type OptionRow = { id: string; name: string; points_cost: number; discount_amount: number | string; valid_days: number };
type VoucherRow = {
  id: string;
  name: string;
  code: string;
  discount_amount: number | string;
  points_used: number;
  status: Voucher["status"];
  expires_at: string;
  created_at: string;
  used_at: string | null;
  discount_applied: number | string | null;
};

export async function getRedemptionState(supabase: SupabaseClient): Promise<RedemptionState> {
  const [optionsRes, settingsRes] = await Promise.all([
    supabase
      .from("reward_options")
      .select("id, name, points_cost, discount_amount, valid_days")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("points_cost", { ascending: true }),
    supabase.from("review_reward_settings").select("redemption_enabled").maybeSingle(),
  ]);
  if (optionsRes.error || settingsRes.error) {
    logQueryError("getRedemptionState", optionsRes.error ?? settingsRes.error);
    return null;
  }
  const rows = (optionsRes.data ?? []) as OptionRow[];
  return {
    enabled: settingsRes.data?.redemption_enabled ?? true,
    options: rows.map((r) => ({
      id: r.id,
      name: r.name,
      pointsCost: r.points_cost,
      discountAmount: Number(r.discount_amount),
      validDays: r.valid_days,
    })),
  };
}

export async function getMyVouchers(supabase: SupabaseClient, clientId: string): Promise<Voucher[]> {
  const { data, error } = await supabase
    .from("reward_vouchers")
    .select("id, name, code, discount_amount, points_used, status, expires_at, created_at, used_at, discount_applied")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) {
    logQueryError("getMyVouchers", error);
    return [];
  }
  return ((data ?? []) as VoucherRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    discountAmount: Number(r.discount_amount),
    pointsUsed: r.points_used,
    status: r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    usedAt: r.used_at,
    discountApplied: r.discount_applied === null ? null : Number(r.discount_applied),
  }));
}

export async function redeemReward(
  supabase: SupabaseClient,
  optionId: string
): Promise<{ code: string; expiresAt: string; balance: number } | { error: string }> {
  const { data, error } = await supabase.rpc("redeem_reward", { p_option_id: optionId });
  if (error) {
    const code = /REDEEM_[A-Z_]+/.exec(error.message ?? "")?.[0];
    if (!code) logQueryError("redeemReward", error);
    return { error: redeemErrorMessage(code) };
  }
  const row = data as { code?: string; expiresAt?: string; balance?: number } | null;
  if (!row?.code || !row.expiresAt) return { error: redeemErrorMessage(null) };
  return { code: row.code, expiresAt: row.expiresAt, balance: Number(row.balance ?? 0) };
}

export function sortVouchers(vouchers: Voucher[]): Voucher[] {
  const active = vouchers
    .filter((v) => v.status === "active")
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
  const rest = vouchers
    .filter((v) => v.status !== "active")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return [...active, ...rest];
}
