"use client";

import { CalendarDays, List, Search, X } from "lucide-react";
import type { StaffRow, ServiceRow } from "@/components/frontdesk/appointments/AppointmentsManager";

export type StatusFilter = "today" | "upcoming" | "past" | "completed" | "cancelled" | "no_show";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "no_show", label: "No-show" },
];

export default function AppointmentsToolbar({
  view,
  onViewChange,
  query,
  onQueryChange,
  branchName,
  statusFilter,
  onStatusFilterChange,
  staff,
  staffFilter,
  onStaffFilterChange,
  services,
  serviceFilter,
  onServiceFilterChange,
  dateFilter,
  onDateFilterChange,
}: {
  view: "calendar" | "list";
  onViewChange: (v: "calendar" | "list") => void;
  query: string;
  onQueryChange: (q: string) => void;
  branchName?: string | null;
  statusFilter: StatusFilter;
  onStatusFilterChange: (f: StatusFilter) => void;
  staff: StaffRow[];
  staffFilter: string;
  onStaffFilterChange: (id: string) => void;
  services: ServiceRow[];
  serviceFilter: string;
  onServiceFilterChange: (id: string) => void;
  dateFilter: string;
  onDateFilterChange: (date: string) => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Appointment Management</h1>
          <p className="text-sm text-ink/50">
            Manage and track daily bookings for {branchName ?? "your"} branch.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-ink/15 p-1">
            <button
              onClick={() => onViewChange("calendar")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                view === "calendar" ? "bg-coral text-white" : "text-ink/60"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Calendar
            </button>
            <button
              onClick={() => onViewChange("list")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                view === "list" ? "bg-coral text-white" : "text-ink/60"
              }`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              onStatusFilterChange(f.key);
              onDateFilterChange("");
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              statusFilter === f.key && !dateFilter ? "bg-coral text-white" : "border border-ink/15 text-ink/60 hover:border-coral"
            }`}
          >
            {f.label}
          </button>
        ))}

        <select
          value={staffFilter}
          onChange={(e) => onStaffFilterChange(e.target.value)}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink/70 outline-none focus:border-coral"
        >
          <option value="all">All Staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>

        <select
          value={serviceFilter}
          onChange={(e) => onServiceFilterChange(e.target.value)}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink/70 outline-none focus:border-coral"
        >
          <option value="all">All Services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <label
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${
            dateFilter ? "border-coral text-ink" : "border-ink/15 text-ink/70"
          }`}
        >
          <CalendarDays className="h-4 w-4 text-ink/40" />
          <span className="sr-only">Show a specific date</span>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => onDateFilterChange(e.target.value)}
            className="bg-transparent text-sm outline-none"
          />
          {dateFilter && (
            <button type="button" onClick={() => onDateFilterChange("")} aria-label="Clear date" className="text-ink/40 hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name, phone, or booking ID..."
            className="w-64 text-sm outline-none placeholder:text-ink/40"
          />
        </div>
      </div>
    </div>
  );
}
