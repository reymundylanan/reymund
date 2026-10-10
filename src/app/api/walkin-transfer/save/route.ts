import { NextResponse } from "next/server";
import { fail, requireDesk, rpcFailure } from "@/lib/multiBranch/server";
import type { WalkinService } from "@/lib/multiBranch/walkin";

type Body = {
  transferId?: string | null;
  status: "waiting_availability" | "awaiting_approval";
  originBranchId?: string;
  clientId?: string | null;
  walkinName: string;
  walkinPhone?: string | null;
  services: WalkinService[];
  duration: number;
  originPrice?: number | null;
  date: string;
  time?: string | null;
  option?: { branchId: string; staffId: string; date: string; start: number; immediate: boolean } | null;
  notes?: string | null;
};

/** Keep a walk-in request that isn't booked yet (no slot is reserved). */
export async function POST(request: Request) {
  const gate = await requireDesk();
  if ("error" in gate) return gate.error;
  const body = (await request.json()) as Body;
  const origin = gate.role === "front_desk" ? gate.branchId! : body.originBranchId;
  if (!origin || !body.walkinName?.trim() || !body.services?.length) {
    return NextResponse.json({ error: "Missing client, branch or service." }, { status: 400 });
  }
  const o = body.option ?? null;
  const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
  const { data, error } = await gate.supabase.rpc("save_walkin_transfer_request", {
    p_id: body.transferId ?? null,
    p_status: body.status,
    p_origin_branch: origin,
    p_client_id: body.clientId ?? null,
    p_walkin_name: body.walkinName.trim(),
    p_walkin_phone: body.walkinPhone ?? null,
    p_services: body.services,
    p_duration: Math.round(body.duration || 60),
    p_origin_price: body.originPrice ?? null,
    p_requested_date: body.date,
    p_requested_time: body.time ? `${body.time.slice(0, 5)}:00` : null,
    p_dest_branch: o?.branchId ?? null,
    p_professional_id: o?.staffId ?? null,
    p_proposed_date: o?.date ?? null,
    p_proposed_time: o ? time(o.start) : null,
    p_mode: o ? (o.immediate ? "immediate" : "later") : null,
    p_notes: body.notes ?? null,
  });
  if (error) return fail(rpcFailure(error));
  return NextResponse.json({ transferId: data as string });
}
