import { NextResponse } from "next/server";
import { manilaNow } from "@/lib/multiBranch/load";
import { requireAdmin } from "@/lib/multiBranch/server";
import { logQueryError } from "@/lib/supabase/logQueryError";

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type VisitRow = {
  id: string;
  booking_code: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number | null;
  status: string;
  session_status: string | null;
  visit_type: string | null;
  notes: string | null;
  branch: Rel<{ name: string }>;
  professional: Rel<{ full_name: string }>;
  appointment_services: { service_name: string; position: number }[] | null;
  payments: { amount: number | string | null; status: string }[] | null;
};

/** One client's details: contact info, upcoming bookings and recent visits.
 * key = "c:<profile id>" (account) or "w:<name>|<phone>" (walk-in). */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const admin = gate.admin;
  const { today } = manilaNow();

  let profile: Record<string, unknown> | null = null;
  let q = admin
    .from("appointments")
    .select(
      "id, booking_code, scheduled_date, start_time, duration_minutes, status, session_status, visit_type, notes, branch:branches(name), professional:staff_members(full_name), appointment_services(service_name, position), payments(amount, status)"
    )
    .order("scheduled_date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(40);

  if (key.startsWith("c:")) {
    const id = key.slice(2);
    const { data, error } = await admin
      .from("profiles")
      .select("full_name, email, phone, gender, address, created_at, vip, loyalty_points, allergy, preferences, branch:branches(name)")
      .eq("id", id)
      .maybeSingle();
    if (error) logQueryError("client details profile", error);
    if (data) profile = { ...data, branch: one((data as { branch: Rel<{ name: string }> }).branch)?.name ?? null };
    q = q.eq("client_id", id);
  } else if (key.startsWith("w:")) {
    const [name, phone] = key.slice(2).split("|");
    q = q.is("client_id", null).eq("walkin_name", name);
    if (phone) q = q.eq("walkin_phone", phone);
  } else {
    return NextResponse.json({ error: "Unknown client." }, { status: 400 });
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const visits = ((data ?? []) as unknown as VisitRow[]).map((r) => {
    const lines = [...(r.appointment_services ?? [])].sort((a, b) => a.position - b.position);
    return {
      id: r.id,
      code: r.booking_code,
      date: r.scheduled_date,
      time: r.start_time.slice(0, 5),
      duration: r.duration_minutes ?? 60,
      status: r.status,
      sessionStatus: r.session_status,
      walkIn: r.visit_type === "walk_in",
      branch: one(r.branch)?.name ?? "—",
      staff: one(r.professional)?.full_name ?? null,
      services: lines.length ? lines.map((l) => l.service_name).join(", ") : (r.notes ?? "").split(" with ")[0] || "Service",
      paid: (r.payments ?? []).filter((p) => p.status === "settled").reduce((n, p) => n + Number(p.amount ?? 0), 0),
    };
  });
  const active = (v: (typeof visits)[number]) =>
    (v.status === "pending" || v.status === "confirmed") && !["no_show", "completed", "paid"].includes(v.sessionStatus ?? "");

  return NextResponse.json({
    profile,
    upcoming: visits.filter((v) => v.date >= today && active(v)).reverse(),
    recent: visits.filter((v) => !(v.date >= today && active(v)) && v.status !== "cancelled").slice(0, 10),
  });
}
