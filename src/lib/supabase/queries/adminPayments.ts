import type { SupabaseClient } from "@supabase/supabase-js";

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type AdminPaymentRow = {
  id: string;
  appointment_id: string;
  reference_no: string | null;
  sender_name: string | null;
  amount: number;
  method: string;
  status: string;
  refund_reason: string | null;
  refunded_at: string | null;
  created_at: string;
  bookingCode: string | null;
  clientName: string;
  branchName: string;
  scheduledDate: string | null;
};

export async function getAdminPayments(supabase: SupabaseClient): Promise<AdminPaymentRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, appointment_id, reference_no, sender_name, amount, method, status, refund_reason, refunded_at, created_at, appointment:appointments(booking_code, scheduled_date, client:profiles!appointments_client_id_fkey(full_name), branch:branches(name))"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getAdminPayments failed:", error);
    return [];
  }

  type Row = {
    id: string;
    appointment_id: string;
    reference_no: string | null;
    sender_name: string | null;
    amount: number;
    method: string;
    status: string;
    refund_reason: string | null;
    refunded_at: string | null;
    created_at: string;
    appointment: Rel<{
      booking_code: string | null;
      scheduled_date: string | null;
      client: Rel<{ full_name: string }>;
      branch: Rel<{ name: string }>;
    }>;
  };

  return ((data as unknown as Row[]) ?? []).map((r) => {
    const appt = one(r.appointment);
    return {
      id: r.id,
      appointment_id: r.appointment_id,
      reference_no: r.reference_no,
      sender_name: r.sender_name,
      amount: Number(r.amount),
      method: r.method,
      status: r.status,
      refund_reason: r.refund_reason,
      refunded_at: r.refunded_at,
      created_at: r.created_at,
      bookingCode: appt?.booking_code ?? null,
      clientName: one(appt?.client ?? null)?.full_name ?? r.sender_name ?? "Walk-in / Guest",
      branchName: one(appt?.branch ?? null)?.name ?? "—",
      scheduledDate: appt?.scheduled_date ?? null,
    };
  });
}

export type AdminPaymentsStats = {
  totalRevenue: number;
  pendingCount: number;
};

export function computeStats(rows: AdminPaymentRow[]): AdminPaymentsStats {
  return {
    totalRevenue: rows.filter((r) => r.status === "settled").reduce((sum, r) => sum + r.amount, 0),
    pendingCount: rows.filter((r) => r.status === "pending").length,
  };
}
