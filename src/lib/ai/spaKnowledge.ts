import type { SupabaseClient } from "@supabase/supabase-js";
import { branchContacts } from "@/lib/data";
import { getActivePromotions, type ActivePromotion } from "@/lib/supabase/queries/publicContent";
import { logQueryError } from "@/lib/supabase/logQueryError";

// What GlowSync AI knows about the spa itself — branch hours (as Admin set
// them), contact details, today's promos and the booking / payment / reward
// rules, and which professionals work in each department — shared by the
// website chat and the Facebook Page chatbot.

export type BranchInfo = { name: string; address: string; phone: string; hours: string | null };

export type StaffInfo = { name: string; department: string; branch: string };

export type SpaKnowledge = {
  branches: BranchInfo[];
  gracePeriodMinutes: number;
  promos: ActivePromotion[];
  /** Professionals by branch and department (Clinic / Hair / Nails). */
  staff?: StaffInfo[];
};

/** "8:00 AM - 7:00 PM" → minutes since midnight, or null if unreadable. */
export function parseHours(hours: string | null): { open: number; close: number } | null {
  const m = (hours ?? "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  const toMin = (h: string, min: string, ap: string) => ((Number(h) % 12) + (ap.toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(min);
  return { open: toMin(m[1], m[2], m[3]), close: toMin(m[4], m[5], m[6]) };
}

/** Open / closed right now, by Philippine time. */
export function openNow(hours: string | null, now = new Date()): boolean | null {
  const h = parseHours(hours);
  if (!h) return null;
  const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const cur = manila.getHours() * 60 + manila.getMinutes();
  return cur >= h.open && cur < h.close;
}

export async function loadSpaKnowledge(supabase: SupabaseClient): Promise<SpaKnowledge> {
  const [branchRes, settingsRes, promos, staffRes] = await Promise.all([
    supabase.from("branches").select("name, hours"),
    supabase.from("spa_settings").select("grace_period_minutes").eq("id", true).maybeSingle(),
    getActivePromotions(supabase, 12).catch(() => [] as ActivePromotion[]),
    supabase.from("staff_members").select("full_name, department, branch:branches(name)").order("full_name"),
  ]);
  if (branchRes.error) logQueryError("spa knowledge branches", branchRes.error);
  if (staffRes.error) logQueryError("spa knowledge staff", staffRes.error);
  type StaffRow = { full_name: string; department: string; branch: { name: string } | { name: string }[] | null };
  const staff = ((staffRes.data ?? []) as unknown as StaffRow[])
    .map((s) => ({
      name: s.full_name,
      department: s.department,
      branch: (Array.isArray(s.branch) ? s.branch[0]?.name : s.branch?.name) ?? "",
    }))
    .filter((s) => s.name && s.branch);
  const dbHours = new Map(((branchRes.data ?? []) as { name: string; hours: string | null }[]).map((b) => [b.name, b.hours]));

  return {
    branches: branchContacts.map((b) => ({
      name: b.name,
      address: b.address,
      phone: b.phone,
      // Admin → Branches is the source of truth; the site's defaults otherwise.
      hours: dbHours.get(b.name) ?? b.hours[0]?.time ?? null,
    })),
    gracePeriodMinutes: (settingsRes.data as { grace_period_minutes: number } | null)?.grace_period_minutes ?? 10,
    promos,
    staff,
  };
}

function promoLine(p: ActivePromotion): string {
  const price = p.price != null ? ` — ₱${Number(p.price).toLocaleString()}` : "";
  const until = p.validUntil
    ? ` (until ${new Date(`${p.validUntil}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })})`
    : "";
  const badge = p.badge ? ` [${p.badge}]` : "";
  return `- ${p.title}${badge}${price} at ${p.branchName}${until}${p.description ? `: ${p.description.replace(/\s+/g, " ").slice(0, 160)}` : ""}`;
}

/** "- One Cecilia Center — Clinic: Ana, Bea · Hair: Carla" per branch. */
export function staffText(staff: StaffInfo[]): string {
  if (!staff.length) return "- (staff list not available — suggest choosing \"any professional\" when booking)";
  const byBranch = new Map<string, Map<string, string[]>>();
  for (const s of staff) {
    const depts = byBranch.get(s.branch) ?? new Map<string, string[]>();
    depts.set(s.department, [...(depts.get(s.department) ?? []), s.name]);
    byBranch.set(s.branch, depts);
  }
  return Array.from(byBranch.entries())
    .map(([branch, depts]) => `- ${branch} — ${Array.from(depts.entries()).map(([d, names]) => `${d}: ${names.join(", ")}`).join(" · ")}`)
    .join("\n");
}

/** The knowledge block for the assistant's instructions. */
export function knowledgeText(k: SpaKnowledge, now = new Date()): string {
  const today = now.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const branches = k.branches
    .map((b) => {
      const open = openNow(b.hours, now);
      const state = open === null ? "" : open ? " (open now)" : " (closed now)";
      return `- ${b.name}: open daily ${b.hours ?? "— hours not set"}${state}. Address: ${b.address}. Phone: ${b.phone}.`;
    })
    .join("\n");
  const promos = k.promos.length ? k.promos.map(promoLine).join("\n") : "- No promotions are running right now.";
  const staff = staffText(k.staff ?? []);

  return `Right now it is ${today} (Philippine time).

BRANCHES (Blush Spa & Aesthetics, Pagadian City) — these hours are current; always use them:
${branches}
Facebook: facebook.com/blushspaxaesthetics · Instagram: @blushspaxaesthetics_onececilia

ACTIVE PROMOTIONS:
${promos}

OUR PROFESSIONALS (a service's [department] in the catalog shows who can perform it):
${staff}

HOW THINGS WORK (answer from these facts only):
- Booking: sign in with Google or Facebook, tap Book Now, then choose branch → services → professional (or "any") → date and time → confirm. Booking from a service or promo pre-selects it.
- Payment: "Pay Now" = pay by GCash and upload the receipt (the Front Desk verifies it, then confirms the booking); "Pay Later" = pay at the branch (cash or GCash) on the day. New bookings stay Pending until the Front Desk confirms; clients are notified in the app, by email, and on Messenger if connected.
- Late arrivals: clients who haven't arrived ${k.gracePeriodMinutes} minutes after their start time are marked No Show and the booking is cancelled.
- Refunds: payments are non-refundable. To reschedule or cancel, the client calls or messages their branch; a paid booking's payment carries over to the new date.
- Walk-ins are welcome during branch hours; tell the Front Desk the name on your GlowSync account to link the visit.
- GlowPoints: genuine reviews of completed visits earn GlowPoints, which can be redeemed for vouchers in My Glow → My Rewards; the Front Desk applies vouchers at payment. Unused vouchers expire and the points are returned.
- Promo packages bundle several services at one promo price, booked with "Book Promo".
- Notifications: clients can turn email and phone alerts on or off in My Glow, and connect Messenger there for reminders.
- Hair services are priced by hair length (Short / Medium / Long).
- Available times: you cannot see the live schedule. Tell the client to tap Book Now — after they choose the branch,
  service and professional (or "any"), it shows only the times that are still open. Never guess times or say someone is free.`;
}
