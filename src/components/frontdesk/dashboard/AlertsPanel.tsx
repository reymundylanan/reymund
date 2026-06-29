import { AlertTriangle } from "lucide-react";
import { dashboardAlerts } from "@/lib/frontdeskData";

export default function AlertsPanel() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Payment Verifications</h2>
      <div className="mt-4 space-y-3">
        {dashboardAlerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-start justify-between gap-3 rounded-xl bg-red-50 p-3"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-medium text-ink">{alert.title}</p>
                <p className="text-xs text-ink/60">{alert.detail}</p>
              </div>
            </div>
            <button className="shrink-0 rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral-dark">
              Resolve
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
