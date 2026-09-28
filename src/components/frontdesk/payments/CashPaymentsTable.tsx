"use client";

import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import { getTodaysCashPayments, cashReceiptNo, type CashPaymentRow } from "@/lib/supabase/queries/frontdeskPayments";
import CashPaymentDetailModal from "@/components/frontdesk/payments/CashPaymentDetailModal";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

const STATUS_LABEL: Record<string, string> = { settled: "completed", pending: "pending" };
const STATUS_STYLE: Record<string, string> = {
  settled: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
};

export default function CashPaymentsTable() {
  const { profile } = useStaffProfile();
  const [rows, setRows] = useState<CashPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CashPaymentRow | null>(null);

  useEffect(() => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    getTodaysCashPayments(supabase, profile.branchId, toDateKey(new Date())).then((data) => {
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.branchId]);

  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Banknote className="h-4 w-4" />
            </span>
            Cash Payments
          </h2>
          <p className="mt-1 text-xs text-ink/50">Record and track cash transactions from walk-ins and appointments</p>
        </div>
        <div className="flex items-center divide-x divide-ink/10 text-right">
          <div className="px-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">Total Transactions</p>
            <p className="text-lg font-semibold text-ink">{rows.length.toString().padStart(2, "0")}</p>
          </div>
          <div className="px-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">Total Amount</p>
            <p className="text-lg font-semibold text-amber-600">₱{totalAmount.toLocaleString()}.00</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="mt-6 py-8 text-center text-sm text-ink/40">Loading cash payments...</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 py-8 text-center text-sm text-ink/40">No cash payments recorded today.</p>
      ) : (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-ink/40">
              <th className="py-2 font-medium">Receipt No.</th>
              <th className="py-2 font-medium">Client Name</th>
              <th className="py-2 font-medium">Amount</th>
              <th className="py-2 font-medium">Time</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-ink/5">
                <td className="py-3 font-medium text-ink">{cashReceiptNo(r.id)}</td>
                <td className="py-3 text-ink/70">{r.clientName}</td>
                <td className="py-3 font-medium text-amber-600">₱{r.amount.toLocaleString()}</td>
                <td className="py-3 text-ink/50">{formatTime(r.created_at)}</td>
                <td className="py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[r.status] ?? "bg-ink/10 text-ink/50"}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td className="py-3">
                  <button
                    onClick={() => setSelected(r)}
                    className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700"
                  >
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && <CashPaymentDetailModal payment={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
