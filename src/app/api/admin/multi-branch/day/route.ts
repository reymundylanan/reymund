import { NextResponse } from "next/server";
import { addDays } from "@/lib/multiBranch/engine";
import { loadDay, loadVisits } from "@/lib/multiBranch/day";
import { requireAdmin } from "@/lib/multiBranch/server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 62;

/** Every walk-in and booking on one date (?date=), or over a range
 * (?from=&to=, up to two months — Past / Upcoming), at every branch. */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (DATE.test(from) && DATE.test(to)) {
    if (to < from || addDays(from, MAX_DAYS) < to) return NextResponse.json({ error: "Pick a range of up to two months." }, { status: 400 });
    return NextResponse.json({ visits: await loadVisits(gate.admin, from, to) });
  }
  const date = params.get("date") ?? "";
  if (!DATE.test(date)) return NextResponse.json({ error: "Pick a date." }, { status: 400 });
  return NextResponse.json({ visits: await loadDay(gate.admin, date) });
}
