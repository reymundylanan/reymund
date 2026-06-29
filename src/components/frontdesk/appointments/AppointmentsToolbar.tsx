"use client";

import { CalendarDays, List, Search } from "lucide-react";

export default function AppointmentsToolbar({
  view,
  onViewChange,
  query,
  onQueryChange,
  branchName,
}: {
  view: "calendar" | "list";
  onViewChange: (v: "calendar" | "list") => void;
  query: string;
  onQueryChange: (q: string) => void;
  branchName?: string | null;
}) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-56 text-sm outline-none placeholder:text-ink/40"
          />
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-blush px-4 py-2 text-sm font-medium text-coral-dark">
            Date: {today}
          </span>
        </div>
      </div>
    </div>
  );
}
