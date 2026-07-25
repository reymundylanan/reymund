"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { branches } from "@/lib/data";
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

export default function Branches() {
  const [selected, setSelected] = useState<string>(branches[0].id);
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

  const selectedBranch = branches.find((b) => b.id === selected) ?? branches[0];
  const mapQuery = encodeURIComponent(selectedBranch.address);
  const mapSrc = `https://www.google.com/maps?q=${mapQuery}&output=embed`;

  return (
    <section id="branches" className="mx-auto max-w-7xl px-6 py-20">
      <span className="inline-block rounded-full bg-blush px-4 py-1.5 text-xs font-semibold text-coral-dark">
        Find Us Near You
      </span>
      <h2 className="mt-4 max-w-lg text-3xl font-semibold text-ink">
        Luxury Comfort at Every Corner
      </h2>
      <p className="mt-2 max-w-xl text-ink/60">
        With 2 locations across Pagadian City, our sanctuary is never too far.
        Each branch features our synchronized design language and premium
        facilities.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          {branches.map((branch) => {
            const hoursStr = dbHours[branch.name] ?? branch.hours;
            const open = hoursStr ? isOpenNow(hoursStr, now) : branch.open;
            return (
              <button
                key={branch.id}
                onClick={() => setSelected(branch.id)}
                className={`flex w-full gap-4 rounded-2xl border p-4 text-left transition ${
                  selected === branch.id
                    ? "border-coral bg-blush shadow-sm"
                    : "border-ink/10 hover:border-coral/50"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                    selected === branch.id
                      ? "bg-coral text-white"
                      : "bg-blush text-coral-dark"
                  }`}
                >
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-ink">{branch.name}</h3>
                    {open ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Open</span>
                    ) : (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Closed</span>
                    )}
                  </div>
                  <p className="text-sm text-ink/50">{hoursStr}</p>
                  <p className="mt-1 text-sm text-ink/60">{branch.address}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-2xl" style={{ minHeight: 320 }}>
          <iframe
            key={mapSrc}
            title="GlowSync branch location"
            src={mapSrc}
            width="100%"
            height="100%"
            style={{ minHeight: 320, border: 0, display: "block" }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
}
