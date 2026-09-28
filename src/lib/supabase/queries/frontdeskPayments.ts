import type { SupabaseClient } from "@supabase/supabase-js";

export type CashPaymentRow = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  clientName: string;
  serviceName: string;
  staffName: string;
};

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type Row = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  appointment: Rel<{
    walkin_name: string | null;
    client: Rel<{ full_name: string }>;
    service: Rel<{ name: string }>;
    professional: Rel<{ full_name: string }>;
  }>;
};

/** Every cash payment recorded through the Appointments or Walk-Ins
 * payment modal for this branch today — the `payments` table has no
 * branch_id of its own, so branch/date filtering happens through the
 * appointment it's attached to via an inner embed. */
export async function getTodaysCashPayments(
  supabase: SupabaseClient,
  branchId: string,
  dateKey: string
): Promise<CashPaymentRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, amount, status, created_at, appointment:appointments!inner(branch_id, scheduled_date, walkin_name, client:profiles!appointments_client_id_fkey(full_name), service:branch_services(name), professional:staff_members(full_name))"
    )
    .eq("method", "cash")
    .eq("appointment.branch_id", branchId)
    .eq("appointment.scheduled_date", dateKey)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getTodaysCashPayments failed:", error);
    return [];
  }

  return ((data as unknown as Row[]) ?? []).map((row) => {
    const appt = one(row.appointment);
    const clientName = appt ? one(appt.client)?.full_name ?? appt.walkin_name ?? "Walk-in Client" : "Unknown";
    return {
      id: row.id,
      amount: row.amount,
      status: row.status,
      created_at: row.created_at,
      clientName,
      serviceName: (appt && one(appt.service)?.name) ?? "—",
      staffName: (appt && one(appt.professional)?.full_name) ?? "—",
    };
  });
}

export function cashReceiptNo(paymentId: string): string {
  return `CASH-${paymentId.replace(/-/g, "").slice(-6).toUpperCase()}`;
}
