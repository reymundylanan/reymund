// Password rules for accounts made or reset in GlowSync: at least 8
// characters with upper- and lowercase letters and a number. Shared by
// the forms (live red → green meter) and the API routes (enforced).

export const PASSWORD_MIN = 8;

export type PasswordCheck = { key: "length" | "lower" | "upper" | "number"; label: string; short: string; ok: boolean };

export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { key: "length", label: `At least ${PASSWORD_MIN} characters`, short: `at least ${PASSWORD_MIN} characters`, ok: pw.length >= PASSWORD_MIN },
    { key: "upper", label: "An uppercase letter (A–Z)", short: "an uppercase letter", ok: /[A-Z]/.test(pw) },
    { key: "lower", label: "A lowercase letter (a–z)", short: "a lowercase letter", ok: /[a-z]/.test(pw) },
    { key: "number", label: "A number (0–9)", short: "a number", ok: /\d/.test(pw) },
  ];
}

export function meetsPasswordPolicy(pw: string): boolean {
  return passwordChecks(pw).every((c) => c.ok);
}

/** First unmet rule as a sentence, or null when the password is acceptable. */
export function passwordPolicyError(pw: string): string | null {
  const missing = passwordChecks(pw).filter((c) => !c.ok);
  if (missing.length === 0) return null;
  return `Password needs: ${missing.map((c) => c.short).join(", ")}.`;
}

export type StrengthLevel = { score: 0 | 1 | 2 | 3 | 4; label: "Too weak" | "Weak" | "Fair" | "Good" | "Strong" };

/** 0–4: one point per rule met; all rules plus a symbol or 12+ characters is Strong. */
export function passwordStrength(pw: string): StrengthLevel {
  if (!pw) return { score: 0, label: "Too weak" };
  const met = passwordChecks(pw).filter((c) => c.ok).length;
  if (met === 4) return /[^A-Za-z0-9]/.test(pw) || pw.length >= 12 ? { score: 4, label: "Strong" } : { score: 3, label: "Good" };
  if (met === 3) return { score: 2, label: "Fair" };
  return met === 2 ? { score: 1, label: "Weak" } : { score: 0, label: "Too weak" };
}
