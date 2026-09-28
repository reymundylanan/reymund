"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsRight, Filter, Gauge, Plus, Search } from "lucide-react";

export default function StaffScheduleHeader({
  date,
  onPrevDay,
  onNextDay,
  onToday,
  onAddBlock,
  search,
  onSearchChange,
  capacityPercent,
  departments,
  departmentFilter,
  onDepartmentFilterChange,
}: {
  date: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onAddBlock: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  capacityPercent: number | null;
  departments: string[];
  departmentFilter: string;
  onDepartmentFilterChange: (v: string) => void;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const label = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Staff Schedule</h1>
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={onPrevDay}
              aria-label="Previous day"
              className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-coral-dark"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-base text-ink/60">{label}</p>
            <button
              onClick={onNextDay}
              aria-label="Next day"
              className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-coral-dark"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={onToday}
              aria-label="Jump to today"
              title="Jump to today"
              className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-coral-dark"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {capacityPercent != null && (
            <span className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-2 text-sm text-ink/60">
              <Gauge className="h-4 w-4 text-coral-dark" /> Staff Capacity: {capacityPercent}%
            </span>
          )}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
              showFilters ? "border-coral text-coral-dark" : "border-ink/15 text-ink/70 hover:border-ink/30"
            }`}
          >
            <Filter className="h-4 w-4" /> Filter Staff
          </button>
          <button
            onClick={onAddBlock}
            className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
          >
            <Plus className="h-4 w-4" /> Add Block
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search staff by name..."
              className="w-64 rounded-full border border-ink/15 py-2 pl-9 pr-3 text-sm focus:border-coral focus:outline-none"
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => onDepartmentFilterChange(e.target.value)}
            className="rounded-full border border-ink/15 px-3 py-2 text-sm text-ink/70 outline-none focus:border-coral"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
