import { Building2 } from "lucide-react";
import type { BranchPerformance } from "@/lib/supabase/queries/reports";

export default function BranchPerformanceCard({ branches }: { branches: BranchPerformance[] }) {
  const totalRevenue = branches.reduce((sum, b) => sum + b.revenue, 0);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Branch Performance</h2>

      {branches.length === 0 ? (
        <p className="mt-8 py-8 text-center text-sm text-ink/40">No branches found.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {branches.map((b) => {
            const share = totalRevenue > 0 ? Math.round((b.revenue / totalRevenue) * 100) : 0;
            return (
              <div key={b.branchId} className="rounded-xl border border-ink/10 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-coral-dark">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <p className="font-medium text-ink">{b.branchName}</p>
                </div>
                <p className="mt-3 text-xs text-ink/40">Total Revenue</p>
                <p className="text-lg font-semibold text-ink">₱{b.revenue.toLocaleString()}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-ink/50">
                  <span>Appointments: {b.appointments}</span>
                  <span>Walk-Ins: {b.walkIns}</span>
                </div>
                <div className="mt-3 h-1.5 w-full rounded-full bg-ink/5">
                  <div className="h-1.5 rounded-full bg-coral" style={{ width: `${share}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-ink/40">{share}% of total revenue</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
