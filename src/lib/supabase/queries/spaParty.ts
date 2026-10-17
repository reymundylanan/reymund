import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";

/** A Spa Party package (Admin → Promotions → Spa Packages), with every
 * branch that offers the same package. */
export type SpaPartyPackage = {
  key: string;
  tier: string;
  price: number;
  inclusions: string[];
  branches: string[];
};

type Row = { badge: string | null; title: string; price: number | null; description: string | null; branch: { name: string } | { name: string }[] | null };

/** Same tier, price and inclusions at several branches = one card. Cheapest first. */
export function groupSpaPackages(rows: Row[]): SpaPartyPackage[] {
  const byKey = new Map<string, SpaPartyPackage>();
  for (const r of rows) {
    if (r.price == null) continue;
    // The tier (Premium / Basic) is the title; the badge is often just "SPA PKG".
    const title = r.title?.trim();
    const tier = (title && !/^spa package$/i.test(title) ? title : r.badge || "Spa Package").trim();
    const inclusions = (r.description ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    const key = `${tier.toLowerCase()}|${Number(r.price)}|${inclusions.join("|").toLowerCase()}`;
    const branch = (Array.isArray(r.branch) ? r.branch[0]?.name : r.branch?.name) ?? null;
    const entry = byKey.get(key) ?? { key, tier, price: Number(r.price), inclusions, branches: [] };
    if (branch && !entry.branches.includes(branch)) entry.branches.push(branch);
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => a.price - b.price || a.tier.localeCompare(b.tier));
}

export async function getSpaPartyPackages(supabase: SupabaseClient): Promise<SpaPartyPackage[]> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const { data, error } = await supabase
    .from("branch_promotions")
    .select("badge, title, price, description, branch:branches(name)")
    .eq("category", "Spa Package")
    .eq("is_active", true)
    .or(`valid_from.is.null,valid_from.lte.${today}`)
    .or(`valid_until.is.null,valid_until.gte.${today}`);
  if (error) {
    logQueryError("getSpaPartyPackages", error);
    return [];
  }
  return groupSpaPackages((data ?? []) as unknown as Row[]);
}
