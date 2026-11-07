"use client";

import Link from "next/link";
import { BarChart3, Building2, Plus, Search } from "lucide-react";
import PageHero from "@/components/portal/PageHero";

export default function BranchesToolbar({
  regions,
  onAdd,
  region,
  onRegionChange,
  query,
  onQueryChange,
}: {
  regions: { label: string; count: number }[];
  onAdd: () => void;
  region: string;
  onRegionChange: (r: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  return (
    <PageHero
      icon={Building2}
      eyebrow="Locations & menu"
      title="Branches & Services"
      subtitle="Manage your branches, their services and prices, promotions and staff."
      actions={
        <>
          <Link href="/admin/reports" className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink/70 ring-1 ring-[#efe3c6] transition hover:text-coral-dark hover:ring-coral/50">
            <BarChart3 className="h-4 w-4" /> View Regional Analytics
          </Link>
          <button type="button" onClick={onAdd} className="lux-sheen flex items-center gap-2 rounded-full bg-gradient-to-r from-coral to-coral-dark px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_-10px_rgba(168,137,48,0.9)] transition duration-300 hover:-translate-y-0.5">
            <Plus className="h-4 w-4" /> Add New Branch
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/50">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search branches by name, city, or manager..."
            className="w-64 text-sm outline-none placeholder:text-ink/40"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {regions.map((r) => (
            <button
              key={r.label}
              onClick={() => onRegionChange(r.label)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                region === r.label
                  ? "bg-coral text-white"
                  : "border border-ink/15 bg-white text-ink/70 hover:border-coral"
              }`}
            >
              {r.label} ({r.count})
            </button>
          ))}
        </div>
      </div>
    </PageHero>
  );
}
