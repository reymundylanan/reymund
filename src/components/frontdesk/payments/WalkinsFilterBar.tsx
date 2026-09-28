import { RefreshCw } from "lucide-react";
import type { WalkinStatusKey } from "@/components/frontdesk/payments/walkinStatus";

const STATUS_OPTIONS: { value: WalkinStatusKey | "all"; label: string }[] = [
  { value: "all", label: "All Status" },
  { value: "waiting", label: "Waiting" },
  { value: "in_service", label: "In Service" },
  { value: "time_reached", label: "Time Reached" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
];

export default function WalkinsFilterBar({
  statusFilter,
  onStatusFilterChange,
  serviceFilter,
  onServiceFilterChange,
  serviceOptions,
  staffFilter,
  onStaffFilterChange,
  staffOptions,
  dateKey,
  onDateChange,
  onRefresh,
}: {
  statusFilter: WalkinStatusKey | "all";
  onStatusFilterChange: (v: WalkinStatusKey | "all") => void;
  serviceFilter: string;
  onServiceFilterChange: (v: string) => void;
  serviceOptions: string[];
  staffFilter: string;
  onStaffFilterChange: (v: string) => void;
  staffOptions: string[];
  dateKey: string;
  onDateChange: (v: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as WalkinStatusKey | "all")}
        className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={serviceFilter}
        onChange={(e) => onServiceFilterChange(e.target.value)}
        className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
      >
        <option value="all">All Services</option>
        {serviceOptions.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select
        value={staffFilter}
        onChange={(e) => onStaffFilterChange(e.target.value)}
        className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
      >
        <option value="all">All Staff</option>
        {staffOptions.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <input
        type="date"
        value={dateKey}
        onChange={(e) => onDateChange(e.target.value)}
        className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
      />

      <button
        onClick={onRefresh}
        className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-sm font-medium text-ink/70 hover:border-ink/30"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Refresh
      </button>
    </div>
  );
}
