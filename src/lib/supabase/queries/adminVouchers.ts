import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";

export type OptionInput = {
  id: string | null;
  name: string;
  pointsCost: number;
  discountAmount: number;
  validDays: number;
  active: boolean;
  sortOrder: number;
};

export type VoucherStatus = "active" | "used" | "expired" | "cancelled";

export type AdminVoucherRow = {
  id: string;
  code: string;
  clientName: string;
  name: string;
  status: VoucherStatus;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  discountAmount: number;
  discountApplied: number | null;
};

export const VOUCHER_PAGE_SIZE = 20;

export type LoadStatus = "ok" | "unavailable" | "error";

/** "unavailable" = the migration isn't applied yet; "error" = any other failure. */
export function loadStatus(errors: ({ code?: string; message?: string } | null | undefined)[]): LoadStatus {
  const failed = errors.filter((e): e is { code?: string; message?: string } => !!e);
  if (failed.length === 0) return "ok";
  return failed.some((e) => isNotMigratedError(e)) ? "unavailable" : "error";
}

export type VouchersResult = { status: "unavailable" } | { status: "error" } | { status: "ok"; rows: AdminVoucherRow[]; total: number };
export type RedemptionStats = { pointsRedeemedThisMonth: number; activeVouchers: number; discountsThisMonth: number };
export type StatsResult = { status: "unavailable" } | { status: "error" } | { status: "ok"; stats: RedemptionStats };

export function validateOption(o: OptionInput): string | null {
  const name = o.name.trim();
  if (name.length < 1 || name.length > 60) return "Name must be 1–60 characters.";
  if (!Number.isInteger(o.pointsCost) || o.pointsCost < 1 || o.pointsCost > 1_000_000) {
    return "Points must be a whole number from 1 to 1,000,000.";
  }
  if (!Number.isFinite(o.discountAmount) || o.discountAmount <= 0 || o.discountAmount > 100_000) {
    return "Discount must be more than ₱0 and at most ₱100,000.";
  }
  if (!Number.isInteger(o.validDays) || o.validDays < 1 || o.validDays > 365) return "Valid days must be from 1 to 365.";
  return null;
}

export function validateAdjustment(points: number, reason: string): string | null {
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 100_000) {
    return "Enter a non-zero whole number of points (max 100,000).";
  }
  const r = reason.trim();
  if (r.length < 1 || r.length > 500) return "Enter a reason (up to 500 characters).";
  return null;
}

