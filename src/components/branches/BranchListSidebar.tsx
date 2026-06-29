"use client";

import Link from "next/link";
import { MapPin, Phone, Star } from "lucide-react";
import { branchContacts } from "@/lib/data";

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

const catalogHrefByBranchId: Record<string, string> = {
  "one-cecilia-center": "/branches/pagadian",
  "robinson-mall": "/branches/robinsons",
};

export default function BranchListSidebar({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between text-xs font-medium text-ink/50">
        <span>NEARBY LOCATION ({branchContacts.length})</span>
        <span>Sort by Distance</span>
      </div>

      <div className="flex flex-col gap-4">
        {branchContacts.map((branch) => (
          <div
            key={branch.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(branch.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(branch.id);
            }}
            className={`cursor-pointer rounded-2xl border p-4 text-left transition ${
              selectedId === branch.id
                ? "border-coral bg-blush"
                : "border-ink/10 hover:border-coral"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink">{branch.name}</h3>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink">
                <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                {branch.rating}
              </span>
            </div>
            <a
              href={mapsUrl(branch.address)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 flex items-start gap-1 text-sm text-ink/60 hover:text-coral-dark"
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {branch.address}
            </a>
            <div className="mt-2 flex items-center gap-3 text-xs">
              {branch.open && (
                <span className="font-medium text-green-700">Open Now</span>
              )}
              <a
                href={`tel:${branch.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-ink/50 hover:text-coral-dark"
              >
                <Phone className="h-3 w-3" /> Contact
              </a>
            </div>
            <Link
              href={catalogHrefByBranchId[branch.id] ?? "/branches/pagadian"}
              onClick={(e) => e.stopPropagation()}
              className="mt-3 block rounded-full bg-coral px-4 py-2 text-center text-sm font-semibold text-white hover:bg-coral-dark"
            >
              Browse Full Catalog
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
