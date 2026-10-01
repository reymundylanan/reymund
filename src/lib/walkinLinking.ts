export type AccountProvider = "email" | "google" | "facebook";

/** An existing client account as Front Desk may see it — masked contact
 * details only (from search_client_accounts, migration 054). */
export type ClientMatch = {
  id: string;
  fullName: string;
  emailMasked: string | null;
  phoneLast4: string | null;
  provider: AccountProvider;
  avatarUrl: string | null;
  memberSince: string;
};

export function providerLabel(provider: AccountProvider): string {
  if (provider === "facebook") return "Facebook Account";
  if (provider === "google") return "Google Account";
  return "GlowSync Account";
}

export function memberSinceLabel(iso: string): string {
  const label = new Date(iso).toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", year: "numeric" });
  return `Member since ${label}`;
}

export function phoneHint(last4: string | null): string | null {
  return last4 ? `•••• ${last4}` : null;
}

function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Accounts that probably belong to the person being registered: same
 * name, or (when a full phone number was typed) same last 4 digits. */
export function findPossibleDuplicates(matches: ClientMatch[], name: string, phone: string): ClientMatch[] {
  const wanted = normalizeName(name);
  const digits = phone.replace(/\D/g, "");
  const last4 = digits.length >= 10 ? digits.slice(-4) : null;
  return matches.filter(
    (m) => (wanted !== "" && normalizeName(m.fullName) === wanted) || (last4 !== null && m.phoneLast4 === last4)
  );
}
