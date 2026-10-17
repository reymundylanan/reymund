/**
 * Philippine mobile numbers, the one format used across GlowSync forms:
 * 11 digits starting with 09 (e.g. 09171234567). Pasted "+63 917 …" or
 * "639…" numbers are turned into the 09… form.
 */
export const PH_MOBILE_HINT = "Enter an 11-digit PH mobile number starting with 09, e.g. 0917 123 4567.";

/** Digits as they should be typed: "09…", at most 11. */
export function phMobileDigits(input: string): string {
  let d = (input ?? "").replace(/\D/g, "");
  if (d.startsWith("63")) d = `0${d.slice(2)}`;
  else if (d.startsWith("9")) d = `0${d}`;
  return d.slice(0, 11);
}

export function isPhMobile(input: string | null | undefined): boolean {
  return /^09\d{9}$/.test(phMobileDigits(input ?? ""));
}

/** "0917 123 4567" for display while typing. */
export function formatPhMobile(input: string): string {
  const d = phMobileDigits(input);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 11)].filter(Boolean).join(" ");
}

/** Error message for a field, or null when fine. Empty is fine only when optional. */
export function phMobileError(input: string | null | undefined, { optional = false } = {}): string | null {
  const d = phMobileDigits(input ?? "");
  if (!d) return optional ? null : PH_MOBILE_HINT;
  return isPhMobile(d) ? null : PH_MOBILE_HINT;
}
