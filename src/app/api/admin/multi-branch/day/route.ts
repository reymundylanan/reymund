import { NextResponse } from "next/server";
import { loadDay } from "@/lib/multiBranch/day";
import { requireAdmin } from "@/lib/multiBranch/server";

/** Every walk-in and booking on one date, at every branch. */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Pick a date." }, { status: 400 });
  return NextResponse.json({ visits: await loadDay(gate.admin, date) });
}
