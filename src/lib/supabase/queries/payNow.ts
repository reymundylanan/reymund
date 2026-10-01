import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import { payNowErrorMessage, receiptPath } from "@/lib/payNow";

// ── GCash details (Admin-configured, read by the booking form) ─────────

export type GcashSettings = { accountName: string; number: string | null; qrUrl: string | null };

const FALLBACK_QR = "/images/payment/gcash-qr.png";

export function gcashQrPublicUrl(supabase: SupabaseClient, path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from("gcash-qr").getPublicUrl(path).data.publicUrl;
}

export async function getGcashSettings(supabase: SupabaseClient): Promise<GcashSettings> {
  const { data, error } = await supabase
    .from("spa_settings")
    .select("gcash_account_name, gcash_number, gcash_qr_path")
    .eq("id", true)
    .maybeSingle();
  if (error) {
    if (!isNotMigratedError(error)) logQueryError("getGcashSettings", error);
    return { accountName: "Blush Spa & Aesthetics", number: null, qrUrl: FALLBACK_QR };
  }
  return {
    accountName: data?.gcash_account_name?.trim() || "Blush Spa & Aesthetics",
    number: data?.gcash_number?.trim() || null,
    qrUrl: gcashQrPublicUrl(supabase, data?.gcash_qr_path ?? null) ?? FALLBACK_QR,
  };
}

export async function saveGcashSettings(
  supabase: SupabaseClient,
  input: { accountName: string; number: string; qrFile: File | null }
): Promise<{ error: string | null }> {
  const update: Record<string, string> = {
    gcash_account_name: input.accountName.trim(),
    gcash_number: input.number.trim(),
  };
  if (input.qrFile) {
    const ext = input.qrFile.type === "image/png" ? "png" : input.qrFile.type === "image/webp" ? "webp" : "jpg";
    const path = `qr-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("gcash-qr").upload(path, input.qrFile, { contentType: input.qrFile.type });
    if (uploadError) return { error: `Couldn't upload the QR image: ${uploadError.message}` };
    update.gcash_qr_path = path;
  }
  const { error } = await supabase.from("spa_settings").update(update).eq("id", true);
  return { error: error?.message ?? null };
}

// ── Client: upload receipt + submit ────────────────────────────────────

