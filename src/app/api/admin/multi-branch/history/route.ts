import { NextResponse } from "next/server";
import { requireAdmin, rpcFailure, fail } from "@/lib/multiBranch/server";

type LogRow = {
  id: string;
  transfer_type: string;
  status: string;
  appointment_id: string | null;
  staff_member_id: string | null;
  client_id: string | null;
  from_branch_id: string | null;
  to_branch_id: string | null;
  from_staff_id: string | null;
  to_staff_id: string | null;
  from_date: string | null;
  from_time: string | null;
  to_date: string | null;
  to_time: string | null;
  dates: string[] | null;
  reason: string | null;
  previous: Record<string, unknown>;
  next: Record<string, unknown>;
  validation: Record<string, unknown>;
  notification_id: string | null;
  messenger_outbox_id: string | null;
  initiated_by: string | null;
  undo_of: string | null;
  undone_at: string | null;
  created_at: string;
};

export type DeliveryStatus = { channel: string; status: string; error: string | null; at: string | null };

/** Transfer history with names and real delivery results (never assumed). */
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { data, error } = await gate.admin.from("branch_transfer_log").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) return fail(rpcFailure(error));
  const rows = (data ?? []) as LogRow[];

  const ids = (pick: (r: LogRow) => (string | null)[]) => [...new Set(rows.flatMap(pick).filter((x): x is string => !!x))];
  const profileIds = ids((r) => [r.initiated_by, r.client_id]);
  const notices = ids((r) => [r.notification_id]);
  const outbox = ids((r) => [r.messenger_outbox_id]);
  const appts = ids((r) => [r.appointment_id]);

  const [profiles, deliveries, messenger, codes] = await Promise.all([
    profileIds.length ? gate.admin.from("profiles").select("id, full_name").in("id", profileIds) : Promise.resolve({ data: [] }),
    notices.length
      ? gate.admin.from("notification_deliveries").select("notification_id, channel, status, last_error, skip_reason, sent_at").in("notification_id", notices)
      : Promise.resolve({ data: [] }),
    outbox.length ? gate.admin.from("messenger_outbox").select("id, status, last_error, skip_reason, sent_at").in("id", outbox) : Promise.resolve({ data: [] }),
    appts.length ? gate.admin.from("appointments").select("id, booking_code").in("id", appts) : Promise.resolve({ data: [] }),
  ]);

  const nameOf = new Map(((profiles.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? "—"]));
  const codeOf = new Map(((codes.data ?? []) as { id: string; booking_code: string | null }[]).map((a) => [a.id, a.booking_code]));
  type Delivery = { notification_id?: string; id?: string; channel?: string; status: string; last_error: string | null; skip_reason: string | null; sent_at: string | null };
  const deliveryRows = (deliveries.data ?? []) as Delivery[];
  const messengerRows = (messenger.data ?? []) as Delivery[];

  return NextResponse.json({
    entries: rows.map((r) => {
      const delivery: DeliveryStatus[] = [];
      if (r.notification_id) {
        delivery.push({ channel: "In-app", status: "sent", error: null, at: r.created_at });
        for (const d of deliveryRows.filter((x) => x.notification_id === r.notification_id)) {
          delivery.push({ channel: d.channel === "email" ? "Gmail" : "Push", status: d.status, error: d.last_error ?? d.skip_reason, at: d.sent_at });
        }
      }
      const m = messengerRows.find((x) => x.id === r.messenger_outbox_id);
      if (m) delivery.push({ channel: "Messenger", status: m.status, error: m.last_error ?? m.skip_reason, at: m.sent_at });
      return {
        ...r,
        initiatedByName: r.initiated_by ? nameOf.get(r.initiated_by) ?? "Admin" : "System",
        clientName: r.client_id ? nameOf.get(r.client_id) ?? null : null,
        bookingCode: r.appointment_id ? codeOf.get(r.appointment_id) ?? null : null,
        delivery,
      };
    }),
  });
}
