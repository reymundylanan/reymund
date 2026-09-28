import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientPromo = {
  id: string;
  branchId: string;
  branchName: string;
  title: string;
  department: string | null;
  category: string | null;
  price: number | null;
  description: string | null;
  badge: string | null;
  validUntil: string | null;
  imageUrl: string | null;
};

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type PromoRow = {
  id: string;
  branch_id: string;
  title: string;
  department: string | null;
  category: string | null;
  price: number | null;
  description: string | null;
  badge: string | null;
  valid_from: string | null;
  valid_until: string | null;
  image_url: string | null;
  branch: Rel<{ name: string }>;
};

/** Picks the one promo to show this client on My Glow right now: active,
 * inside its date window, never shown to this client before, preferring
 * a promo from a branch they've actually booked at, and among those the
 * one expiring soonest (so a limited-time offer doesn't sit unseen while
 * something less urgent shows instead). Returns null when there's
 * nothing left to show — including when everything active has already
 * been dismissed. */
export async function getPromoForClient(supabase: SupabaseClient, clientId: string): Promise<ClientPromo | null> {
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: promos, error }, { data: seenRows }, { data: visitedRows }] = await Promise.all([
    supabase
      .from("branch_promotions")
      .select("id, branch_id, title, department, category, price, description, badge, valid_from, valid_until, image_url, branch:branches(name)")
      .eq("is_active", true)
      .or(`valid_from.is.null,valid_from.lte.${today}`)
      .or(`valid_until.is.null,valid_until.gte.${today}`),
    supabase.from("client_promo_views").select("promo_id").eq("client_id", clientId),
    supabase.from("appointments").select("branch_id").eq("client_id", clientId).not("branch_id", "is", null),
  ]);

  if (error) {
    console.error("getPromoForClient failed:", error);
    return null;
  }

  const seenIds = new Set(((seenRows ?? []) as { promo_id: string }[]).map((r) => r.promo_id));
  const candidates = ((promos ?? []) as unknown as PromoRow[]).filter((p) => !seenIds.has(p.id));
  if (candidates.length === 0) return null;

  const visitedBranchIds = new Set(((visitedRows ?? []) as { branch_id: string }[]).map((r) => r.branch_id));
  const preferred = candidates.filter((p) => visitedBranchIds.has(p.branch_id));
  const pool = preferred.length > 0 ? preferred : candidates;

  pool.sort((a, b) => {
    if (!a.valid_until) return 1;
    if (!b.valid_until) return -1;
    return a.valid_until.localeCompare(b.valid_until);
  });

  const chosen = pool[0];
  return {
    id: chosen.id,
    branchId: chosen.branch_id,
    branchName: one(chosen.branch)?.name ?? "Blush Spa",
    title: chosen.title,
    department: chosen.department,
    category: chosen.category,
    price: chosen.price,
    description: chosen.description,
    badge: chosen.badge,
    validUntil: chosen.valid_until,
    imageUrl: chosen.image_url,
  };
}

export async function dismissPromo(supabase: SupabaseClient, clientId: string, promoId: string): Promise<void> {
  const { error } = await supabase
    .from("client_promo_views")
    .upsert({ client_id: clientId, promo_id: promoId }, { onConflict: "client_id,promo_id" });
  if (error) console.error("dismissPromo failed:", error);
}

export async function getPromoById(supabase: SupabaseClient, promoId: string): Promise<ClientPromo | null> {
  const { data, error } = await supabase
    .from("branch_promotions")
    .select("id, branch_id, title, department, category, price, description, badge, valid_from, valid_until, image_url, branch:branches(name)")
    .eq("id", promoId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("getPromoById failed:", error);
    return null;
  }
  const row = data as unknown as PromoRow;
  return {
    id: row.id,
    branchId: row.branch_id,
    branchName: one(row.branch)?.name ?? "Blush Spa",
    title: row.title,
    department: row.department,
    category: row.category,
    price: row.price,
    description: row.description,
    badge: row.badge,
    validUntil: row.valid_until,
    imageUrl: row.image_url,
  };
}
