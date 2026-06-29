"use client";

import { useState } from "react";
import { ChevronDown, Phone } from "lucide-react";
import { useBooking } from "@/components/booking/BookingContext";
import { branchContacts, branchServiceCategories } from "@/lib/data";

export default function BranchExplorer({
  defaultBranchId,
}: {
  defaultBranchId?: string;
}) {
  const { open } = useBooking();
  const [branchId, setBranchId] = useState(
    defaultBranchId ?? branchContacts[0].id
  );
  const [categoryId, setCategoryId] = useState(branchServiceCategories[0].id);

  const branch =
    branchContacts.find((b) => b.id === branchId) ?? branchContacts[0];
  const category =
    branchServiceCategories.find((c) => c.id === categoryId) ??
    branchServiceCategories[0];

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Branch</p>
          <div className="relative">
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full appearance-none rounded-full border border-ink/10 bg-white px-4 py-2.5 pr-9 text-sm font-medium text-ink"
            >
              {branchContacts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          </div>

          <div className="mt-4 rounded-2xl border border-ink/10 p-4">
            <p className="text-xs font-semibold uppercase text-ink/40">
              {branch.area}
            </p>
            <p className="mt-1 text-sm text-ink/70">{branch.address}</p>

            <a
              href={`tel:${branch.phone}`}
              className="mt-3 flex items-center gap-2 text-sm font-medium text-ink hover:text-coral-dark"
            >
              <Phone className="h-4 w-4" /> {branch.phone}
            </a>
            <p className="mt-1 text-xs text-ink/50">🇵🇭 Philippines</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Services</p>
          <div className="flex flex-wrap gap-2 border-b border-ink/10 pb-4">
            {branchServiceCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryId(cat.id)}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                  categoryId === cat.id
                    ? "bg-coral text-white"
                    : "text-ink/50 hover:text-coral-dark"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {category.services.map((service, i) => (
              <div
                key={`${service.name}-${i}`}
                className="flex items-center justify-between rounded-2xl border border-ink/10 p-4"
              >
                <div>
                  <p className="font-medium text-ink">{service.name}</p>
                  <p className="text-xs text-ink/50">({service.duration})</p>
                  <p className="mt-2 font-semibold text-gold">
                    ₱{service.price.toLocaleString()}.00
                  </p>
                </div>
                <button
                  onClick={() =>
                    open({
                      name: service.name,
                      duration: service.duration,
                      price: service.price,
                    })
                  }
                  className="rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white hover:bg-coral-dark"
                >
                  Book Now
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
