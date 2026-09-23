import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PaymentVerification } from "@/lib/supabase/queries/frontdeskDashboard";

export default function AlertsPanel({
  verifications,
}: {
  verifications: PaymentVerification[];
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Payment Verifications</h2>
      <div className="mt-4 space-y-3">
        {verifications.length === 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-green-50 p-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            <p className="text-sm text-ink/70">No pending payments need verification.</p>
          </div>
        )}
        {verifications.map((alert) => (
          <div
            key={alert.id}
            className="flex items-start gap-3 rounded-xl bg-red-50 p-3"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-medium text-ink">{alert.title}</p>
              <p className="text-xs text-ink/60">{alert.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
