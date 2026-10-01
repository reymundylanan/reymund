// Pay Now via GCash (059): receipt checks, status labels and formatting
// shared by the booking form, Front Desk and Payments.

export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;

export function receiptFileError(file: { type: string; size: number }): string | null {
  if (!(RECEIPT_TYPES as readonly string[]).includes(file.type)) return "Please upload a JPG, PNG or WebP image of your GCash receipt.";
  if (file.size > RECEIPT_MAX_BYTES) return "That image is too large (max 8 MB). Please upload a smaller screenshot.";
  if (file.size === 0) return "That file is empty. Please choose the receipt image again.";
  return null;
}

export function receiptExtension(type: string): string {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

/** Storage path inside the private payment-receipts bucket: <user>/<uuid>.<ext> */
export function receiptPath(userId: string, id: string, type: string): string {
  return `${userId}/${id}.${receiptExtension(type)}`;
}

export type PayNowState = "submitted" | "verified" | "not_received" | "none";

export type PaymentLike = { status: string; payment_type?: string | null; paymentType?: string | null };

export function payNowState(payments: PaymentLike[] | null | undefined): PayNowState {
  const payNow = (payments ?? []).filter((p) => (p.payment_type ?? p.paymentType) === "pay_now");
  if (payNow.some((p) => p.status === "settled")) return "verified";
  if (payNow.some((p) => p.status === "pending")) return "submitted";
  if (payNow.some((p) => p.status === "failed")) return "not_received";
  return "none";
}

export const PAY_NOW_LABEL: Record<Exclude<PayNowState, "none">, string> = {
  submitted: "Payment Submitted",
  verified: "Paid / Verified",
  not_received: "Payment Not Received",
};

export const PAY_NOW_STYLE: Record<Exclude<PayNowState, "none">, string> = {
  submitted: "bg-amber-100 text-amber-700",
  verified: "bg-green-100 text-green-700",
  not_received: "bg-red-100 text-red-600",
};

/** "09171234567" / "+639171234567" → "0917 123 4567" */
export function formatGcashNumber(raw: string | null | undefined): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("63") && d.length === 12) d = `0${d.slice(2)}`;
  if (d.length === 10 && d.startsWith("9")) d = `0${d}`;
  if (d.length !== 11) return (raw ?? "").trim();
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

export function isValidGcashNumber(raw: string): boolean {
  return /^09\d{9}$/.test(formatGcashNumber(raw).replace(/\s/g, ""));
}

export function pesoAmount(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Friendly text for the database errors raised by 059. */
export function payNowErrorMessage(message: string | null | undefined): string {
  const m = message ?? "";
  if (m.includes("PAYNOW_DUPLICATE_REFERENCE")) return "This GCash reference number was already used for another verified payment.";
  if (m.includes("PAYNOW_DUPLICATE")) return "A payment was already submitted for this booking.";
  if (m.includes("PAYNOW_NOT_VERIFIED")) return "Verify the GCash payment before confirming this booking.";
  if (m.includes("PAYNOW_FORBIDDEN")) {
    // 060 says why (role / branch); older messages have no detail.
    const detail = m.split("PAYNOW_FORBIDDEN:")[1]?.trim();
    return detail ? `Not allowed: ${detail}.` : "You don't have permission to do that.";
  }
  if (m.includes("PAYNOW_INVALID")) return m.split("PAYNOW_INVALID:")[1]?.trim() || "This payment can't be changed right now.";
  return "Something went wrong. Please try again.";
}
