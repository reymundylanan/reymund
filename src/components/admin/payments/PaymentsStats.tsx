import { CircleDollarSign, Hourglass, ReceiptText } from "lucide-react";
import StatCard from "@/components/StatCard";
import type { AdminPaymentsStats } from "@/lib/supabase/queries/adminPayments";

/** Top of Admin → Payments: settled revenue, payments still pending, and all transactions. */
export default function PaymentsStats({ stats, live, total }: { stats: AdminPaymentsStats; live: boolean; total: number }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink/55">Verify GCash payments, review cash collected at the front desk, and see every transaction.</p>
        {live && (
          <span className="flex items-center gap-1.5 rounded-full bg-[#E6EDE2] px-3 py-1 text-xs font-semibold text-[#4F6B4A]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4F6B4A]" /> Live updates
          </span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={CircleDollarSign} label="Settled revenue" value={`₱${stats.totalRevenue.toLocaleString()}`} note="Payments fully received" tint="gold" />
        <StatCard
          icon={Hourglass}
          label="Pending payments"
          value={stats.pendingCount.toLocaleString()}
          note={stats.pendingCount ? "Still waiting to be settled" : "Nothing waiting"}
          tone={stats.pendingCount ? "warn" : "default"}
          tint="peach"
        />
        <StatCard icon={ReceiptText} label="Transactions" value={total.toLocaleString()} note="All recorded payments" tint="sage" />
      </div>
    </div>
  );
}
