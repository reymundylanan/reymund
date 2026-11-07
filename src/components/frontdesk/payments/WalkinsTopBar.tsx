import { Plus, UserPlus2 } from "lucide-react";
import PageHero, { HERO_CHIP } from "@/components/portal/PageHero";

export default function WalkinsTopBar({
  stats,
  onAddWalkin,
}: {
  stats: { total: number; inService: number; overdue: number; completed: number };
  onAddWalkin: () => void;
}) {
  return (
    <PageHero
      icon={UserPlus2}
      eyebrow="Front desk"
      title="Walk-Ins"
      subtitle="Manage walk-in clients and track service progress in real time."
      actions={
        <>
          {[
            { label: "total", value: stats.total, dot: "bg-ink/40" },
            { label: "in service", value: stats.inService, dot: "bg-blue-500" },
            { label: "overdue", value: stats.overdue, dot: "bg-red-500" },
            { label: "completed", value: stats.completed, dot: "bg-green-500" },
          ].map((s) => (
            <span key={s.label} className={HERO_CHIP}>
              <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
              <span className="font-semibold text-ink">{s.value}</span>
              <span className="text-ink/50">{s.label}</span>
            </span>
          ))}
          <button
            onClick={onAddWalkin}
            className="lux-sheen flex items-center gap-1.5 rounded-full bg-gradient-to-r from-coral to-coral-dark px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgba(168,137,48,0.9)] transition duration-300 hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" /> Add Walk-In
          </button>
        </>
      }
    />
  );
}
