import { Clock } from "lucide-react";

const STEPS: { label: string; style: string; detail: string }[] = [
  { label: "Waiting", style: "bg-slate-100 text-slate-600", detail: "Client checked in" },
  { label: "In Service", style: "bg-blue-100 text-blue-700", detail: "Service started (timer begins)" },
  { label: "Time Reached", style: "bg-amber-100 text-amber-700", detail: "Estimated time has passed" },
  { label: "Overdue", style: "bg-red-100 text-red-600", detail: "Service continues (shows overtime)" },
  { label: "Completed", style: "bg-green-100 text-green-700", detail: "Manually marked as finished" },
];

export default function WalkinStatusGuide() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Clock className="h-4 w-4 text-ink/40" />
        Walk-In Status Guide
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex items-start gap-2">
            <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${step.style}`}>{step.label}</span>
            {i < STEPS.length - 1 && <span className="hidden text-ink/20 sm:inline">→</span>}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] text-ink/40 sm:grid-cols-5">
        {STEPS.map((step) => (
          <p key={step.label}>{step.detail}</p>
        ))}
      </div>
    </div>
  );
}
