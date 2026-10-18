import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";

/** Promos ticked "Show on home page" (083), by id. Empty before 083. */
export async function getHomePromoIds(supabase: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await supabase.from("branch_promotions").select("id").in("id", ids).eq("show_on_home", true);
  if (error) {
    logQueryError("getHomePromoIds", error);
    return new Set();
  }
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

/** Uploaded photos (080) for these promotions, by promo id. A promo with the
 * same name as one that has a photo (e.g. at another branch) shares it.
 * Empty — so every promo keeps its category picture — before 080 is applied. */
export async function getPromoPhotoPaths(supabase: SupabaseClient, promos: { id: string; title: string }[]): Promise<Map<string, string>> {
  if (!promos.length) return new Map();
  const { data, error } = await supabase
    .from("branch_promotions")
    .select("id, title, image_path")
    .in("title", [...new Set(promos.map((p) => p.title))])
    .not("image_path", "is", null);
  if (error) {
    logQueryError("getPromoPhotoPaths", error);
    return new Map();
  }
  const rows = (data ?? []) as { id: string; title: string; image_path: string }[];
  const byId = new Map(rows.map((r) => [r.id, r.image_path]));
  const byTitle = new Map(rows.map((r) => [r.title, r.image_path]));
  const out = new Map<string, string>();
  for (const p of promos) {
    const path = byId.get(p.id) ?? byTitle.get(p.title);
    if (path) out.set(p.id, path);
  }
  return out;
}
