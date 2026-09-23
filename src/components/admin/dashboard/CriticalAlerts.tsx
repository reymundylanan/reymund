import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PendingBookingAlert } from "@/lib/supabase/queries/adminDashboard";

export default function CriticalAlerts({ alerts }: { alerts: PendingBookingAlert[] }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-ink">Critical Alerts</h3>
      <div className="mt-4 space-y-3">
        {alerts.length === 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-green-50 p-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            <p className="text-sm text-ink/70">No pending bookings need confirmation.</p>
          </div>
        )}
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-start gap-3 rounded-xl bg-red-50 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <p className="text-sm text-ink">{alert.text}</p>
              <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">
                {alert.tag}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
