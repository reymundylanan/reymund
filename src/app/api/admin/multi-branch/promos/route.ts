import { NextResponse } from "next/server";
import { manilaNow } from "@/lib/multiBranch/load";
import { requireAdmin } from "@/lib/multiBranch/server";
import { logQueryError } from "@/lib/supabase/logQueryError";

type PromoRow = {
  id: string;
  branch_id: string;
  title: string;
  department: string | null;
  category: string | null;
  price: number | null;
  price_medium: number | null;
  price_long: number | null;
  description: string | null;
  badge: string | null;
  discount_type: string | null;
  discount_value: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
};

// The promo fields copied to another branch (never ids, dates of announcing, etc.).
const COPY_FIELDS = [
  "title", "department", "category", "price", "price_medium", "price_long", "description",
  "badge", "discount_type", "discount_value", "valid_from", "valid_until",
] as const;

/** Every promo at every branch, with its included services and upcoming bookings. */
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { today } = manilaNow();
  const [promos, links, booked] = await Promise.all([
    gate.admin.from("branch_promotions").select("*").order("title"),
    gate.admin.from("promotion_services").select("promotion_id, position, service:branch_services(name)"),
    gate.admin.from("appointments").select("promotion_id").not("promotion_id", "is", null).gte("scheduled_date", today).in("status", ["pending", "confirmed"]),
  ]);
  if (promos.error) return NextResponse.json({ error: promos.error.message }, { status: 500 });
  if (links.error) logQueryError("promos links", links.error);

  type Link = { promotion_id: string; position: number; service: { name: string } | { name: string }[] | null };
  const services = new Map<string, string[]>();
  for (const l of ((links.data ?? []) as Link[]).sort((a, b) => a.position - b.position)) {
    const name = Array.isArray(l.service) ? l.service[0]?.name : l.service?.name;
    if (name) services.set(l.promotion_id, [...(services.get(l.promotion_id) ?? []), name]);
  }
  const bookings = new Map<string, number>();
  for (const b of (booked.data ?? []) as { promotion_id: string }[]) bookings.set(b.promotion_id, (bookings.get(b.promotion_id) ?? 0) + 1);

  return NextResponse.json({
    today,
    promos: ((promos.data ?? []) as PromoRow[]).map((p) => ({ ...p, services: services.get(p.id) ?? [], upcomingBookings: bookings.get(p.id) ?? 0 })),
  });
}

type Body =
  | { action: "toggle"; promoId: string; active: boolean }
  | { action: "copy"; promoId: string; branchId: string; move?: boolean };

