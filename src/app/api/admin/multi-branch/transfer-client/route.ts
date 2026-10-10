import { NextResponse } from "next/server";
import { checkSlot, toMinutes, toTime } from "@/lib/multiBranch/engine";
import { clientTransferContext } from "@/lib/multiBranch/clientTransfer";
import { fail, requireAdmin, rpcFailure } from "@/lib/multiBranch/server";

type Body = {
  key: string;
  toBranchId: string;
  reason: string;
  moves: { appointmentId: string; staffId: string | null; date: string; start: string }[];
};

/** Transfers a client (account or walk-in) to another branch, moving the
 * chosen upcoming bookings too. Everything is re-checked; all or nothing. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const body = (await request.json()) as Body;
  if (!body.key || !body.toBranchId) return NextResponse.json({ error: "Missing client or branch." }, { status: 400 });
  if (!body.reason?.trim()) return NextResponse.json({ error: "Please give a reason for the transfer.", code: "REASON_REQUIRED" }, { status: 400 });

  const { ctx, client, bookings } = await clientTransferContext(gate.admin, body.key, body.toBranchId);
  if (!client) return NextResponse.json({ error: "That client could not be found." }, { status: 404 });

  const moves = body.moves ?? [];
  const problems: string[] = [];
  const payload = moves.map((m) => {
    const appt = bookings.find((b) => b.appointment.id === m.appointmentId)?.appointment;
    if (!appt) {
      problems.push("One of the bookings is no longer upcoming.");
      return null;
    }
    const check = checkSlot(ctx, {
      branchId: body.toBranchId,
      staffId: m.staffId,
      date: m.date,
      start: toMinutes(m.start),
      duration: appt.duration,
      departments: appt.departments,
      services: appt.services,
      excludeAppointmentId: appt.id,
    });
    if (!check.ok) problems.push(`${appt.serviceLabel} (${appt.date}): ${check.reasons.join(" ")}`);
    return {
      appointment_id: appt.id,
      branch_id: body.toBranchId,
      professional_id: m.staffId ?? "",
      date: m.date,
      start: `${toTime(toMinutes(m.start))}:00`,
      validation: { ...check.checks, checkedAt: new Date().toISOString() },
    };
  });
  if (problems.length) {
    // Fresh proposals so the Admin can pick again.
    return NextResponse.json({ error: problems.join(" "), code: "SLOT_TAKEN", bookings }, { status: 409 });
  }

  const { data, error } = await gate.supabase.rpc("admin_transfer_client", {
    p_client_id: client.clientId,
    p_walkin_name: client.walkinName,
    p_walkin_phone: client.walkinPhone,
    p_to_branch: body.toBranchId,
    p_reason: body.reason.trim(),
    p_moves: payload,
  });
  if (error) {
    const fresh = await clientTransferContext(gate.admin, body.key, body.toBranchId);
    return fail(rpcFailure(error), { bookings: fresh.bookings });
  }
  return NextResponse.json({ logId: data as string });
}
