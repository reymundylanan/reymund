import type { SupabaseClient } from "@supabase/supabase-js";
import { getRecentAppointments } from "@/lib/supabase/queries/myGlow";
import { getClientReviewTaste } from "@/lib/supabase/queries/reviewTaste";

export type Recommendation = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string | null;
  reason: string;
};

const CATEGORY_KEYWORDS: { keywords: string[]; category: string }[] = [
  { keywords: ["facial", "face"], category: "Facial Services" },
  { keywords: ["hair"], category: "Hair Services" },
  { keywords: ["nail", "manicure", "pedicure", "foot spa"], category: "Nail Care" },
  { keywords: ["massage", "body", "wax", "wellness"], category: "Body & Wellness" },
  { keywords: ["brow", "lash"], category: "Brows & Lashes" },
  { keywords: ["laser"], category: "Laser Services" },
  { keywords: ["slimming"], category: "Slimming Services" },
  { keywords: ["liposuction"], category: "Non-Surgical Liposuction" },
  { keywords: ["doctor", "filler", "botox"], category: "Doctor's Procedure" },
  { keywords: ["drip", "cocktail"], category: "Cocktail Drips" },
];

/** Bookings only ever record the service as free text (see
 * myGlow.ts's comment on why service_id is unreliable), so category
 * detection is keyword matching on that text — same approach as
 * getServiceImage. Good enough to group "what kind of service did they
 * book" without needing the structured join to actually work. */
function detectCategory(serviceName: string | null): string | null {
  const name = (serviceName ?? "").toLowerCase();
  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => name.includes(k))) return category;
  }
  return null;
}

const WE_MISS_YOU_DAYS = 60;

/** Up to 3 real, bookable services for this client, each tied to a
 * category they've actually booked before — never a service they
 * already have in their recent history, so it reads as a genuine
 * suggestion rather than an echo. Most-booked category first ("Popular
 * with You"), their last-booked category gets "Similar to Your Last
 * Service", and if it's been a while since their last visit the top
 * pick is framed as a "We Miss You" nudge instead. Returns [] when
 * there's no booking history to base anything on. */
export async function getRecommendationsForClient(
  supabase: SupabaseClient,
  clientId: string,
  branchId: string
): Promise<Recommendation[]> {
  const [recent, taste] = await Promise.all([getRecentAppointments(supabase, clientId, 20), getClientReviewTaste(supabase, clientId)]);
  if (recent.length === 0 && taste.lovedCategories.length === 0) return [];

  const daysSinceLast = recent.length ? Math.floor((Date.now() - new Date(recent[0].scheduledDate).getTime()) / 86400000) : 0;
  const missedClient = daysSinceLast > WE_MISS_YOU_DAYS;

  const categoryCounts = new Map<string, number>();
  for (const appt of recent) {
    const cat = detectCategory(appt.serviceName);
    if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }
  // Their reviews lead: categories they rated highly first, then what they book
  // most; categories they rated poorly are left out.
  for (const c of taste.lovedCategories) categoryCounts.set(c, Math.max(categoryCounts.get(c) ?? 0, 1));
  for (const c of taste.avoidCategories) categoryCounts.delete(c);
  if (categoryCounts.size === 0) return [];

  const lastCategory = recent.length ? detectCategory(recent[0].serviceName) : null;
  const bookedNames = new Set(recent.map((a) => (a.serviceName ?? "").toLowerCase().trim()));
  const dislikedNames = new Set(taste.disliked.map((d) => d.name.toLowerCase().trim()));
  const loveRank = (c: string) => {
    const i = taste.lovedCategories.indexOf(c);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sortedCategories = Array.from(categoryCounts.entries()).sort((a, b) => loveRank(a[0]) - loveRank(b[0]) || b[1] - a[1]);

  const { data: services, error } = await supabase
    .from("branch_services")
    .select("id, name, category, price, description")
    .eq("branch_id", branchId)
    .eq("status", "Active");

  if (error) {
    console.error("getRecommendationsForClient failed:", error);
    return [];
  }

  const catalog = (services ?? []) as { id: string; name: string; category: string; price: number; description: string | null }[];
  const picks: Recommendation[] = [];
  const usedIds = new Set<string>();

  for (const [category, count] of sortedCategories) {
    if (picks.length >= 3) break;
    const candidates = catalog.filter(
      (s) => s.category === category && !bookedNames.has(s.name.toLowerCase().trim()) && !dislikedNames.has(s.name.toLowerCase().trim()) && !usedIds.has(s.id)
    );
    if (candidates.length === 0) continue;
    const pick = candidates[0];
    usedIds.add(pick.id);

    const shortCategory = category.replace(" Services", "");
    const loved = taste.loved.find((l) => l.category === category);
    const reason = loved
      ? `Because You Loved ${loved.name}`
      : picks.length === 0 && missedClient
        ? "We Miss You"
        : picks.length === 0 && count > 1
        ? "Popular with You"
        : category === lastCategory
        ? "Similar to Your Last Service"
        : `Because You Booked ${shortCategory}`;

    picks.push({ id: pick.id, name: pick.name, category: pick.category, price: pick.price, description: pick.description, reason });
  }

  return picks;
}
