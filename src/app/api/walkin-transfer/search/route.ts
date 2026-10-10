import { NextResponse } from "next/server";
import { requireDesk } from "@/lib/multiBranch/server";
import { searchWalkin, type WalkinSearchBody } from "@/lib/multiBranch/walkinServer";

/** Where (and when) can this walk-in be served? Live data, nothing is saved. */
export async function POST(request: Request) {
  const gate = await requireDesk();
  if ("error" in gate) return gate.error;
  const body = (await request.json()) as WalkinSearchBody;
  const origin = gate.role === "front_desk" ? gate.branchId! : body.originBranchId;
  if (!origin) return NextResponse.json({ error: "Missing the walk-in's branch." }, { status: 400 });
  if (!body.services?.length) return NextResponse.json({ error: "Choose the service first." }, { status: 400 });
  const { ctx: _ctx, ...result } = await searchWalkin(gate.admin, origin, body);
  void _ctx;
  return NextResponse.json({ originBranchId: origin, ...result });
}
