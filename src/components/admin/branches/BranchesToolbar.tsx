"use client";

import { BarChart3, Plus, Search } from "lucide-react";
import { regionFilters } from "@/lib/adminData";

export default function BranchesToolbar({
  region,
  onRegionChange,
  query,
  onQueryChange,
}: {
  region: string;
  onRegionChange: (r: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Branches &amp; Services</h1>
          <p className="text-sm text-ink/50">
            Centrally manage physical salon locations, regional service
            pricing, seasonal promotions, and optimized staff scheduling
            across your entire network.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            <BarChart3 className="h-4 w-4" /> View Regional Analytics
          </button>
          <button className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
            <Plus className="h-4 w-4" /> Add New Branch
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search branches by name, city, or manager..."
            className="w-64 text-sm outline-none placeholder:text-ink/40"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {regionFilters.map((r) => (
            <button
              key={r.label}
              onClick={() => onRegionChange(r.label)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                region === r.label
                  ? "bg-coral text-white"
                  : "border border-ink/15 text-ink/70 hover:border-coral"
              }`}
            >
              {r.label} ({r.count})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
