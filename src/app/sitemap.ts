import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { siteUrl } from "@/lib/siteUrl";
import { logQueryError } from "@/lib/supabase/logQueryError";

// Rebuilt at most once an hour, so new services and promos show up.
export const revalidate = 3600;

const PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/services", priority: 0.9, changeFrequency: "weekly" },
  { path: "/branches", priority: 0.8, changeFrequency: "monthly" },
  { path: "/branches/pagadian", priority: 0.7, changeFrequency: "monthly" },
  { path: "/branches/robinsons", priority: 0.7, changeFrequency: "monthly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.5, changeFrequency: "monthly" },
  { path: "/feedback", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
];

/** Every public page, each service and active promo, and each team member. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const entries: MetadataRoute.Sitemap = PAGES.map((p) => ({ url: `${base}${p.path === "/" ? "" : p.path}`, lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority }));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return entries;
  // Public data only (the anonymous key), no cookies needed.
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  const [branch, promos, staff] = await Promise.all([
    supabase.from("branches").select("id").eq("name", "One Cecilia Center").maybeSingle(),
    supabase
      .from("branch_promotions")
      .select("id, created_at")
      .eq("is_active", true)
      .or(`valid_until.is.null,valid_until.gte.${today}`),
    supabase.from("staff_members").select("id"),
  ]);
  for (const [label, res] of Object.entries({ branch, promos, staff })) if (res.error) logQueryError(`sitemap ${label}`, res.error);

  // The Services page lists One Cecilia Center's services.
  if (branch.data?.id) {
    const { data: services, error } = await supabase.from("branch_services").select("id").eq("branch_id", branch.data.id).eq("status", "Active");
    if (error) logQueryError("sitemap services", error);
    for (const s of services ?? []) entries.push({ url: `${base}/services/${s.id}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  }
  for (const p of (promos.data ?? []) as { id: string; created_at: string }[]) {
    entries.push({ url: `${base}/promos/${p.id}`, lastModified: new Date(p.created_at), changeFrequency: "weekly", priority: 0.6 });
  }
  for (const m of (staff.data ?? []) as { id: string }[]) {
    entries.push({ url: `${base}/team/${m.id}`, lastModified: now, changeFrequency: "monthly", priority: 0.4 });
  }
  return entries;
}
