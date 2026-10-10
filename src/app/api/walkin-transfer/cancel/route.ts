import { NextResponse } from "next/server";
import { fail, requireDesk, rpcFailure } from "@/lib/multiBranch/server";

/** Cancel a walk-in transfer (and its destination booking, if the client hasn't checked in there). */
export async function POST(request: Request) {
  const gate = await requireDesk();
  if ("error" in gate) return gate.error;
  const { transferId, reason } = (await request.json()) as { transferId?: string; reason?: string };
  if (!transferId) return NextResponse.json({ error: "Missing transfer." }, { status: 400 });
  const { error } = await gate.supabase.rpc("cancel_walkin_transfer", { p_id: transferId, p_reason: reason ?? "" });
  if (error) return fail(rpcFailure(error));
  return NextResponse.json({ ok: true });
}
