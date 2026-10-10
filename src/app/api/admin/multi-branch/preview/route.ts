import { NextResponse } from "next/server";
import { checkSlot, checkStaffTransfer, suggestAlternatives, toMinutes } from "@/lib/multiBranch/engine";
import { loadContext } from "@/lib/multiBranch/load";
import { requireAdmin } from "@/lib/multiBranch/server";
import { clientChannels } from "@/lib/multiBranch/channels";

type Body =
  | { type: "appointment"; appointmentId: string; branchId?: string; staffId?: string | null; date?: string; start?: string }
  | { type: "staff"; staffId: string; toBranchId: string; kind: "temporary" | "permanent"; dates: string[] };

/** Dry run against live data: validation checklist + valid alternatives. Nothing is saved. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const body = (await request.json()) as Body;

  if (body.type === "staff") {
    const ctx = await loadContext(gate.admin, { date: [...(body.dates ?? [])].sort().at(-1) });
    return NextResponse.json(checkStaffTransfer(ctx, body));
  }

  const ctx = await loadContext(gate.admin, { date: body.date });
  const appt = ctx.appointments.find((a) => a.id === body.appointmentId);
  if (!appt) {
    return NextResponse.json({ error: "That appointment is no longer upcoming (it may have been cancelled or completed)." }, { status: 404 });
  }

  const proposal =
    body.branchId && body.date && body.start
      ? checkSlot(ctx, {
          branchId: body.branchId,
          staffId: body.staffId ?? null,
          date: body.date,
          start: toMinutes(body.start),
          duration: appt.duration,
          departments: appt.departments,
          services: body.branchId === appt.branchId ? [] : appt.services,
          excludeAppointmentId: appt.id,
        })
      : null;

  // Dropped on one branch: that branch's options over a week; otherwise all branches, 3 days.
  const oneBranch = !!body.branchId && !body.start;
  const suggestions = suggestAlternatives(ctx, appt, {
    branchIds: oneBranch ? [body.branchId!] : undefined,
    days: oneBranch ? 7 : 3,
    limit: oneBranch ? 10 : 9,
  });

  return NextResponse.json({
    appointment: appt,
    proposal,
    suggestions,
    channels: await clientChannels(gate.admin, appt.clientId),
  });
}
