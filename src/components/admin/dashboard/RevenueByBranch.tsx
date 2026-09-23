import type { RevenueByBranchItem } from "@/lib/supabase/queries/adminDashboard";

export default function RevenueByBranch({
  revenueByBranch,
}: {
  revenueByBranch: RevenueByBranchItem[];
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-ink">Revenue by Branch</h3>
      <p className="text-xs text-ink/40">
        Performance comparison across top performing locations this month
      </p>

      <div className="mt-5 space-y-4">
        {revenueByBranch.length === 0 && (
          <p className="py-4 text-center text-sm text-ink/40">
            No settled payments recorded this month yet.
          </p>
        )}
        {revenueByBranch.map((b) => (
          <div key={b.branch}>
            <div className="flex justify-between text-sm">
              <span className="text-ink/70">{b.branch}</span>
              <span className="font-medium text-ink">{b.value}%</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-blush">
              <div
                className="h-2 rounded-full bg-coral"
                style={{ width: `${b.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