function rpcMessage(error: { message?: string } | null): string | null {
  if (!error) return null;
  const m = error.message ?? "";
  if (m.includes("REVIEW_FORBIDDEN") || m.includes("VOUCHER_FORBIDDEN")) return "Only admins can do this.";
  if (m.includes("REVIEW_INVALID") || m.includes("VOUCHER_INVALID") || m.includes("POINTS_INVALID")) {
    return "Check the values and try again.";
  }
  if (m.includes("POINTS_NEGATIVE")) return "That would make the balance negative.";
  return "Couldn't save. Please try again.";
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Double-quoted PostgREST pattern so commas/parentheses can't break an `or` filter. */
function quotedPattern(q: string) {
  return `%${escapeLike(q)}%`.replace(/[\\"]/g, (c) => `\\${c}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function manilaMonthStart(): string {
  const manila = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
  return `${manila}-01T00:00:00+08:00`;
}

export async function listOptions(supabase: SupabaseClient): Promise<(OptionInput & { id: string })[] | null> {
  const { data, error } = await supabase
    .from("reward_options")
    .select("id, name, points_cost, discount_amount, valid_days, active, sort_order")
    .order("sort_order")
    .order("points_cost");
  if (error) {
    logQueryError("listOptions", error);
    return null;
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    pointsCost: Number(r.points_cost),
    discountAmount: Number(r.discount_amount),
    validDays: Number(r.valid_days),
    active: !!r.active,
    sortOrder: Number(r.sort_order),
  }));
}

export async function saveOption(supabase: SupabaseClient, o: OptionInput): Promise<string | null> {
  const invalid = validateOption(o);
  if (invalid) return invalid;
  const { error } = await supabase.rpc("save_reward_option", {
    p_id: o.id,
    p_name: o.name.trim(),
    p_points: o.pointsCost,
    p_discount: o.discountAmount,
    p_valid_days: o.validDays,
    p_active: o.active,
    p_sort: o.sortOrder,
  });
  return rpcMessage(error);
}

type RawVoucher = {
  id: string;
  code: string;
  name: string;
  status: VoucherStatus;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  discount_amount: number | string;
  discount_applied: number | string | null;
  client: { full_name: string | null } | { full_name: string | null }[] | null;
};

export async function listVouchers(
  supabase: SupabaseClient,
  q: { search?: string; status?: string; page?: number }
): Promise<VouchersResult> {
  let query = supabase
    .from("reward_vouchers")
    .select(
      "id, code, name, status, created_at, expires_at, used_at, discount_amount, discount_applied, client:profiles!reward_vouchers_client_id_fkey(full_name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });
  if (q.status) query = query.eq("status", q.status);
  const search = q.search?.trim();
  if (search) {
    const { data: people, error: peopleError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("full_name", `%${escapeLike(search)}%`)
      .limit(200);
    if (peopleError) logQueryError("listVouchers client lookup", peopleError);
    const ids = ((people ?? []) as { id: string }[]).map((p) => p.id).filter((id) => UUID_RE.test(id));
    const code = `code.ilike."${quotedPattern(search)}"`;
    query = query.or(ids.length ? `${code},client_id.in.(${ids.join(",")})` : code);
  }
  const page = Math.max(1, q.page ?? 1);
  query = query.range((page - 1) * VOUCHER_PAGE_SIZE, page * VOUCHER_PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) {
    logQueryError("listVouchers", error);
    return { status: loadStatus([error]) === "unavailable" ? "unavailable" : "error" };
  }
  const rows = ((data ?? []) as unknown as RawVoucher[]).map((r) => {
    const client = Array.isArray(r.client) ? r.client[0] : r.client;
    return {
      id: r.id,
      code: r.code,
      clientName: client?.full_name ?? "",
      name: r.name,
      status: r.status,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      usedAt: r.used_at,
      discountAmount: Number(r.discount_amount),
      discountApplied: r.discount_applied == null ? null : Number(r.discount_applied),
    };
  });
  return { status: "ok", rows, total: count ?? 0 };
}

export async function cancelVoucher(supabase: SupabaseClient, id: string, reason: string): Promise<string | null> {
  const { error } = await supabase.rpc("cancel_voucher", { p_voucher_id: id, p_reason: reason.trim() });
  return rpcMessage(error);
}

export async function getRedemptionSettings(supabase: SupabaseClient): Promise<{ maxPerBooking: number; enabled: boolean } | null> {
  const { data, error } = await supabase
    .from("review_reward_settings")
    .select("max_voucher_discount, redemption_enabled")
    .eq("id", 1)
    .maybeSingle();
  if (error) logQueryError("getRedemptionSettings", error);
  if (!data) return null;
  const r = data as { max_voucher_discount: number | string; redemption_enabled: boolean };
  return { maxPerBooking: Number(r.max_voucher_discount), enabled: !!r.redemption_enabled };
}

export async function saveRedemptionSettings(
  supabase: SupabaseClient,
  s: { maxPerBooking: number; enabled: boolean }
): Promise<string | null> {
  if (!Number.isFinite(s.maxPerBooking) || s.maxPerBooking <= 0 || s.maxPerBooking > 100_000) {
    return "Check the values and try again.";
  }
  const { error } = await supabase.rpc("update_redemption_settings", { p_max: s.maxPerBooking, p_enabled: s.enabled });
  return rpcMessage(error);
}

export async function getRedemptionStats(
  supabase: SupabaseClient
): Promise<StatsResult> {
  const since = manilaMonthStart();
  const [redeemed, active, used] = await Promise.all([
    supabase.from("points_transactions").select("points").eq("type", "redemption").gte("created_at", since),
    supabase.from("reward_vouchers").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("reward_vouchers").select("discount_applied").gte("used_at", since),
  ]);
  if (redeemed.error) logQueryError("getRedemptionStats redemptions", redeemed.error);
  if (active.error) logQueryError("getRedemptionStats active", active.error);
  if (used.error) logQueryError("getRedemptionStats used", used.error);
  const status = loadStatus([redeemed.error, active.error, used.error]);
  if (status !== "ok") return { status };
  return {
    status: "ok",
    stats: {
      pointsRedeemedThisMonth: ((redeemed.data ?? []) as { points: number }[]).reduce((s, r) => s + -Number(r.points), 0),
      activeVouchers: active.count ?? 0,
      discountsThisMonth: ((used.data ?? []) as { discount_applied: number | string | null }[]).reduce(
        (s, r) => s + Number(r.discount_applied ?? 0),
        0
      ),
    },
  };
}

export async function searchClients(supabase: SupabaseClient, q: string): Promise<{ id: string; name: string; balance: number }[] | null> {
  const term = q.trim();
  if (!term) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, client_rewards(current_points)")
    .eq("role", "customer")
    .ilike("full_name", `%${escapeLike(term)}%`)
    .limit(10);
  if (error) {
    logQueryError("searchClients", error);
    return null;
  }
  type Raw = { id: string; full_name: string | null; client_rewards: { current_points: number } | { current_points: number }[] | null };
  return ((data ?? []) as unknown as Raw[]).map((p) => {
    const cr = Array.isArray(p.client_rewards) ? p.client_rewards[0] : p.client_rewards;
    return { id: p.id, name: p.full_name ?? "", balance: Number(cr?.current_points ?? 0) };
  });
}

export async function adjustPoints(
  supabase: SupabaseClient,
  clientId: string,
  points: number,
  reason: string
): Promise<{ balance: number } | { error: string }> {
  const invalid = validateAdjustment(points, reason);
  if (invalid) return { error: invalid };
  const { data, error } = await supabase.rpc("adjust_client_points", {
    p_client_id: clientId,
    p_points: points,
    p_reason: reason.trim(),
  });
  const message = rpcMessage(error);
  if (message) return { error: message };
  return { balance: Number(data) };
}
