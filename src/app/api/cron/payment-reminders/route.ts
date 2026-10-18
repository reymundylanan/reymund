import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { safeEqual } from "@/lib/messenger/signature";
import { addDays } from "@/lib/multiBranch/engine";
import { manilaNow } from "@/lib/multiBranch/load";
import { planPaymentReminders, type ReminderBooking } from "@/lib/paymentReminders";

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type Row = {
  id: string;
  client_id: string | null;
  booking_code: string | null;
  scheduled_date: string;
  start_time: string;
  status: string;
  session_status: string | null;
  visit_type: string | null;
  notes: string | null;
  promo_price: number | null;
  branch: Rel<{ name: string }>;
  payments: { status: string; amount: number | null }[] | null;
  appointment_services: { service_name: string }[] | null;
};

/** Every morning (vercel.json, 9 AM Manila): a "Payment reminder" bell notice
 * (plus email and push) for tomorrow's bookings that still have money owed.
 * Vercel calls it with "Authorization: Bearer <CRON_SECRET>". */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Set CRON_SECRET in Vercel to turn on payment reminders." }, { status: 503 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { today } = manilaNow();
  const tomorrow = addDays(today, 1);

  const { data, error } = await admin
    .from("appointments")
    .select("id, client_id, booking_code, scheduled_date, start_time, status, session_status, visit_type, notes, promo_price, branch:branches(name), payments(status, amount), appointment_services(service_name)")
    .eq("scheduled_date", tomorrow)
    .in("status", ["pending", "confirmed"])
    .not("client_id", "is", null);
  if (error) {
    logQueryError("payment reminders", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return NextResponse.json({ date: tomorrow, checked: 0, sent: 0 });

  // Not twice for the same booking (an admin may have sent one already).
  const since = new Date(Date.now() - 36 * 3600_000).toISOString();
  const { data: recent } = await admin
    .from("client_notifications")
    .select("appointment_id")
    .eq("kind", "payment")
    .gte("created_at", since)
    .in("appointment_id", rows.map((r) => r.id));
  const notified = new Set(((recent ?? []) as { appointment_id: string }[]).map((r) => r.appointment_id));

  const bookings: ReminderBooking[] = rows.map((r) => {
    const services = (r.appointment_services ?? []).map((s) => s.service_name).join(" ");
    return {
      id: r.id,
      clientId: r.client_id,
      code: r.booking_code,
      date: r.scheduled_date,
      start: r.start_time,
      status: r.status,
      sessionStatus: r.session_status,
      visitType: r.visit_type,
      notes: r.notes,
      promoPrice: r.promo_price != null ? Number(r.promo_price) : null,
      branchName: one(r.branch)?.name ?? "the branch",
      isSpaParty: /spa package/i.test(`${services} ${r.notes ?? ""}`),
      payments: (r.payments ?? []).map((p) => ({ status: p.status, amount: Number(p.amount ?? 0) })),
      recentlyNotified: notified.has(r.id),
    };
  });

  const reminders = planPaymentReminders(bookings, today);
  let sent = 0;
  for (const r of reminders) {
    const { error: insertError } = await admin
      .from("client_notifications")
      .insert({ client_id: r.clientId, appointment_id: r.appointmentId, kind: "payment", title: r.title, body: r.body, link_path: r.linkPath });
    if (insertError) logQueryError("payment reminder insert", insertError);
    else sent += 1;
  }
  return NextResponse.json({ date: tomorrow, checked: rows.length, sent });
}
