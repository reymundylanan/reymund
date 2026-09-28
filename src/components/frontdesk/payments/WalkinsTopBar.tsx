import { Plus, Users2 } from "lucide-react";

export default function WalkinsTopBar({
  stats,
  onAddWalkin,
}: {
  stats: { total: number; inService: number; waiting: number; completed: number };
  onAddWalkin: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
          <Users2 className="h-4.5 w-4.5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-ink">Walk-Ins</h1>
          <p className="text-xs text-ink/50">Manage walk-in clients and track service progress in real time.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-xl border border-ink/10 px-3 py-1.5 text-center">
          <p className="text-[10px] text-ink/40">Total Walk-Ins</p>
          <p className="text-sm font-semibold text-ink">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-ink/10 px-3 py-1.5 text-center">
          <p className="text-[10px] text-blue-500">In Service</p>
          <p className="text-sm font-semibold text-blue-700">{stats.inService}</p>
        </div>
        <div className="rounded-xl border border-ink/10 px-3 py-1.5 text-center">
          <p className="text-[10px] text-amber-500">Waiting</p>
          <p className="text-sm font-semibold text-amber-700">{stats.waiting}</p>
        </div>
        <div className="rounded-xl border border-ink/10 px-3 py-1.5 text-center">
          <p className="text-[10px] text-green-500">Completed</p>
          <p className="text-sm font-semibold text-green-700">{stats.completed}</p>
        </div>
      </div>

      <button
        onClick={onAddWalkin}
        className="flex items-center gap-1.5 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
      >
        <Plus className="h-4 w-4" /> Add Walk-In
      </button>
    </div>
  );
}
