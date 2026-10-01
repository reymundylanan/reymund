import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarClock, Tag } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import { createClient } from "@/lib/supabase/server";
import { getActivePromotions } from "@/lib/supabase/queries/publicContent";
import { promoImage } from "@/lib/promoImage";

/** Home → Active Promotions: the real promotions Admin creates per branch,
 * each with a photo matching its service type. */
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
              className="group relative isolate flex min-h-64 flex-col overflow-hidden rounded-3xl p-6 text-white border-2 border-coral shadow-sm ring-1 ring-champagne/60 ring-offset-2 ring-offset-cream transition duration-300 hover:-translate-y-1 hover:border-coral-dark hover:shadow-xl hover:shadow-[#a8843a]/20"
            >
              <Image
                src={promoImage(promo)}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="-z-20 object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {/* Warm shade so the text is always readable over the photo. */}
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#2b1a10]/90 via-[#4a3020]/55 to-[#a8843a]/25" />

              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur">
                  <Tag className="h-3.5 w-3.5" /> {promo.branchName}
                </span>
                {promo.badge && <span className="rounded-full bg-coral px-3 py-1 text-xs font-bold shadow-sm">{promo.badge}</span>}
              </div>

              <div className="mt-auto pt-10">
                <h3 className="font-sans text-xl font-semibold leading-snug tracking-tight">{promo.title}</h3>
                {promo.description && <p className="mt-1.5 line-clamp-2 text-sm text-white/85">{promo.description}</p>}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/20 pt-3 text-sm">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {promo.price != null && <span className="text-lg font-bold">₱{Number(promo.price).toLocaleString()}</span>}
                    {promo.validUntil && (
                      <span className="flex items-center gap-1 text-xs text-white/80">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Until {new Date(`${promo.validUntil}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold backdrop-blur transition group-hover:bg-coral">
                    View <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
