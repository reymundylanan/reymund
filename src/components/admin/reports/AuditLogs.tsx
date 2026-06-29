import { ShieldAlert } from "lucide-react";
import { auditLogs } from "@/lib/adminData";

export default function AuditLogs() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Admin Audit Logs</h2>
        <span className="flex items-center gap-1 text-xs font-medium text-green-600">
          <span className="h-2 w-2 rounded-full bg-green-500" /> Live Feed
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {auditLogs.map((log) => (
          <div key={log.id} className="flex items-start justify-between gap-3">
            <p className="flex items-start gap-2 text-sm text-ink/70">
              {log.severity === "high" && (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              )}
              {log.text}
            </p>
            <span className="shrink-0 text-xs text-ink/40">{log.time}</span>
          </div>
        ))}
      </div>

      <button className="mt-4 text-sm font-medium text-coral-dark">
        View Full System Logs
      </button>
    </div>
  );
}
