import { MapPin } from "lucide-react";
import { branches } from "@/lib/data";

export default function Branches() {
  return (
    <section id="branches" className="mx-auto max-w-7xl px-6 py-20">
      <span className="inline-block rounded-full bg-blush px-4 py-1.5 text-xs font-semibold text-coral-dark">
        Find Us Near You
      </span>
      <h2 className="mt-4 max-w-lg text-3xl font-semibold text-ink">
        Luxury Comfort at Every Corner
      </h2>
      <p className="mt-2 max-w-xl text-ink/60">
        With 2 locations across Pagadian City, our sanctuary is never too
        far. Each branch features our synchronized design language and
        premium facilities.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="flex gap-4 rounded-2xl border border-ink/10 p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush text-coral-dark">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-ink">{branch.name}</h3>
                  {branch.open && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      OPEN
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink/50">{branch.hours}</p>
                <p className="mt-1 text-sm text-ink/60">{branch.address}</p>
              </div>
            </div>
          ))}

          <button className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-medium text-ink/70 hover:border-coral hover:text-coral-dark">
            View All Branches on Map
          </button>
        </div>

        <div className="flex min-h-[260px] items-center justify-center rounded-2xl bg-rose">
          <span className="text-sm text-ink/40">Map preview</span>
        </div>
      </div>
    </section>
  );
}
