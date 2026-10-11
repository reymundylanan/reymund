"use client";

import { CalendarDays, List, Search, X } from "lucide-react";
import type { StaffRow, ServiceRow } from "@/components/frontdesk/appointments/AppointmentsManager";

export type StatusFilter = "today" | "upcoming" | "past" | "completed" | "cancelled" | "no_show";

// Every control the same height and shape, so the rows line up.
const control = "h-10 rounded-full border border-ink/15 bg-white px-4 text-sm text-ink/75 outline-none transition hover:border-ink/30 focus:border-coral";

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

      <div role="tablist" aria-label="Show" className="mt-5 flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-[#f8f1df] p-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              onStatusFilterChange(f.key);
              onDateFilterChange("");
            }}
            role="tab"
            aria-selected={statusFilter === f.key && !dateFilter}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              statusFilter === f.key && !dateFilter ? "bg-coral text-white shadow-sm" : "text-ink/60 hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className={`${control} flex min-w-[16rem] flex-1 items-center gap-2 text-ink/50`}>
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name, phone, or booking ID..."
            aria-label="Search appointments"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
          />
        </label>

        <select
          value={staffFilter}
          onChange={(e) => onStaffFilterChange(e.target.value)}
          aria-label="Staff"
          className={`${control} w-40`}
        >
          <option value="all">All Staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>

        <select
          value={serviceFilter}
          onChange={(e) => onServiceFilterChange(e.target.value)}
          aria-label="Service"
          className={`${control} w-48 truncate`}
        >
          <option value="all">All Services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <label
          className={`${control} flex items-center gap-2 ${dateFilter ? "border-coral text-ink" : ""}`}
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
    </div>
  );
}
