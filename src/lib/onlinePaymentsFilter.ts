// Payments → Online Payments: date ranges and search (pure, testable).

export type DateFilter = "today" | "yesterday" | "week" | "month" | "custom";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** [from, to) in local time. Week starts Monday. Custom uses YYYY-MM-DD bounds (inclusive). */
export function dateRange(filter: DateFilter, now: Date, custom?: { from: string; to: string }): { from: Date; to: Date } {
  const today = startOfDay(now);
  switch (filter) {
    case "today":
      return { from: today, to: addDays(today, 1) };
    case "yesterday":
      return { from: addDays(today, -1), to: today };
    case "week": {
      const offset = (today.getDay() + 6) % 7;
      return { from: addDays(today, -offset), to: addDays(today, 1) };
    }
    case "month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: addDays(today, 1) };
    case "custom": {
      const parse = (s: string | undefined, fallback: Date) => {
        if (!s) return fallback;
        const [y, m, d] = s.split("-").map(Number);
        return y && m && d ? new Date(y, m - 1, d) : fallback;
      };
      const from = parse(custom?.from, today);
      const toDay = parse(custom?.to, from);
      return toDay < from ? { from: toDay, to: addDays(from, 1) } : { from, to: addDays(toDay, 1) };
    }
  }
}

export type SearchablePayment = {
  clientName: string;
  senderName: string | null;
  referenceNo: string | null;
  serviceName: string;
  amount: number;
  scheduledDate: string;
};

/** Client, sender, reference, service, appointment date, or amount. */
export function matchesPaymentSearch(p: SearchablePayment, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = [p.clientName, p.senderName ?? "", p.serviceName, p.scheduledDate].join(" ").toLowerCase();
  if (text.includes(q)) return true;
  const qDigits = q.replace(/[^\d]/g, "");
  if (qDigits && (p.referenceNo ?? "").replace(/\D/g, "").includes(qDigits)) return true;
  if ((p.referenceNo ?? "").toLowerCase().includes(q)) return true;
  const qAmount = Number(q.replace(/[₱,\s]/g, ""));
  return Number.isFinite(qAmount) && qAmount > 0 && Math.abs(p.amount - qAmount) < 0.005;
}
