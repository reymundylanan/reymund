import { revenueByBranch } from "@/lib/adminData";

export default function RevenueByBranch() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-ink">Revenue by Branch</h3>
      <p className="text-xs text-ink/40">
        Performance comparison across top performing locations
      </p>

      <div className="mt-5 space-y-4">
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
