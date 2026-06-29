"use client";

import { CalendarDays, List, Plus } from "lucide-react";

const filters = ["All Branches", "All Specialists", "All Statuses"];

export default function BookingsToolbar({
  view,
  onViewChange,
}: {
  view: "calendar" | "list";
  onViewChange: (v: "calendar" | "list") => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral"
          >
            {f}
          </button>
        ))}
        <span className="rounded-full bg-blush px-4 py-2 text-sm font-medium text-coral-dark">
          Nov 19 - Nov 25, 2023
        </span>
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
        <button className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
          Bulk Confirm
        </button>
        <button className="flex items-center gap-1.5 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
          <Plus className="h-4 w-4" /> New Booking
        </button>
      </div>
    </div>
  );
}
