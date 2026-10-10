import { NextResponse } from "next/server";
import { fail, requireAdmin, rpcFailure } from "@/lib/multiBranch/server";

type Body =
  | { action: "toggle"; serviceId: string; active: boolean; reason?: string }
  | { action: "offer"; serviceId: string; branchId: string; reason?: string };

/** Where a service is offered. Existing bookings are never moved by this. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const body = (await request.json()) as Body;
  if (!body.serviceId || (body.action !== "toggle" && body.action !== "offer")) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  const { data, error } =
    body.action === "toggle"
      ? await gate.supabase.rpc("admin_set_service_availability", { p_service_id: body.serviceId, p_active: body.active, p_reason: body.reason ?? "" })
      : await gate.supabase.rpc("admin_offer_service_at_branch", { p_source_service_id: body.serviceId, p_branch_id: body.branchId, p_reason: body.reason ?? "" });
  if (error) return fail(rpcFailure(error));
  return NextResponse.json({ logId: data as string });
}
