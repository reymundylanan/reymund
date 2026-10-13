import { NextResponse } from "next/server";
import { checkSlot, freeStaffFor, suggestAlternatives, toMinutes } from "@/lib/multiBranch/engine";
import { loadContext } from "@/lib/multiBranch/load";
import { fail, requireAdmin, rpcFailure } from "@/lib/multiBranch/server";

type Body = { appointmentId: string; branchId: string; staffId: string | null; date: string; start: string; reason: string };

/** Confirms a move: re-checks against live data, then the database function
 * re-checks again under a lock and saves (never into an occupied slot). */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const body = (await request.json()) as Body;
  if (!body.appointmentId || !body.branchId || !/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") || !/^\d{2}:\d{2}/.test(body.start ?? "")) {
    return NextResponse.json({ error: "Missing branch, date or time." }, { status: 400 });
  }
  // The reason is optional; the history and the client notice still say why.
  const reason = body.reason?.trim() || "Rescheduled by Admin";

  const ctx = await loadContext(gate.admin, { date: body.date });
  const appt = ctx.appointments.find((a) => a.id === body.appointmentId);
  if (!appt) return NextResponse.json({ error: "That appointment is no longer upcoming." }, { status: 404 });

  const slot = {
    branchId: body.branchId,
    staffId: body.staffId,
    date: body.date,
    start: toMinutes(body.start),
    duration: appt.duration,
    departments: appt.departments,
    services: body.branchId === appt.branchId ? [] : appt.services,
    excludeAppointmentId: appt.id,
  };
  // No one chosen: assign the best qualified person who's free (never "nobody").
  if (!slot.staffId) slot.staffId = freeStaffFor(ctx, slot, appt.professionalId)[0] ?? null;
  const check = checkSlot(ctx, slot);
  if (!check.ok) {
    return NextResponse.json(
      { error: check.reasons.join(" "), code: check.code, check, suggestions: suggestAlternatives(ctx, appt, { days: 3, limit: 9 }) },
      { status: 409 }
    );
  }

  const { data, error } = await gate.supabase.rpc("admin_move_appointment", {
    p_appointment_id: appt.id,
    p_branch_id: body.branchId,
    p_professional_id: slot.staffId,
    p_date: body.date,
    p_start: `${body.start.slice(0, 5)}:00`,
    p_reason: reason,
    p_validation: { ...check.checks, checkedAt: new Date().toISOString() },
  });
  if (error) {
    // e.g. the slot was taken a moment ago: offer updated alternatives.
    const after = await loadContext(gate.admin, { date: body.date });
    const latest = after.appointments.find((a) => a.id === appt.id);
    return fail(rpcFailure(error), { suggestions: latest ? suggestAlternatives(after, latest, { days: 3, limit: 9 }) : [] });
  }
  return NextResponse.json({ logId: data as string });
}
