import type { SupabaseClient } from "@supabase/supabase-js";
import { clientKey, proposeAt, type Appointment, type ClientCard, type Context, type Suggestion } from "./engine";
import { loadClients, loadContext, manilaNow } from "./load";

export type ClientBooking = { appointment: Appointment; proposal: Suggestion | null; alreadyThere: boolean };

/** One client, their upcoming bookings, and a valid slot for each at the
 * destination (if any) — all from live data. */
export async function clientTransferContext(
  supabase: SupabaseClient,
  key: string,
  toBranchId: string
): Promise<{ ctx: Context; client: ClientCard | null; bookings: ClientBooking[] }> {
  const { today } = manilaNow();
  const clients = await loadClients(supabase, { today });
  const client = clients.find((c) => c.key === key) ?? null;

  // Load far enough ahead to cover their latest upcoming booking.
  let last = today;
  if (client) {
    const q = supabase.from("appointments").select("scheduled_date").gte("scheduled_date", today).in("status", ["pending", "confirmed"]);
    const { data } = await (client.clientId
      ? q.eq("client_id", client.clientId)
      : q.is("client_id", null).eq("walkin_name", client.walkinName ?? ""));
    for (const r of (data ?? []) as { scheduled_date: string }[]) if (r.scheduled_date > last) last = r.scheduled_date;
  }
  const ctx = await loadContext(supabase, { date: last, days: 3 });

  const bookings = client
    ? ctx.appointments
        .filter(
          (a) =>
            clientKey({ clientId: a.clientId, walkinName: a.walkinName, walkinPhone: a.walkinPhone }) === key &&
            !["no_show", "completed", "paid", "arrived", "waiting", "ready", "late_arrival", "in_service"].includes(a.sessionStatus ?? "")
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
        .map((a) => ({
          appointment: a,
          alreadyThere: a.branchId === toBranchId,
          proposal: a.branchId === toBranchId ? null : proposeAt(ctx, a, toBranchId),
        }))
    : [];

  return { ctx, client, bookings };
}
