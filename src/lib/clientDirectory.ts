// Front Desk → Clients: search and the VIP Only / High Spend filters.

export const HIGH_SPEND_MIN = 5000;

export type DirectoryClient = {
  name: string;
  phone: string | null;
  email: string | null;
  vip: boolean;
  totalSpend: number;
};

export type DirectoryFilters = { query: string; vipOnly: boolean; highSpend: boolean };

function digits(text: string | null | undefined): string {
  return (text ?? "").replace(/\D/g, "");
}

/** Name or email contains the text; or, when 3+ digits are typed, the phone
 * contains them (0917…, +63 917…, and 917… all match the same number). */
export function matchesClientSearch(client: DirectoryClient, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (client.name.toLowerCase().includes(q) || (client.email ?? "").toLowerCase().includes(q)) return true;
  let typed = digits(q);
  if (typed.length < 3) return false;
  if (typed.startsWith("63")) typed = typed.slice(2);
  if (typed.startsWith("0")) typed = typed.slice(1);
  return typed.length > 0 && digits(client.phone).includes(typed);
}

export function filterClients<T extends DirectoryClient>(clients: T[], f: DirectoryFilters): T[] {
  const list = clients.filter(
    (c) => matchesClientSearch(c, f.query) && (!f.vipOnly || c.vip) && (!f.highSpend || c.totalSpend >= HIGH_SPEND_MIN)
  );
  // High Spend shows the biggest spenders first.
  return f.highSpend ? [...list].sort((a, b) => b.totalSpend - a.totalSpend) : list;
}

export type VisitForStats = { scheduledDate: string; completed: boolean };

/** Used only before migration 058: counts from the visits this desk can see. */
export function statsFromVisits(visits: VisitForStats[], today = new Date()) {
  const done = visits.filter((v) => v.completed).map((v) => v.scheduledDate.slice(0, 10)).sort();
  const year = String(today.getFullYear());
  return {
    totalVisits: done.length,
    visitsThisYear: done.filter((d) => d.startsWith(year)).length,
    lastVisit: done.length ? done[done.length - 1] : null,
  };
}

export function formatVisitDate(dateKey: string | null): string {
  if (!dateKey) return "—";
  const [y, m, d] = dateKey.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
