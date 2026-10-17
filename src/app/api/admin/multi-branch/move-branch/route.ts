import { NextResponse } from "next/server";
import { isBranchActive, toMinutes, toTime } from "@/lib/multiBranch/engine";
import { branchMoveContext, checkBranchMoves, planBranchMove, type BranchMove } from "@/lib/multiBranch/branchMove";
import { requireAdmin, rpcFailure } from "@/lib/multiBranch/server";

type Body = { fromBranchId: string; toBranchId: string; reason?: string; moves: BranchMove[] };

/** Moves the chosen upcoming bookings of one branch (e.g. it closed) to
 * another open branch. Each move is re-checked against live data in order,
 * then saved by the database function, which checks again under a lock —
 * nothing ever lands in a taken slot. Moves that no longer fit are skipped
 * and reported, so the Admin can reschedule those one by one. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const body = (await request.json()) as Body;
  const moves = (body.moves ?? []).filter((m) => m.appointmentId && /^\d{4}-\d{2}-\d{2}$/.test(m.date ?? "") && /^\d{2}:\d{2}/.test(m.start ?? ""));
  if (!body.fromBranchId || !body.toBranchId || body.fromBranchId === body.toBranchId) {
    return NextResponse.json({ error: "Choose a different branch to move the bookings to." }, { status: 400 });
  }
  if (!moves.length) return NextResponse.json({ error: "Choose at least one booking to move." }, { status: 400 });

  const ctx = await branchMoveContext(gate.admin, body.fromBranchId);
  const from = ctx.branches.find((b) => b.id === body.fromBranchId);
  const to = ctx.branches.find((b) => b.id === body.toBranchId);
  if (!isBranchActive(to)) return NextResponse.json({ error: `${to?.name ?? "That branch"} isn't open for bookings.` }, { status: 409 });
  const reason = body.reason?.trim() || `${from?.name ?? "The branch"} is closed — moved to ${to?.name}`;

  const moved: string[] = [];
  const failed: { appointmentId: string; reason: string }[] = [];
  for (const r of checkBranchMoves(ctx, body.fromBranchId, body.toBranchId, moves)) {
    if (r.problem || !r.check) {
      failed.push({ appointmentId: r.move.appointmentId, reason: r.problem ?? "No longer fits." });
      continue;
    }
    const { error } = await gate.supabase.rpc("admin_move_appointment", {
      p_appointment_id: r.move.appointmentId,
      p_branch_id: body.toBranchId,
      p_professional_id: r.move.staffId,
      p_date: r.move.date,
      p_start: `${toTime(toMinutes(r.move.start))}:00`,
      p_reason: reason,
      p_validation: { ...r.check.checks, checkedAt: new Date().toISOString() },
    });
    if (error) {
      const f = rpcFailure(error);
      if (f.code === "NOT_MIGRATED" || f.code === "FORBIDDEN") return NextResponse.json({ error: f.message, code: f.code }, { status: f.status });
      failed.push({ appointmentId: r.move.appointmentId, reason: f.message });
    } else moved.push(r.move.appointmentId);
  }

  // Fresh plan for whatever is left, so the Admin can try again right away.
  const after = await branchMoveContext(gate.admin, body.fromBranchId);
  return NextResponse.json({ moved: moved.length, failed, items: planBranchMove(after, body.fromBranchId, body.toBranchId) });
}
