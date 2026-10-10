import { NextResponse } from "next/server";
import { checkSlot } from "@/lib/multiBranch/engine";
import { fail, requireDesk, rpcFailure } from "@/lib/multiBranch/server";
import { searchWalkin, type WalkinSearchBody } from "@/lib/multiBranch/walkinServer";

type Body = WalkinSearchBody & {
  transferId?: string | null;
  clientId?: string | null;
  walkinName: string;
  walkinPhone?: string | null;
  originPrice?: number | null;
  clientAgreed: boolean;
  option: {
    branchId: string;
    staffId: string;
    date: string;
    start: number;
    duration: number;
    immediate: boolean;
    travelMinutes: number;
    services: { serviceId: string; name: string; price: number }[];
  };
  notes?: string | null;
};

/** The client agreed: re-check the slot on live data, then book it at the
 * destination (the database checks again under a lock). */
export async function POST(request: Request) {
  const gate = await requireDesk();
  if ("error" in gate) return gate.error;
  const body = (await request.json()) as Body;
  const origin = gate.role === "front_desk" ? gate.branchId! : body.originBranchId;
  if (!origin) return NextResponse.json({ error: "Missing the walk-in's branch." }, { status: 400 });
  if (!body.clientAgreed) return NextResponse.json({ error: "Get the client's agreement first.", code: "NEEDS_APPROVAL" }, { status: 400 });
  if (!body.walkinName?.trim() || !body.option?.branchId || !body.option.staffId) {
    return NextResponse.json({ error: "Missing client or destination." }, { status: 400 });
  }

  // Fresh check before booking; on failure, fresh options for the client to choose from.
  const fresh = await searchWalkin(gate.admin, origin, body);
  const o = body.option;
  const check = checkSlot(fresh.ctx, {
    branchId: o.branchId,
    staffId: o.staffId,
    date: o.date,
    start: o.start,
    duration: o.duration,
    departments: [...new Set(fresh.ctx.services.filter((s) => o.services.some((x) => x.serviceId === s.id)).map((s) => s.department).filter(Boolean))],
    services: fresh.ctx.services.filter((s) => o.services.some((x) => x.serviceId === s.id)).map((s) => s.name),
  });
  if (!check.ok) {
    return NextResponse.json({ error: `That time was just taken or changed: ${check.reasons.join(" ")} Please choose again.`, code: check.code, options: fresh.options }, { status: 409 });
  }

  const hh = String(Math.floor(o.start / 60)).padStart(2, "0");
  const mm = String(o.start % 60).padStart(2, "0");
  const { data, error } = await gate.supabase.rpc("confirm_walkin_transfer", {
    p_id: body.transferId ?? null,
    p_origin_branch: origin,
    p_client_id: body.clientId ?? null,
    p_walkin_name: body.walkinName.trim(),
    p_walkin_phone: body.walkinPhone ?? null,
    p_services: o.services.map((s) => ({ service_id: s.serviceId, name: s.name, price: s.price })),
    p_duration: o.duration,
    p_origin_price: body.originPrice ?? null,
    p_requested_date: body.date ?? fresh.today,
    p_requested_time: body.time ? `${body.time.slice(0, 5)}:00` : null,
    p_dest_branch: o.branchId,
    p_professional_id: o.staffId,
    p_date: o.date,
    p_start: `${hh}:${mm}:00`,
    p_mode: o.immediate ? "immediate" : "later",
    p_travel_minutes: o.travelMinutes,
    p_notes: body.notes ?? null,
  });
  if (error) {
    const again = await searchWalkin(gate.admin, origin, body);
    return fail(rpcFailure(error), { options: again.options });
  }
  return NextResponse.json(data);
}
