"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import BranchesToolbar from "@/components/admin/branches/BranchesToolbar";
import BranchDetailView from "@/components/admin/branches/BranchDetailView";
import { adminBranches } from "@/lib/adminData";
import { createClient } from "@/lib/supabase/client";

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

export default function BranchesManager() {
  const [region, setRegion] = useState("All Regions");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<(typeof adminBranches)[number] | null>(null);
  const [dbImages, setDbImages] = useState<Record<string, string>>({});
  const [dbHours, setDbHours] = useState<Record<string, string>>({});
  const [cardPositions, setCardPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const supabase = createClient();
    supabase.from("branches").select("name, image_url, hours").then(({ data }) => {
      if (!data) return;
      const imgs: Record<string, string> = {};
      const hrs: Record<string, string> = {};
      for (const row of data) {
        if (row.name && row.image_url) imgs[row.name] = row.image_url;
        if (row.name && row.hours) {
          hrs[row.name] = typeof row.hours === "string" ? row.hours : String(row.hours);
        }
      }
      setDbImages(imgs);
      setDbHours(hrs);
    });

    const pos: Record<string, { x: number; y: number }> = {};
    for (const b of adminBranches) {
      try {
        const stored = localStorage.getItem(`branch_pos_${b.name}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          pos[b.name] = { x: parsed.cardPosX ?? 50, y: parsed.cardPosY ?? 50 };
        }
      } catch {}
    }
    setCardPositions(pos);
  }, [refreshKey]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    return adminBranches.filter((b) => {
      const matchesRegion = region === "All Regions" || b.region === region;
      const matchesQuery = query.trim()
        ? b.name.toLowerCase().includes(query.toLowerCase()) ||
          b.address.toLowerCase().includes(query.toLowerCase()) ||
          b.manager.toLowerCase().includes(query.toLowerCase())
        : true;
      return matchesRegion && matchesQuery;
    });
  }, [region, query]);

  if (selected) {
    return <BranchDetailView branch={selected} onBack={() => { setSelected(null); setRefreshKey((k) => k + 1); }} />;
  }

  return (
    <div className="space-y-6">
      <BranchesToolbar
        region={region}
        onRegionChange={setRegion}
        query={query}
        onQueryChange={setQuery}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        {filtered.map((branch) => (
          <div key={branch.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="relative h-40 overflow-hidden">
              <Image
                src={dbImages[branch.name] ?? branch.image}
                alt={branch.name}
                fill
                className="object-cover"
                style={{ objectPosition: `${cardPositions[branch.name]?.x ?? 50}% ${cardPositions[branch.name]?.y ?? 50}%` }}
                sizes="(max-width: 640px) 100vw, 50vw"
              />
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-ink">{branch.name}</h3>
                {branch.status === "Active" ? (
                  isOpenNow(dbHours[branch.name] ?? branch.hours, now) ? (
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">Open</span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600">Closed</span>
                  )
                ) : (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    branch.status === "Maintenance" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"
                  }`}>
                    {branch.status}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink/60">{branch.address}</p>
              <p className="mt-2 text-xs text-ink/50">
                Manager: {branch.manager || "—"} &bull; {dbHours[branch.name] ?? branch.hours}
              </p>
              <button
                onClick={() => setSelected(branch)}
                className="mt-4 w-full rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
              >
                Manage Branch
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="col-span-2 py-10 text-center text-ink/40">
            No branches match this filter.
          </p>
        )}
      </div>
    </div>
  );
}