export async function uploadPaymentReceipt(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<{ path: string | null; error: string | null }> {
  const path = receiptPath(userId, crypto.randomUUID(), file.type);
  const { error } = await supabase.storage.from("payment-receipts").upload(path, file, { contentType: file.type });
  if (error) {
    logQueryError("uploadPaymentReceipt", error);
    return { path: null, error: "Couldn't upload your receipt. Please check your connection and try again." };
  }
  return { path, error: null };
}

export async function submitPayNowPayment(
  supabase: SupabaseClient,
  input: { appointmentId: string; amount: number; receiptPath: string; referenceNo: string; senderName: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("submit_pay_now_payment", {
    p_appointment_id: input.appointmentId,
    p_amount: input.amount,
    p_receipt_path: input.receiptPath,
    p_reference_no: input.referenceNo,
    p_sender_name: input.senderName,
  });
  if (error) {
    logQueryError("submit_pay_now_payment", error);
    return { error: payNowErrorMessage(error.message) };
  }
  return { error: null };
}

// ── Staff: receipt, verify, not received ───────────────────────────────

export async function receiptSignedUrl(supabase: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("payment-receipts").createSignedUrl(path, 60 * 60);
  if (error) {
    logQueryError("receiptSignedUrl", error);
    return null;
  }
  return data.signedUrl;
}

export async function verifyPayNowPayment(supabase: SupabaseClient, paymentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("verify_pay_now_payment", { p_payment_id: paymentId });
  return { error: error ? payNowErrorMessage(error.message) : null };
}

export async function rejectPayNowPayment(supabase: SupabaseClient, paymentId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("reject_pay_now_payment", { p_payment_id: paymentId, p_reason: reason });
  return { error: error ? payNowErrorMessage(error.message) : null };
}

// ── Payments → Online Payments ─────────────────────────────────────────

export type OnlinePayment = {
  id: string;
  appointmentId: string;
  amount: number;
  method: string;
  status: string;
  paymentType: string | null;
  referenceNo: string | null;
  senderName: string | null;
  receiptPath: string | null;
  createdAt: string;
  verifiedAt: string | null;
  verifiedByName: string | null;
  rejectedReason: string | null;
  clientId: string | null;
  clientName: string;
  scheduledDate: string;
  startTime: string;
  serviceName: string;
  staffName: string | null;
  branchName: string | null;
};

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type OnlineRow = {
  id: string;
  appointment_id: string;
  amount: number;
  method: string;
  status: string;
  payment_type: string | null;
  reference_no: string | null;
  sender_name: string | null;
  receipt_path: string | null;
  created_at: string;
  verified_at: string | null;
  rejected_reason: string | null;
  verifier: Rel<{ full_name: string | null }>;
  appointment: Rel<{
    client_id: string | null;
    walkin_name: string | null;
    scheduled_date: string;
    start_time: string;
    notes: string | null;
    branch_id: string;
    client: Rel<{ full_name: string | null }>;
    professional: Rel<{ full_name: string | null }>;
    service: Rel<{ name: string | null }>;
    branch: Rel<{ name: string | null }>;
    appointment_services: { service_name: string; position: number }[] | null;
  }>;
};

const ONLINE_SELECT =
  "id, appointment_id, amount, method, status, payment_type, reference_no, sender_name, receipt_path, created_at, verified_at, rejected_reason, verifier:profiles!payments_verified_by_fkey(full_name), appointment:appointments!inner(client_id, walkin_name, scheduled_date, start_time, notes, branch_id, client:profiles!appointments_client_id_fkey(full_name), professional:staff_members(full_name), service:branch_services(name), branch:branches(name), appointment_services(service_name, position))";

export function toOnlinePayment(r: OnlineRow): OnlinePayment {
  const a = one(r.appointment);
  const services = [...(a?.appointment_services ?? [])].sort((x, y) => x.position - y.position).map((s) => s.service_name);
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    amount: Number(r.amount),
    method: r.method,
    status: r.status,
    paymentType: r.payment_type,
    referenceNo: r.reference_no,
    senderName: r.sender_name,
    receiptPath: r.receipt_path,
    createdAt: r.created_at,
    verifiedAt: r.verified_at,
    verifiedByName: one(r.verifier)?.full_name ?? null,
    rejectedReason: r.rejected_reason,
    clientId: a?.client_id ?? null,
    clientName: (a && (one(a.client)?.full_name || a.walkin_name)) || "Client",
    scheduledDate: a?.scheduled_date ?? "",
    startTime: a?.start_time ?? "",
    serviceName: services.join(", ") || one(a?.service ?? null)?.name || a?.notes?.split(" with ")[0]?.trim() || "Appointment",
    staffName: one(a?.professional ?? null)?.full_name ?? null,
    branchName: one(a?.branch ?? null)?.name ?? null,
  };
}

/** Online (GCash) payments created in [fromIso, toIso), newest first. RLS
 * limits Front Desk to its branch; branchId narrows Admin views. */
export async function getOnlinePayments(
  supabase: SupabaseClient,
  opts: { fromIso: string; toIso: string; branchId?: string | null }
): Promise<{ rows: OnlinePayment[]; migrated: boolean }> {
  let q = supabase
    .from("payments")
    .select(ONLINE_SELECT)
    .eq("method", "gcash")
    .gte("created_at", opts.fromIso)
    .lt("created_at", opts.toIso)
    .order("created_at", { ascending: false })
    .limit(500);
  if (opts.branchId) q = q.eq("appointment.branch_id", opts.branchId);
  const { data, error } = await q;
  if (error) {
    if (isNotMigratedError(error)) return { rows: [], migrated: false };
    logQueryError("getOnlinePayments", error);
    return { rows: [], migrated: true };
  }
  return { rows: ((data ?? []) as unknown as OnlineRow[]).map(toOnlinePayment), migrated: true };
}
