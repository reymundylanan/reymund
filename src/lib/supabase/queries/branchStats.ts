import { createClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import type { BranchStats } from "@/lib/branchGuide";

/** Live facts about each branch for GlowSync AI's introduction (read-only,
 * server side — like the branch pages). Missing data just leaves a fact out. */
export async function getBranchStats(names: { name: string; place: string; kind: BranchStats["kind"] }[]): Promise<Record<string, BranchStats>> {
  const out: Record<string, BranchStats> = {};
  const empty = (n: (typeof names)[number]): BranchStats => ({
    name: n.name, place: n.place, hours: null, services: 0, departments: [], staff: 0, livePromos: 0, promoTitle: null, rating: null, reviews: 0, kind: n.kind,
  });
  for (const n of names) out[n.name] = empty(n);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return out;

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data: branches, error } = await supabase.from("branches").select("id, name, hours").in("name", names.map((n) => n.name));
    if (error) {
      logQueryError("getBranchStats branches", error);
      return out;
    }
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all(
      ((branches ?? []) as { id: string; name: string; hours: string | null }[]).map(async (b) => {
        const [services, staff, promos, reviews] = await Promise.all([
          supabase.from("branch_services").select("name, department").eq("branch_id", b.id).eq("status", "Active"),
          supabase.from("staff_members").select("id", { count: "exact", head: true }).eq("branch_id", b.id),
          supabase.from("branch_promotions").select("title, valid_from, valid_until").eq("branch_id", b.id).eq("is_active", true),
          supabase.from("reviews").select("rating").eq("branch_id", b.id).eq("target_type", "branch").eq("status", "visible"),
        ]);
        const depts = new Map<string, number>();
        // Count each service once (a service can be listed once per variant).
        const names = new Set<string>();
        for (const s of (services.data ?? []) as { name: string; department: string | null }[]) {
          const key = s.name.toLowerCase().trim();
          if (names.has(key)) continue;
          names.add(key);
          if (s.department) depts.set(s.department, (depts.get(s.department) ?? 0) + 1);
        }
        const live = ((promos.data ?? []) as { title: string; valid_from: string | null; valid_until: string | null }[]).filter(
          (p) => (!p.valid_from || p.valid_from <= today) && (!p.valid_until || p.valid_until >= today)
        );
        const ratings = ((reviews.data ?? []) as { rating: number }[]).map((r) => Number(r.rating)).filter((r) => r > 0);
        const s = out[b.name];
        s.hours = b.hours;
        s.services = names.size;
        s.departments = [...depts.entries()].sort((x, y) => y[1] - x[1]).map(([d]) => d);
        s.staff = staff.count ?? 0;
        s.livePromos = live.length;
        s.promoTitle = live[0]?.title ?? null;
        s.reviews = ratings.length;
        s.rating = ratings.length ? Math.round((ratings.reduce((a, c) => a + c, 0) / ratings.length) * 10) / 10 : null;
      })
    );
  } catch (e) {
    logQueryError("getBranchStats", { message: e instanceof Error ? e.message : String(e) });
  }
  return out;
}
