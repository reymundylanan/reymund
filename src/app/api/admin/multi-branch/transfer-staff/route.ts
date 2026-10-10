import { NextResponse } from "next/server";
import { checkStaffTransfer } from "@/lib/multiBranch/engine";
import { loadContext } from "@/lib/multiBranch/load";
import { fail, requireAdmin, rpcFailure } from "@/lib/multiBranch/server";

type Body = { staffId: string; toBranchId: string; kind: "temporary" | "permanent"; dates: string[]; reason: string };

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const body = (await request.json()) as Body;
  if (!body.staffId || !body.toBranchId || (body.kind !== "temporary" && body.kind !== "permanent")) {
    return NextResponse.json({ error: "Missing staff member, branch or transfer type." }, { status: 400 });
  }
  if (body.kind === "permanent" && !body.reason?.trim()) {
    return NextResponse.json({ error: "A permanent transfer needs a reason.", code: "REASON_REQUIRED" }, { status: 400 });
  }
  const dates = body.kind === "temporary" ? [...new Set(body.dates ?? [])].sort() : [];

  const ctx = await loadContext(gate.admin, { date: dates.at(-1) });
  const check = checkStaffTransfer(ctx, { ...body, dates });
  if (!check.ok) {
    const failed = check.items.filter((i) => !i.ok);
    return NextResponse.json({ error: failed.map((i) => i.detail ?? i.label).join(" "), code: "INVALID", check }, { status: 409 });
  }

  const { data, error } = await gate.supabase.rpc("admin_transfer_staff", {
    p_staff_id: body.staffId,
    p_to_branch: body.toBranchId,
    p_kind: body.kind,
    p_dates: dates,
    p_reason: body.reason?.trim() ?? "",
    p_validation: Object.fromEntries(check.items.map((i) => [i.label, i.ok])),
  });
  if (error) return fail(rpcFailure(error));
  return NextResponse.json({ logId: data as string });
}
