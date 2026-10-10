import { NextResponse } from "next/server";
import { loadClients, manilaNow } from "@/lib/multiBranch/load";
import { requireAdmin } from "@/lib/multiBranch/server";

/** Clients with bookings or walk-in visits, and their records. */
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  return NextResponse.json({ clients: await loadClients(gate.admin, { today: manilaNow().today }) });
}
