import { NextResponse } from "next/server";
import { loadContext } from "@/lib/multiBranch/load";
import { requireDesk } from "@/lib/multiBranch/server";
import { openTimes } from "@/lib/frontdesk/openTimes";

type Body = { branchId?: string; date: string; duration: number; serviceIds: string[]; staffId?: string | null };

/** Front Desk → New Booking: the free start times for the chosen services
 * (and therapist) on a date, with who can take each one. Read only. */
export async function POST(request: Request) {
  const gate = await requireDesk();
  if ("error" in gate) return gate.error;
  const body = (await request.json()) as Body;
  // Front Desk books for its own branch; Admin can pass one.
  const branchId = gate.role === "front_desk" ? gate.branchId : body.branchId;
  if (!branchId || !/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") || !Array.isArray(body.serviceIds) || !body.serviceIds.length) {
    return NextResponse.json({ error: "Choose the services and a date." }, { status: 400 });
  }
  const ctx = await loadContext(gate.admin, { date: body.date, days: 1 });
  const slots = openTimes(ctx, {
    branchId,
    date: body.date,
    duration: Math.min(Math.max(Number(body.duration) || 60, 15), 12 * 60),
    serviceIds: body.serviceIds,
    staffId: body.staffId || null,
  });
  return NextResponse.json({ slots });
}
