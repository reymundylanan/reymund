"use client";

import Link from "next/link";
import { MapPin, Phone, Star } from "lucide-react";
import { branchContacts } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

const catalogHrefByBranchId: Record<string, string> = {
  "one-cecilia-center": "/branches/pagadian",
  "robinson-mall": "/branches/robinsons",
};

function parseTime12h(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const p = m[3].toUpperCase();
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function isOpenNow(hours: string, now: Date): boolean {
  const parts = hours.split(" - ");
  if (parts.length !== 2) return false;
  const open = parseTime12h(parts[0]);
  const close = parseTime12h(parts[1]);
  if (open == null || close == null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return cur >= open && cur < close;
}

export default function BranchListSidebar({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [dbHours, setDbHours] = useState<Record<string, string>>({});
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const supabase = createClient();
    supabase.from("branches").select("name, hours").then(({ data }) => {
      if (!data) return;
      const hrs: Record<string, string> = {};
      for (const row of data) {
        if (row.name && row.hours) {
          hrs[row.name as string] = typeof row.hours === "string" ? row.hours : String(row.hours);
        }
      }
      setDbHours(hrs);
    });
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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
              {(() => {
                const hoursStr = dbHours[branch.name] ?? branch.hours[new Date().getDay()]?.time ?? "";
                const open = hoursStr ? isOpenNow(hoursStr, now) : branch.open;
                return open
                  ? <span className="font-medium text-green-700">Open Now</span>
                  : <span className="font-medium text-red-600">Closed</span>;
              })()}
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
