import { CreditCard, Receipt } from "lucide-react";
import type { SalesPayments } from "@/lib/supabase/queries/reports";

const METHOD_LABEL: Record<string, string> = {
  gcash: "GCash",
  cash: "Cash",
  credit_card: "Card",
  bank_transfer: "Bank Transfer",
};

const METHOD_COLOR: Record<string, string> = {
  gcash: "#e8798e",
  cash: "#f2c94c",
  credit_card: "#6fcf97",
  bank_transfer: "#9b8afb",
};

export default function SalesPaymentsCard({ sales }: { sales: SalesPayments }) {
  const segments = sales.byMethod.reduce<({ method: string; amount: number; pct: number; start: number; end: number })[]>(
    (acc, m) => {
      const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
      acc.push({ ...m, start, end: start + m.pct });
      return acc;
    },
    []
  );

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Sales &amp; Payments</h2>

      {sales.byMethod.length === 0 ? (
        <p className="mt-8 py-8 text-center text-sm text-ink/40">No settled payments for this period.</p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-6">
            <div className="relative h-32 w-32 shrink-0">
              <svg viewBox="0 0 36 36" className="h-32 w-32 -rotate-90">
                {segments.map((s) => (
                  <circle
                    key={s.method}
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke={METHOD_COLOR[s.method] ?? "#d4d4d4"}
                    strokeWidth="4"
                    strokeDasharray={`${s.pct} ${100 - s.pct}`}
                    strokeDashoffset={-s.start}
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-lg font-semibold text-ink">₱{sales.totalSales.toLocaleString()}</p>
                <p className="text-[10px] text-ink/40">Total Sales</p>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              {segments.map((s) => (
                <div key={s.method} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink/70">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: METHOD_COLOR[s.method] }} />
                    {METHOD_LABEL[s.method] ?? s.method}
                  </span>
                  <span className="font-medium text-ink">{s.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink/10 pt-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-600">
                <CreditCard className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs text-ink/40">Paid</p>
                <p className="font-semibold text-ink">₱{sales.paid.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Receipt className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs text-ink/40">Unpaid</p>
                <p className="font-semibold text-ink">{sales.unpaidCount}</p>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink/40">{sales.transactions} transactions</p>
        </>
      )}
    </div>
  );
}
