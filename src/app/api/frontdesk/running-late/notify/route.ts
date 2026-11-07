import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import { manilaNow } from "@/lib/multiBranch/load";
import { LATE_MIN, runningLateMessage } from "@/lib/runningLate";

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const WAITING = ["arrived", "waiting", "ready", "late_arrival"];
const COOLDOWN_MINUTES = 90;

/** "Tell the next client": a bell notice (plus email and push) that their
 * appointment today may start a little late because their therapist is
 * finishing with someone. Admin, or the Front Desk for its own branch. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, branch_id").eq("id", auth.user.id).single();
  const role = me?.role as string | undefined;
  if (role !== "admin" && role !== "front_desk") return NextResponse.json({ error: "Only Admin or Front Desk can send this." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { appointmentId?: string; delay?: number };
  const delay = Math.round(Number(body.delay));
  if (!body.appointmentId) return NextResponse.json({ error: "Missing booking." }, { status: 400 });
  if (!Number.isFinite(delay) || delay < LATE_MIN || delay > 240) return NextResponse.json({ error: "The delay must be between 5 minutes and 4 hours." }, { status: 400 });

  const admin = createAdminClient();
  const { data: appt, error } = await admin
    .from("appointments")
    .select("id, client_id, walkin_name, walkin_phone, branch_id, scheduled_date, start_time, status, session_status, branch:branches(name)")
    .eq("id", body.appointmentId)
    .maybeSingle();
  if (error) logQueryError("running late notify", error);
  if (!appt) return NextResponse.json({ error: "That booking could not be found." }, { status: 404 });
  if (role === "front_desk" && (!me?.branch_id || appt.branch_id !== me.branch_id)) {
    return NextResponse.json({ error: "This booking belongs to another branch." }, { status: 403 });
  }
  const notStarted = (appt.status === "pending" || appt.status === "confirmed") && (appt.session_status == null || WAITING.includes(appt.session_status));
  if (appt.scheduled_date !== manilaNow().today || !notStarted) {
    return NextResponse.json({ error: "This booking isn't waiting to start today any more." }, { status: 409 });
  }
  if (!appt.client_id) {
    const phone = appt.walkin_phone ? ` — call or text them at ${appt.walkin_phone}` : "";
    return NextResponse.json({ error: `${appt.walkin_name ?? "This client"} has no account, so they can't get notices${phone}.` }, { status: 409 });
  }

  // One heads-up per booking every while, so nobody is flooded.
  const since = new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString();
  const { data: recent } = await admin
    .from("client_notifications")
    .select("created_at")
    .eq("appointment_id", appt.id)
    .eq("kind", "running_late")
    .gte("created_at", since)
    .limit(1);
  if (recent?.length) return NextResponse.json({ error: "This client was already told they may start late." }, { status: 429 });

  const [h, m] = String(appt.start_time).split(":").map(Number);
  const branchName = one(appt.branch as Rel<{ name: string }>)?.name ?? "the branch";
  const { data: notice, error: insertError } = await admin
    .from("client_notifications")
    .insert({
      client_id: appt.client_id,
      appointment_id: appt.id,
      kind: "running_late",
      title: "Running a little late",
      body: runningLateMessage({ start: h * 60 + (m || 0), delay }, branchName),
      link_path: `/my-glow/appointments/${appt.id}`,
    })
    .select("created_at")
    .single();
  if (insertError) {
    // The 'running_late' kind arrives with migration 088 (a check-constraint error before it).
    const missing = isNotMigratedError(insertError) || insertError.code === "23514";
    if (!missing) logQueryError("running late notify insert", insertError);
    return NextResponse.json(
      { error: missing ? "This needs database migration 088 — apply it in Supabase first." : "Couldn't send the notice. Please try again." },
      { status: missing ? 503 : 500 }
    );
  }
  return NextResponse.json({ sentAt: notice.created_at });
}
