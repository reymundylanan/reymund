import { NextResponse } from "next/server";
import { fail, requireDesk, rpcFailure } from "@/lib/multiBranch/server";
import { loadWalkinTransfers } from "@/lib/multiBranch/walkinServer";

/** Walk-in transfers this desk sends or receives (Admin: all), newest first. */
export async function GET(request: Request) {
  const gate = await requireDesk();
  if ("error" in gate) return gate.error;
  const days = Math.min(Number(new URL(request.url).searchParams.get("days") ?? 14) || 14, 90);
  const { items, error } = await loadWalkinTransfers(gate.admin, { days, branchId: gate.role === "front_desk" ? gate.branchId : null });
  if (error) return fail(rpcFailure(error));
  return NextResponse.json({
    transfers: items.map((t) => ({
      ...t,
      direction: gate.role === "admin" ? "all" : t.origin_branch_id === gate.branchId ? "outgoing" : "incoming",
    })),
  });
}
