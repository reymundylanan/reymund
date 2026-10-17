/** Admin → Payments → "Notify client": the ready-made wordings. */

export type PaymentNoticePreset = "verifying" | "complete";

export const PAYMENT_NOTICE_TITLE = "Payment pending";
/** No second notice about the same booking within this time. */
export const PAYMENT_NOTICE_COOLDOWN_HOURS = 6;
export const PAYMENT_NOTICE_MAX = 400;

const peso = (n: number) => `₱${n.toLocaleString("en-PH")}`;

export function paymentNoticeText(
  preset: PaymentNoticePreset,
  p: { amount: number; bookingCode: string | null; method: string; branchName: string }
): string {
  const booking = p.bookingCode ? `booking ${p.bookingCode}` : "your booking";
  const how = p.method === "gcash" ? "GCash payment" : "payment";
  return preset === "verifying"
    ? `We received your ${how} of ${peso(p.amount)} for ${booking} and we're verifying it. We'll let you know once it's confirmed — no need to pay again.`
    : `Your ${how} of ${peso(p.amount)} for ${booking} is still pending. Please complete it, or contact ${p.branchName} if you've already paid.`;
}

/** Trimmed, length-limited message; null when empty. */
export function cleanPaymentNotice(text: string | null | undefined): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, PAYMENT_NOTICE_MAX) : null;
}
