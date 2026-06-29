import ReportBuilder from "@/components/admin/reports/ReportBuilder";
import SystemConfig from "@/components/admin/reports/SystemConfig";
import NotificationTemplates from "@/components/admin/reports/NotificationTemplates";
import AuditLogs from "@/components/admin/reports/AuditLogs";

export default function AdminReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            Reports &amp; System Settings
          </h1>
          <p className="text-sm text-ink/50">
            Configure global operational parameters and generate business
            intelligence reports.
          </p>
        </div>
        <div className="flex gap-2 text-xs font-medium">
          <span className="rounded-full bg-green-100 px-3 py-1.5 text-green-700">
            System Health: Optimal
          </span>
          <span className="rounded-full bg-blush px-3 py-1.5 text-coral-dark">
            Last Audit: 2m ago
          </span>
        </div>
      </div>

      <ReportBuilder />

      <div className="grid gap-6 lg:grid-cols-2">
        <SystemConfig />
        <div className="space-y-6">
          <NotificationTemplates />
          <AuditLogs />
        </div>
      </div>
    </div>
  );
}
