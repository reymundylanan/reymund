import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";

// Public site content from real data: review highlights, active promotions
// and the announcement bar (065).

export type ReviewHighlight = {
  id: string;
  reviewer: string;
  rating: number;
  text: string;
  about: string | null;
  date: string;
};

export type ReviewStats = { average: number | null; count: number };

/** Recent 4–5★ reviews with a comment (service + staff reviews from the
 * public views), and the overall average across those views. */
export async function getReviewHighlights(supabase: SupabaseClient, limit = 6): Promise<{ highlights: ReviewHighlight[]; stats: ReviewStats }> {
  const [svc, staff] = await Promise.all([
    supabase.from("public_service_reviews").select("id, rating, text, reviewer, created_at, service_id").order("created_at", { ascending: false }).limit(300),
    supabase.from("public_staff_reviews").select("id, rating, text, reviewer, created_at, service_name").order("created_at", { ascending: false }).limit(300),
  ]);
  logQueryError("getReviewHighlights service", svc.error);
  logQueryError("getReviewHighlights staff", staff.error);

  type Row = { id: string; rating: number; text: string | null; reviewer: string | null; created_at: string; service_id?: string | null; service_name?: string | null };
  const svcRows = (svc.data ?? []) as Row[];
  const staffRows = (staff.data ?? []) as Row[];

  const serviceIds = [...new Set(svcRows.map((r) => r.service_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (serviceIds.length) {
    const { data } = await supabase.from("branch_services").select("id, name").in("id", serviceIds);
    for (const s of (data ?? []) as { id: string; name: string }[]) names.set(s.id, s.name);
  }

  const all = [
    ...svcRows.map((r) => ({ ...r, about: r.service_id ? names.get(r.service_id) ?? null : null })),
    ...staffRows.map((r) => ({ ...r, about: r.service_name ?? null })),
  ];
  const ratings = all.map((r) => r.rating);
  const highlights = all
    .filter((r) => r.rating >= 4 && (r.text ?? "").trim().length >= 8)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      reviewer: r.reviewer?.trim() || "Client",
      rating: r.rating,
      text: (r.text ?? "").trim(),
      about: r.about,
      date: new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    }));
  return {
    highlights,
    stats: { average: ratings.length ? Math.round((ratings.reduce((s, x) => s + x, 0) / ratings.length) * 10) / 10 : null, count: ratings.length },
  };
}

export type ActivePromotion = {
  id: string;
  title: string;
  badge: string | null;
  description: string | null;
  price: number | null;
  branchName: string;
  validUntil: string | null;
};

export async function getActivePromotions(supabase: SupabaseClient, limit = 6): Promise<ActivePromotion[]> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const { data, error } = await supabase
    .from("branch_promotions")
    .select("id, title, badge, description, price, valid_until, created_at, branch:branches(name)")
    .eq("is_active", true)
    .or(`valid_from.is.null,valid_from.lte.${today}`)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  logQueryError("getActivePromotions", error);
  type Row = { id: string; title: string; badge: string | null; description: string | null; price: number | null; valid_until: string | null; branch: { name: string } | { name: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((p) => ({
    id: p.id,
    title: p.title,
    badge: p.badge,
    description: p.description,
    price: p.price,
    branchName: (Array.isArray(p.branch) ? p.branch[0]?.name : p.branch?.name) ?? "Blush Spa",
    validUntil: p.valid_until,
  }));
}

export type Announcement = { enabled: boolean; text: string; link: string | null; linkLabel: string | null };

const DEFAULT_ANNOUNCEMENT: Announcement = {
  enabled: true,
  text: "Exclusive Mother's Day Special: Get 20% off all Floral Therapy sessions.",
  link: "/#promotions",
  linkLabel: "Learn More",
};

export async function getAnnouncement(supabase: SupabaseClient): Promise<Announcement> {
  const { data, error } = await supabase
    .from("spa_settings")
    .select("announcement_enabled, announcement_text, announcement_link, announcement_link_label")
    .eq("id", true)
    .maybeSingle();
  if (error) {
    if (!isNotMigratedError(error)) logQueryError("getAnnouncement", error);
    return DEFAULT_ANNOUNCEMENT;
  }
  return {
    enabled: data?.announcement_enabled ?? true,
    text: data?.announcement_text?.trim() ?? "",
    link: data?.announcement_link?.trim() || null,
    linkLabel: data?.announcement_link_label?.trim() || null,
  };
}

export async function saveAnnouncement(supabase: SupabaseClient, a: Announcement): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("spa_settings")
    .update({
      announcement_enabled: a.enabled,
      announcement_text: a.text.trim().slice(0, 200),
      announcement_link: a.link?.trim() || null,
      announcement_link_label: a.linkLabel?.trim().slice(0, 30) || null,
    })
    .eq("id", true);
  if (error && isNotMigratedError(error)) return { error: "Apply migration 065 first." };
  return { error: error?.message ?? null };
}

/** Only internal paths or http(s) URLs are allowed as the bar's link. */
export function safeAnnouncementLink(link: string | null): string | null {
  if (!link) return null;
  const l = link.trim();
  if (l.startsWith("/") && !l.startsWith("//")) return l;
  return /^https?:\/\//i.test(l) ? l : null;
}
