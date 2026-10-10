import { NextResponse } from "next/server";
import { findConflicts } from "@/lib/multiBranch/engine";
import { loadContext } from "@/lib/multiBranch/load";
import { requireAdmin } from "@/lib/multiBranch/server";

/** The whole board, from the live database. */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const date = new URL(request.url).searchParams.get("date") ?? undefined;
  const ctx = await loadContext(gate.admin, { date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined });
  const [log, pending] = await Promise.all([
    gate.admin.from("branch_transfer_log").select("id", { count: "exact", head: true }),
    gate.admin.from("branch_transfer_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return NextResponse.json({
    context: ctx,
    conflicts: findConflicts(ctx),
    pendingTransferRequests: pending.count ?? 0,
    migrated: !log.error,
  });
}
