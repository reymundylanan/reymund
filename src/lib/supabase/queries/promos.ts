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
  branch: Rel<{ name: string }>;
};

export async function getPromoById(supabase: SupabaseClient, promoId: string): Promise<ClientPromo | null> {
  const { data, error } = await supabase
    .from("branch_promotions")
    .select("id, branch_id, title, department, category, price, description, badge, valid_from, valid_until, branch:branches(name)")
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
  };
}
