import { NextResponse } from "next/server";
import { fail, requireAdmin, rpcFailure } from "@/lib/multiBranch/server";

/** Undo — the database refuses when later activity makes it unsafe. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { logId } = (await request.json()) as { logId?: string };
  if (!logId) return NextResponse.json({ error: "Missing transfer." }, { status: 400 });
  const { data, error } = await gate.supabase.rpc("admin_undo_transfer", { p_log_id: logId });
  if (error) return fail(rpcFailure(error));
  return NextResponse.json({ logId: data as string });
}
