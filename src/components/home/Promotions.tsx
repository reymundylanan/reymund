import Link from "next/link";
import { ArrowRight, Tag } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import { createClient } from "@/lib/supabase/server";
import { getActivePromotions } from "@/lib/supabase/queries/publicContent";

/** Home → Active Promotions: the real promotions Admin creates per branch. */
export default async function Promotions() {
  const promos = await getActivePromotions(await createClient(), 6);

  return (
    <section id="promotions" className="mx-auto max-w-7xl scroll-mt-28 px-6 py-20">
      <SectionHeading eyebrow="Special Offers" title="Active Promotions" subtitle="Exclusive deals for our synchronized members." />

      {promos.length === 0 ? (
        <p className="rounded-2xl bg-skin/60 p-8 text-center text-ink/70">No promotions running right now — check back soon!</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {promos.map((promo) => (
            <Link
              key={promo.id}
              href={`/promos/${promo.id}`}
              className="group relative flex min-h-48 flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-champagne via-coral to-coral-dark p-6 text-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#a8843a]/20"
            >
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/25 px-3 py-1 text-xs font-medium backdrop-blur">
                <Tag className="h-3.5 w-3.5" /> {promo.branchName}
              </span>
              <h3 className="mt-6 font-display text-2xl font-semibold leading-tight">{promo.title}</h3>
              {promo.badge && <span className="mt-1 text-2xl font-bold text-white drop-shadow-sm">{promo.badge}</span>}
              {promo.description && <p className="mt-2 line-clamp-2 text-sm text-white/90">{promo.description}</p>}
              <span className="mt-auto flex items-center justify-between pt-4 text-sm font-semibold">
                <span>
                  {promo.price != null ? `₱${Number(promo.price).toLocaleString()}` : ""}
                  {promo.validUntil && (
                    <span className="ml-2 font-normal text-white/85">
                      until {new Date(`${promo.validUntil}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  View <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
