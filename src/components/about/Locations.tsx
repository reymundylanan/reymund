import { MapPin } from "lucide-react";
import { aboutLocations } from "@/lib/data";

export default function Locations() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-semibold text-ink">
          Our <span className="text-coral">Premier</span> Locations
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-ink/60">
          Visit us at our strategically located branches in the heart of
          Pagadian City
        </p>
        <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-coral" />
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {aboutLocations.map((loc) => (
          <div
            key={loc.id}
            className="overflow-hidden rounded-2xl border border-ink/10"
          >
            <div className="relative h-48 bg-gradient-to-br from-rose to-coral-dark">
              <span className="absolute left-4 top-4 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-ink">
                Open Daily
              </span>
            </div>
            <div className="p-5">
              <p className="flex items-center gap-1 text-xs font-medium text-coral-dark">
                <MapPin className="h-3.5 w-3.5" />
                {loc.subtitle}
              </p>
              <h3 className="mt-2 font-semibold text-ink">{loc.name}</h3>
              <p className="mt-2 text-sm text-ink/60">{loc.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