/** Turn a promo on/off at a branch, or copy / move it to another branch.
 * Bookings already made with a promo keep it (price and branch) either way. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const body = (await request.json()) as Body;
  const admin = gate.admin;

  const { data: src, error: srcErr } = await admin.from("branch_promotions").select("*").eq("id", body.promoId).maybeSingle();
  if (srcErr || !src) return NextResponse.json({ error: "That promo no longer exists." }, { status: 404 });
  const promo = src as PromoRow;
  const { data: branchRows } = await admin.from("branches").select("id, name");
  const nameOf = (id: string) => ((branchRows ?? []) as { id: string; name: string }[]).find((b) => b.id === id)?.name ?? "another branch";

  const log = async (from: string | null, to: string, previous: Record<string, unknown>, next: Record<string, unknown>) => {
    // Recorded once migration 078 allows this type; never blocks the change.
    const { error } = await admin.from("branch_transfer_log").insert({
      transfer_type: "promo_availability",
      from_branch_id: from,
      to_branch_id: to,
      previous,
      next,
      initiated_by: gate.userId,
    });
    if (error) logQueryError("promo transfer log", error);
  };

  if (body.action === "toggle") {
    if (promo.is_active === body.active) return NextResponse.json({ ok: true });
    const { error } = await admin.from("branch_promotions").update({ is_active: body.active }).eq("id", promo.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await log(promo.branch_id, promo.branch_id, { promo: promo.title, branch: nameOf(promo.branch_id), status: promo.is_active ? "On" : "Off" }, { promo: promo.title, branch: nameOf(promo.branch_id), status: body.active ? "On" : "Off" });
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "copy" || !body.branchId || body.branchId === promo.branch_id) {
    return NextResponse.json({ error: "Choose another branch." }, { status: 400 });
  }
  const destName = nameOf(body.branchId);

  // Its included services must exist (active) at the destination, matched by name.
  const { data: links } = await admin.from("promotion_services").select("position, service:branch_services(name)").eq("promotion_id", promo.id);
  type Link = { position: number; service: { name: string } | { name: string }[] | null };
  const wanted = ((links ?? []) as Link[])
    .map((l) => ({ position: l.position, name: (Array.isArray(l.service) ? l.service[0]?.name : l.service?.name) ?? "" }))
    .filter((l) => l.name);
  let mapped: { service_id: string; position: number }[] = [];
  if (wanted.length) {
    const { data: destServices } = await admin.from("branch_services").select("id, name").eq("branch_id", body.branchId).eq("status", "Active");
    const byName = new Map(((destServices ?? []) as { id: string; name: string }[]).map((s) => [s.name.toLowerCase().trim(), s.id]));
    const missing = wanted.filter((w) => !byName.has(w.name.toLowerCase().trim())).map((w) => w.name);
    if (missing.length) {
      return NextResponse.json({ error: `${destName} doesn't offer ${missing.join(", ")} — add those services there first.` }, { status: 409 });
    }
    mapped = wanted.map((w) => ({ service_id: byName.get(w.name.toLowerCase().trim())!, position: w.position }));
  }

  // Already there? Turn that one on instead of making a duplicate.
  const { data: existing } = await admin.from("branch_promotions").select("id, is_active").eq("branch_id", body.branchId).eq("title", promo.title).maybeSingle();
  let destId: string;
  if (existing) {
    if ((existing as { is_active: boolean }).is_active && !body.move) {
      return NextResponse.json({ error: `${destName} already has this promo.` }, { status: 409 });
    }
    destId = (existing as { id: string }).id;
    const { error } = await admin.from("branch_promotions").update({ is_active: true }).eq("id", destId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const copy: Record<string, unknown> = { branch_id: body.branchId, is_active: true };
    for (const k of COPY_FIELDS) copy[k] = promo[k];
    const { data: inserted, error } = await admin.from("branch_promotions").insert(copy).select("id").single();
    if (error || !inserted) return NextResponse.json({ error: error?.message ?? "Couldn't copy the promo." }, { status: 500 });
    destId = (inserted as { id: string }).id;
    if (mapped.length) {
      const { error: linkErr } = await admin.from("promotion_services").insert(mapped.map((m) => ({ ...m, promotion_id: destId })));
      if (linkErr) {
        await admin.from("branch_promotions").delete().eq("id", destId);
        return NextResponse.json({ error: `Couldn't copy its services: ${linkErr.message}` }, { status: 500 });
      }
    }
  }

  // Move = copy there, then switch it off here (past bookings keep it).
  if (body.move && promo.is_active) {
    const { error } = await admin.from("branch_promotions").update({ is_active: false }).eq("id", promo.id);
    if (error) return NextResponse.json({ error: `Copied, but couldn't turn it off at ${nameOf(promo.branch_id)}: ${error.message}` }, { status: 500 });
  }
  await log(
    promo.branch_id,
    body.branchId,
    { promo: promo.title, branch: nameOf(promo.branch_id), status: promo.is_active ? "On" : "Off" },
    { promo: promo.title, branch: destName, status: "On", action: body.move ? "Moved" : "Copied", source_now: body.move ? "Off" : promo.is_active ? "On" : "Off" }
  );
  return NextResponse.json({ ok: true, promoId: destId });
}
