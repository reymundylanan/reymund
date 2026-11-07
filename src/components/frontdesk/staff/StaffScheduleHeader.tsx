"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsRight, Filter, Gauge, Plus, Search, UserCog } from "lucide-react";
import PageHero, { HERO_CHIP } from "@/components/portal/PageHero";

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
    <PageHero
      icon={UserCog}
      eyebrow="Front desk"
      title="Staff Schedule"
      subtitle={
          <div className="flex items-center gap-2">
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
      }
      actions={
        <>
          {capacityPercent != null && (
            <span className={`${HERO_CHIP} text-ink/60`}>
              <Gauge className="h-4 w-4 text-coral-dark" /> Staff Capacity: {capacityPercent}%
            </span>
          )}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
              showFilters ? "border-coral bg-white text-coral-dark" : "border-ink/15 bg-white text-ink/70 hover:border-ink/30"
            }`}
          >
            <Filter className="h-4 w-4" /> Filter Staff
          </button>
          <button
            onClick={onAddBlock}
            className="lux-sheen flex items-center gap-2 rounded-full bg-gradient-to-r from-coral to-coral-dark px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgba(168,137,48,0.9)] transition duration-300 hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" /> Add Block
          </button>
        </>
      }
    >
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search staff by name..."
              className="w-64 rounded-full border border-ink/15 bg-white py-2 pl-9 pr-3 text-sm focus:border-coral focus:outline-none"
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => onDepartmentFilterChange(e.target.value)}
            className="rounded-full border border-ink/15 bg-white px-3 py-2 text-sm text-ink/70 outline-none focus:border-coral"
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
    </PageHero>
  );
}
