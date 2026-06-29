import { CalendarOff, FileText, Shuffle } from "lucide-react";

const actions = [
  { label: "Manage Leave Requests", icon: CalendarOff },
  { label: "Assign Branch Shifts", icon: Shuffle },
  { label: "View Staff Records", icon: FileText },
];

export default function QuickActions() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Quick Actions</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              className="flex items-center gap-3 rounded-xl border border-ink/10 p-4 hover:border-coral hover:bg-blush"
            >
              <Icon className="h-5 w-5 text-coral-dark" />
              <span className="text-sm font-medium text-ink/70">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
