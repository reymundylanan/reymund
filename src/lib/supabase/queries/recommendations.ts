import type { SupabaseClient } from "@supabase/supabase-js";
import { getRecentAppointments } from "@/lib/supabase/queries/myGlow";

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
  const recent = await getRecentAppointments(supabase, clientId, 20);
  if (recent.length === 0) return [];

  const daysSinceLast = Math.floor((Date.now() - new Date(recent[0].scheduledDate).getTime()) / 86400000);
  const missedClient = daysSinceLast > WE_MISS_YOU_DAYS;

  const categoryCounts = new Map<string, number>();
  for (const appt of recent) {
    const cat = detectCategory(appt.serviceName);
    if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }
  if (categoryCounts.size === 0) return [];

  const lastCategory = detectCategory(recent[0].serviceName);
  const bookedNames = new Set(recent.map((a) => (a.serviceName ?? "").toLowerCase().trim()));
  const sortedCategories = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1]);

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
      (s) => s.category === category && !bookedNames.has(s.name.toLowerCase().trim()) && !usedIds.has(s.id)
    );
    if (candidates.length === 0) continue;
    const pick = candidates[0];
    usedIds.add(pick.id);

    const shortCategory = category.replace(" Services", "");
    const reason =
      picks.length === 0 && missedClient
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
