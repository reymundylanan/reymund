import type { ActivePromotion } from "@/lib/supabase/queries/publicContent";

export type HomePromo = ActivePromotion & { branchNames: string[] };

/** Home → Active Promotions: a varied, random pick on every visit.
 *  - the same deal at several branches is one card (all its branches listed),
 *  - one deal per category first (so it isn't all hair), then the rest,
 *  - shuffled, so returning visitors see different deals. */
export function pickHomePromotions(promos: ActivePromotion[], count: number, random: () => number = Math.random): HomePromo[] {
  const byDeal = new Map<string, HomePromo>();
  for (const p of promos) {
    const key = `${p.title.trim().toLowerCase()}|${p.price ?? ""}`;
    const seen = byDeal.get(key);
    if (seen) {
      if (!seen.branchNames.includes(p.branchName)) seen.branchNames.push(p.branchName);
      // Keep a photo if either copy has one.
      if (!seen.imagePath && p.imagePath) seen.imagePath = p.imagePath;
    } else {
      byDeal.set(key, { ...p, branchNames: [p.branchName] });
    }
  }

  const shuffled = shuffle([...byDeal.values()], random);
  const picked: HomePromo[] = [];
  const categories = new Set<string>();
  // First pass: one deal per category.
  for (const p of shuffled) {
    const cat = (p.category ?? p.department ?? "Other").toLowerCase();
    if (categories.has(cat)) continue;
    categories.add(cat);
    picked.push(p);
    if (picked.length === count) return picked;
  }
  // Then fill up with the rest.
  for (const p of shuffled) {
    if (picked.length === count) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked;
}

function shuffle<T>(list: T[], random: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** "One Cecilia Center" or "Both branches" / "3 branches". */
export function branchLabel(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "Blush Spa";
  return names.length === 2 ? "Both branches" : `${names.length} branches`;
}
