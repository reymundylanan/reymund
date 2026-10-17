import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import { cleanPaymentNotice, PAYMENT_NOTICE_COOLDOWN_HOURS, PAYMENT_NOTICE_TITLE } from "@/lib/paymentNotice";

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Admin → Payments → "Notify client": a bell notice (plus email and push)
 * telling the client about a pending payment. Admins only. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Only Admins can notify clients about payments." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { paymentId?: string; message?: string };
  const message = cleanPaymentNotice(body.message);
  if (!body.paymentId) return NextResponse.json({ error: "Missing payment." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Write a message for the client." }, { status: 400 });

  const admin = createAdminClient();
  const { data: pay, error } = await admin
    .from("payments")
    .select("id, status, appointment:appointments(id, client_id, walkin_name, walkin_phone)")
    .eq("id", body.paymentId)
    .maybeSingle();
  if (error) logQueryError("payments notify", error);
  if (!pay) return NextResponse.json({ error: "That payment could not be found." }, { status: 404 });
  if (pay.status !== "pending") return NextResponse.json({ error: "This payment isn't pending any more." }, { status: 409 });

  const appt = one(pay.appointment as Rel<{ id: string; client_id: string | null; walkin_name: string | null; walkin_phone: string | null }>);
  if (!appt?.client_id) {
    const phone = appt?.walkin_phone ? ` — call or text them at ${appt.walkin_phone}` : "";
    return NextResponse.json({ error: `${appt?.walkin_name ?? "This client"} has no GlowSync account, so they can't get notices${phone}.` }, { status: 409 });
  }

  // One payment notice per booking every few hours, so a client isn't flooded.
  const since = new Date(Date.now() - PAYMENT_NOTICE_COOLDOWN_HOURS * 3600_000).toISOString();
  const { data: recent } = await admin
    .from("client_notifications")
    .select("created_at")
    .eq("appointment_id", appt.id)
    .eq("kind", "payment")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (recent?.length) {
    const mins = Math.max(1, Math.round((Date.now() - new Date(recent[0].created_at).getTime()) / 60000));
    const ago = mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`;
    return NextResponse.json({ error: `This client was already notified ${ago} ago. You can send another after ${PAYMENT_NOTICE_COOLDOWN_HOURS} hours.` }, { status: 429 });
  }

  const { data: notice, error: insertError } = await admin
    .from("client_notifications")
    .insert({ client_id: appt.client_id, appointment_id: appt.id, kind: "payment", title: PAYMENT_NOTICE_TITLE, body: message, link_path: `/my-glow/appointments/${appt.id}` })
    .select("id, created_at")
    .single();
  if (insertError) {
    // The 'payment' kind arrives with migration 081 (a check-constraint error before it).
    const missing = isNotMigratedError(insertError) || insertError.code === "23514";
    if (!missing) logQueryError("payments notify insert", insertError);
    return NextResponse.json(
      { error: missing ? "Payment notices need database migration 081 — apply it in Supabase first." : "Couldn't send the notice. Please try again." },
      { status: missing ? 503 : 500 }
    );
  }
  return NextResponse.json({ sentAt: notice.created_at });
}
