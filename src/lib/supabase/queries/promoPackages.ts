import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import type { PackageService, PromoPackage } from "@/lib/promoPackage";

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

type PromoRow = {
  id: string;
  title: string;
  description: string | null;
  badge: string | null;
  branch_id: string;
  department: string | null;
  category: string | null;
  price: number | null;
  price_medium: number | null;
  price_long: number | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  branch: Rel<{ name: string }>;
};

const PROMO_COLUMNS =
  "id, title, description, badge, branch_id, department, category, price, price_medium, price_long, valid_from, valid_until, is_active, branch:branches(name)";

/** Included services per promo, in the order Admin listed them (empty before 067). */
async function loadIncluded(supabase: SupabaseClient, promoIds: string[]): Promise<Map<string, PackageService[]>> {
  const out = new Map<string, PackageService[]>();
  if (promoIds.length === 0) return out;
  const { data, error } = await supabase
    .from("promotion_services")
    .select("promotion_id, position, service:branch_services(id, name, category, department, duration, price)")
    .in("promotion_id", promoIds)
    .order("position");
  if (error) {
    if (!isNotMigratedError(error)) logQueryError("promo included services", error);
    return out;
  }
  type Row = { promotion_id: string; service: Rel<PackageService> };
  for (const r of (data ?? []) as unknown as Row[]) {
    const s = one(r.service);
    if (!s) continue;
    const list = out.get(r.promotion_id) ?? [];
    list.push({ ...s, price: Number(s.price) || 0 });
    out.set(r.promotion_id, list);
  }
  return out;
}

function toPackage(p: PromoRow, services: PackageService[]): PromoPackage {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    badge: p.badge,
    branchId: p.branch_id,
    branchName: one(p.branch)?.name ?? "Blush Spa",
    department: p.department,
    category: p.category,
    price: p.price != null ? Number(p.price) : null,
    priceMedium: p.price_medium != null ? Number(p.price_medium) : null,
    priceLong: p.price_long != null ? Number(p.price_long) : null,
    validFrom: p.valid_from,
    validUntil: p.valid_until,
    services,
  };
}

export async function getPromoPackage(supabase: SupabaseClient, id: string): Promise<PromoPackage | null> {
  const { data, error } = await supabase.from("branch_promotions").select(PROMO_COLUMNS).eq("id", id).maybeSingle();
  if (error) logQueryError("getPromoPackage", error);
  if (!data) return null;
  const included = await loadIncluded(supabase, [id]);
  return toPackage(data as unknown as PromoRow, included.get(id) ?? []);
}

/** The promo plus the same promo (same title) at other branches, all still
 * bookable today — the branch choices for a promo booking. The requested
 * promo comes first. */
export async function getPromoBranchOptions(supabase: SupabaseClient, id: string, todayKey: string): Promise<PromoPackage[]> {
  const { data: base, error } = await supabase.from("branch_promotions").select(PROMO_COLUMNS).eq("id", id).maybeSingle();
  if (error) logQueryError("getPromoBranchOptions", error);
  if (!base) return [];
  const promo = base as unknown as PromoRow;
  const { data: same } = await supabase
    .from("branch_promotions")
    .select(PROMO_COLUMNS)
    .eq("title", promo.title)
    .eq("is_active", true)
    .neq("id", promo.id);
  const rows = [promo, ...((same ?? []) as unknown as PromoRow[])].filter(
    (p) => p.is_active && (!p.valid_until || p.valid_until >= todayKey)
  );
  const included = await loadIncluded(supabase, rows.map((r) => r.id));
  return rows.map((r) => toPackage(r, included.get(r.id) ?? []));
}
