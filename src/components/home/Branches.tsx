"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { branches } from "@/lib/data";

export default function Branches() {
  const [selected, setSelected] = useState<string>(branches[0].id);

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
          {branches.map((branch) => (
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
              <div>
                <h3 className="font-semibold text-ink">{branch.name}</h3>
                <p className="text-sm text-ink/50">{branch.hours}</p>
                <p className="mt-1 text-sm text-ink/60">{branch.address}</p>
              </div>
            </button>
          ))}
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
