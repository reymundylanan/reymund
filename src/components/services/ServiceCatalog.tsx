"use client";

import { useMemo, useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import ServiceCard from "@/components/ServiceCard";
import { catalogCategories, catalogServices, type CatalogService } from "@/lib/data";

type SortOption = "popular" | "price-asc" | "price-desc";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "popular", label: "Most Popular" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

function sortServices(items: CatalogService[], sort: SortOption) {
  const sorted = [...items];
  if (sort === "price-asc") sorted.sort((a, b) => a.singlePrice - b.singlePrice);
  if (sort === "price-desc") sorted.sort((a, b) => b.singlePrice - a.singlePrice);
  if (sort === "popular") sorted.sort((a, b) => b.rating - a.rating);
  return sorted;
}

export default function ServiceCatalog() {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("popular");

  const filtered = useMemo(() => {
    const byCategory =
      category === "All"
        ? catalogServices
        : catalogServices.filter((service) => service.group === category);

    const byQuery = query.trim()
      ? byCategory.filter((service) =>
          service.name.toLowerCase().includes(query.trim().toLowerCase())
        )
      : byCategory;

    return sortServices(byQuery, sort);
  }, [category, query, sort]);

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex flex-wrap gap-2">
        {catalogCategories.map((cat) => (
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
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
        </div>
      </div>

      <div className="mt-10 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-ink">All Services</h2>
          <p className="mt-1 text-sm text-ink/50">
            Found {filtered.length} exceptional treatment
            {filtered.length === 1 ? "" : "s"}
          </p>
        </div>
        <p className="text-sm text-ink/50">
          Showing 1-{filtered.length} of {filtered.length}
        </p>
      </div>

      {filtered.length > 0 ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((service) => (
            <ServiceCard
              key={service.id}
              badge={service.badge}
              name={service.name}
              rating={service.rating}
              description={service.description}
              duration={service.duration}
              next={service.next}
              singlePrice={service.singlePrice}
              packPrice={service.packPrice}
              image={service.image}
            />
          ))}
        </div>
      ) : (
        <p className="mt-10 text-center text-ink/50">
          No treatments match your search.
        </p>
      )}

      <div className="mt-10 flex items-center justify-center gap-2 text-sm">
        {["1", "2", "3", "...", "9"].map((page) => (
          <button
            key={page}
            className={`h-9 w-9 rounded-full ${
              page === "1"
                ? "bg-coral text-white"
                : "text-ink/60 hover:bg-blush"
            }`}
          >
            {page}
          </button>
        ))}
      </div>
    </section>
  );
}
