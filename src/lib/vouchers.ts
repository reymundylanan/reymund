export const VOUCHER_CODE_RE = /^GLOW-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function normalizeVoucherCode(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function voucherDiscount(amount: number, remaining: number, maxPerBooking: number): number {
  return Math.max(0, Math.min(amount, remaining, maxPerBooking));
}

const DAY = 24 * 60 * 60 * 1000;
function manilaDay(d: Date): number {
  return Math.floor((d.getTime() + 8 * 60 * 60 * 1000) / DAY);
}

export function expiryLabel(expiresAt: string, now: Date = new Date()): { text: string; soon: boolean } {
  const end = new Date(expiresAt);
  if (end.getTime() <= now.getTime()) return { text: "Expired", soon: false };
  const days = manilaDay(end) - manilaDay(now);
  if (days <= 0) return { text: "Expires today", soon: true };
  return { text: `Expires in ${days} day${days === 1 ? "" : "s"}`, soon: days < 7 };
}

export function peso(n: number): string {
  const hasCents = Math.round(n * 100) % 100 !== 0;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

const REDEEM: Record<string, string> = {
  REDEEM_NOT_ENOUGH: "You don't have enough GlowPoints for this reward.",
  REDEEM_DISABLED: "Redeeming rewards is paused right now.",
  REDEEM_INVALID: "This reward is no longer available.",
  REDEEM_FORBIDDEN: "Only client accounts can redeem rewards.",
};
export function redeemErrorMessage(code: string | null | undefined): string {
  return REDEEM[code?.trim() ?? ""] ?? "Couldn't redeem this reward. Please try again.";
}

const VOUCHER: Record<string, string> = {
  VOUCHER_WRONG_CLIENT: "This voucher belongs to a different client.",
  VOUCHER_EXPIRED: "This voucher has expired or was cancelled.",
  VOUCHER_USED: "This voucher was already used.",
  VOUCHER_ALREADY_APPLIED: "A voucher is already applied to this booking.",
  VOUCHER_NOT_FOUND: "No voucher found with that code.",
  VOUCHER_UNDO_EXPIRED: "This voucher can no longer be removed.",
  VOUCHER_FORBIDDEN: "Only Front Desk and Admin can do this.",
  VOUCHER_INVALID: "This voucher can't be used here.",
};
export function voucherErrorMessage(code: string | null | undefined): string {
  return VOUCHER[code?.trim() ?? ""] ?? "Couldn't apply the voucher. Please try again.";
}
