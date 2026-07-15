"use client";

import { useMemo, useState } from "react";
import { Clock, Search, ChevronDown } from "lucide-react";
import Image from "next/image";
import { useBooking } from "@/components/booking/BookingContext";

export type DbService = {
  id: string;
  name: string;
  category: string;
  department: string;
  duration: string | null;
  price: number;
  price_41: number | null;
  description: string | null;
  image_url: string | null;
};

type SortOption = "name-asc" | "price-asc" | "price-desc";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "name-asc", label: "Name A–Z" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

function sortServices(items: DbService[], sort: SortOption) {
  const sorted = [...items];
  if (sort === "name-asc") sorted.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
  return sorted;
}

export default function ServiceCatalog({ services }: { services: DbService[] }) {
  const { open } = useBooking();
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("name-asc");

  const categories = useMemo(() => {
    const cats = Array.from(new Set(services.map((s) => s.category)));
    return ["All", ...cats];
  }, [services]);

  const filtered = useMemo(() => {
    const byCategory =
      category === "All" ? services : services.filter((s) => s.category === category);
    const byQuery = query.trim()
      ? byCategory.filter(
          (s) =>
            s.name.toLowerCase().includes(query.trim().toLowerCase()) ||
            (s.description ?? "").toLowerCase().includes(query.trim().toLowerCase())
        )
      : byCategory;
    return sortServices(byQuery, sort);
  }, [services, category, query, sort]);

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              category === cat
                ? "bg-coral text-white"
                : "border border-ink/10 text-ink/70 hover:border-coral hover:text-coral-dark"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-ink/10 px-4 py-2.5 sm:max-w-sm">
          <Search className="h-4 w-4 text-ink/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services (e.g. Massage, Facial)..."
            className="w-full text-sm outline-none placeholder:text-ink/40"
          />
        </div>
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="appearance-none rounded-full border border-ink/10 bg-white px-4 py-2.5 pr-9 text-sm font-medium text-ink/70"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
        </div>
      </div>

      <div className="mt-10 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-ink">
            {category === "All" ? "All Services" : category}
          </h2>
          <p className="mt-1 text-sm text-ink/50">
            Found {filtered.length} treatment{filtered.length === 1 ? "" : "s"}
          </p>
        </div>
        {filtered.length > 0 && (
          <p className="text-sm text-ink/50">Showing 1–{filtered.length} of {filtered.length}</p>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((svc) => (
            <div key={svc.id} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="relative h-40 overflow-hidden bg-blush">
                {svc.image_url ? (
                  <Image
                    src={svc.image_url}
                    alt={svc.name}
                    fill
                    className="object-cover object-center"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-ink/20">No image</div>
                )}
                <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white">
                  {svc.category}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <h3 className="font-semibold text-ink">{svc.name}</h3>
                {svc.description && (
                  <p className="line-clamp-2 text-sm text-ink/60">{svc.description}</p>
                )}
                {svc.duration && (
                  <div className="flex items-center gap-1 text-xs text-ink/50">
                    <Clock className="h-3.5 w-3.5" />
                    {svc.duration}
                  </div>
                )}
                <div className="mt-auto space-y-1 border-t border-ink/10 pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink/60">
                      1 Session{" "}
                      <span className="font-semibold text-gold">₱{(svc.price ?? 0).toLocaleString()}</span>
                    </span>
                    <button
                      onClick={() => open({ name: svc.name, duration: svc.duration ?? "", price: svc.price ?? 0 })}
                      className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral-dark"
                    >
                      Book Now
                    </button>
                  </div>
                  {svc.price_41 && (
                    <div className="text-sm text-ink/60">
                      5 Session{" "}
                      <span className="font-semibold text-gold">₱{svc.price_41.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-10 text-center text-ink/50">No treatments match your search.</p>
      )}
    </section>
  );
}
