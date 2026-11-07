"use client";

import { CalendarClock, CalendarDays, CalendarPlus, List, Search, X } from "lucide-react";
import PageHero from "@/components/portal/PageHero";
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
  onNewBooking,
  newBookingDisabled = false,
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
  onNewBooking?: () => void;
  newBookingDisabled?: boolean;
}) {
  return (
    <PageHero
      icon={CalendarClock}
      eyebrow="Front desk"
      title="Appointments"
      subtitle={`Manage and track daily bookings for ${branchName ?? "your"} branch.`}
      actions={
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-ink/15 bg-white p-1">
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
          {onNewBooking && (
            <button
              type="button"
              onClick={onNewBooking}
              disabled={newBookingDisabled}
              className="lux-sheen flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-coral to-coral-dark px-5 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgba(168,137,48,0.9)] transition duration-300 hover:-translate-y-0.5 disabled:opacity-50"
            >
              <CalendarPlus className="h-4 w-4" /> New Booking
            </button>
          )}
        </div>
      }
    >
      <div role="tablist" aria-label="Show" className="flex w-fit max-w-full flex-wrap gap-1 rounded-full border border-[#e6d6ad] bg-[#fbf6ea] p-1">
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
              statusFilter === f.key && !dateFilter ? "bg-coral text-white shadow-sm" : "text-ink/80 hover:bg-white hover:text-ink"
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
    </PageHero>
  );
}
