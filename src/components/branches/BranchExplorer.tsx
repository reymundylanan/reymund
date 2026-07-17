"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { useBooking } from "@/components/booking/BookingContext";

export type BranchInfo = {
  name: string;
  area: string;
  address: string;
  phone: string;
  hours: string;
  facebook: string;
  facebook_label: string;
  instagram: string;
  instagram_label: string;
};

export type DbBranchService = {
  id: string;
  name: string;
  category: string;
  department: string;
  duration: string | null;
  price: number;
  price_41: number | null;
  brows_type: string | null;
  body_wellness_type: string | null;
  laser_type: string | null;
  slimming_type: string | null;
  non_surgical_type: string | null;
  doctor_type: string | null;
  hair_options: { type?: string; subType?: string | null; prices?: { short: string; medium: string; long: string } } | null;
  facial_options: { isPremium?: boolean } | null;
  addons: { hasAddons?: boolean }[] | null;
};

function getServiceType(svc: DbBranchService): string | null {
  switch (svc.category) {
    case "Brows & Lashes": return svc.brows_type;
    case "Body & Wellness": return svc.body_wellness_type;
    case "Laser Services": return svc.laser_type;
    case "Slimming Services": return svc.slimming_type;
    case "Non-Surgical Liposuction": return svc.non_surgical_type;
    case "Doctor's Procedure": return svc.doctor_type;
    case "Hair Services": {
      const h = svc.hair_options;
      if (!h?.type) return null;
      return h.subType ? `${h.type} · ${h.subType}` : h.type;
    }
    case "Facial Services":
      return svc.facial_options?.isPremium ? "Premium" : null;
    case "Nail Care":
      return svc.addons?.some((a) => a.hasAddons) ? "Add On" : null;
    default: return null;
  }
}

export type BranchCategory = {
  name: string;
  services: DbBranchService[];
};

export default function BranchExplorer({
  defaultBranchId,
  categories,
  branchInfo,
}: {
  defaultBranchId?: string;
  categories: BranchCategory[];
  branchInfo: BranchInfo;
}) {
  const { open } = useBooking();
  const [activeCat, setActiveCat] = useState(categories[0]?.name ?? "");

  const currentServices =
    categories.find((c) => c.name === activeCat)?.services ?? [];

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div>
          <div className="rounded-2xl border border-ink/10 p-4">
            <p className="text-xs font-semibold uppercase text-ink/40">
              {branchInfo.area}
            </p>
            <p className="mt-1 text-sm text-ink/70">{branchInfo.address}</p>

            <a
              href={`tel:${branchInfo.phone}`}
              className="mt-3 flex items-center gap-2 text-sm font-medium text-ink hover:text-coral-dark"
            >
              <Phone className="h-4 w-4" /> {branchInfo.phone}
            </a>
            {branchInfo.facebook && (
              <div className="mt-2 flex items-center gap-2 text-sm font-medium text-ink">
                <svg className="h-4 w-4 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.883v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                {branchInfo.facebook_label || branchInfo.facebook}
              </div>
            )}
            {branchInfo.instagram && (
              <div className="mt-2 flex items-center gap-2 text-sm font-medium text-ink">
                <svg className="h-4 w-4 text-[#E1306C]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                {branchInfo.instagram_label || branchInfo.instagram}
              </div>
            )}
            <p className="mt-2 text-xs text-ink/50">🇵🇭 Philippines</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xl font-semibold text-ink">Services</p>
          <div className="flex flex-wrap gap-2 border-b border-ink/10 pb-4">
            {categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setActiveCat(cat.name)}
                className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-wide transition ${
                  activeCat === cat.name
                    ? "bg-coral text-white"
                    : "border border-ink/20 text-ink/70 hover:border-coral hover:text-coral-dark"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {currentServices.map((svc) => (
              <div
                key={svc.id}
                className="flex items-center justify-between rounded-2xl border border-ink/10 p-4"
              >
                <div>
                  <p className="font-medium text-ink">{svc.name}</p>
                  {getServiceType(svc) && (
                    <span className="inline-block rounded-full bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral-dark">
                      {getServiceType(svc)}
                    </span>
                  )}
                  {svc.duration && (
                    <p className="text-xs text-ink/50">({svc.duration})</p>
                  )}
                  {svc.hair_options?.prices ? (
                    <div className="mt-2 space-y-0.5 text-xs text-ink/70">
                      {(["Short", "Medium", "Long"] as const).map((size) => {
                        const raw = svc.hair_options!.prices![size.toLowerCase() as "short" | "medium" | "long"];
                        const val = Number(String(raw).replace(/,/g, ""));
                        return (
                          <p key={size}>{size} — <span className="font-semibold text-gold">₱{isNaN(val) ? "—" : val.toLocaleString()}</span></p>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 font-semibold text-gold">
                      ₱{(svc.price ?? 0).toLocaleString()}.00
                    </p>
                  )}
                  {svc.price_41 && !svc.hair_options?.prices && (
                    <p className="text-xs text-ink/50">
                      5-session: ₱{svc.price_41.toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() =>
                    open({
                      name: svc.name,
                      duration: svc.duration ?? "",
                      price: svc.price ?? 0,
                    })
                  }
                  className="rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white hover:bg-coral-dark"
                >
                  Book Now
                </button>
              </div>
            ))}
            {currentServices.length === 0 && (
              <p className="col-span-2 py-8 text-center text-sm text-ink/40">
                No services in this category.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
