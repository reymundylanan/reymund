import { CalendarDays, RefreshCw } from "lucide-react";

// Every control the same height and shape, so the row lines up.
const control = "h-10 rounded-full border border-ink/15 bg-white px-4 text-sm text-ink/75 outline-none transition hover:border-ink/30 focus:border-coral";
import type { WalkinStatusKey } from "@/components/frontdesk/payments/walkinStatus";

const STATUS_OPTIONS: { value: WalkinStatusKey | "all"; label: string }[] = [
  { value: "all", label: "All Status" },
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
      <span className="px-1 text-xs font-semibold text-ink/45">Filter</span>
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as WalkinStatusKey | "all")}
        aria-label="Status"
        className={`${control} w-36`}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={serviceFilter}
        onChange={(e) => onServiceFilterChange(e.target.value)}
        aria-label="Service"
        className={`${control} w-48 truncate`}
      >
        <option value="all">All Services</option>
        {serviceOptions.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select
        value={staffFilter}
        onChange={(e) => onStaffFilterChange(e.target.value)}
        aria-label="Staff"
        className={`${control} w-40`}
      >
        <option value="all">All Staff</option>
        {staffOptions.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <label className={`${control} flex items-center gap-2`}>
        <CalendarDays className="h-4 w-4 text-ink/40" />
        <span className="sr-only">Date</span>
        <input type="date" value={dateKey} onChange={(e) => onDateChange(e.target.value)} className="bg-transparent text-sm outline-none" />
      </label>

      <button
        onClick={onRefresh}
        className={`${control} ml-auto flex items-center gap-1.5 font-medium`}
      >
        <RefreshCw className="h-3.5 w-3.5" /> Refresh
      </button>
    </div>
  );
}
