"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Camera, ChevronLeft, Clock, Search, Star } from "lucide-react";
import PhotoLightbox from "@/components/reviews/PhotoLightbox";
import type { ServiceReviewSummary } from "@/lib/supabase/queries/serviceReviews";
import { useBooking } from "@/components/booking/BookingContext";
import SectionHeading from "@/components/SectionHeading";
import GlowGuide from "@/components/services/GlowGuide";
import { categoryFacts, serviceFacts, type GuideFacts, type GuidePromo, type GuideService } from "@/lib/glowGuide";

export type DbService = {
  id: string;
  name: string;
  category: string;
  department: string;
  duration: string | null;
  price: number;
  price_41: number | null;
  description: string | null;
  benefits?: string | null;
  image_url?: string | null;
  hair_options?: { type?: string; subType?: string | null; prices?: { short: string; medium: string; long: string } } | null;
  brows_type?: string | null;
  body_wellness_type?: string | null;
  facial_options?: { isPremium?: boolean; hasAddons?: boolean } | null;
  laser_type?: string | null;
  slimming_type?: string | null;
  non_surgical_type?: string | null;
  doctor_type?: string | null;
};

function toGuideService(s: DbService): GuideService {
  const p = s.hair_options?.prices;
  const num = (v: string | undefined) => {
    const n = Number(String(v ?? "").replace(/[₱,s]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    duration: s.duration,
    price: s.price ?? 0,
    price_41: s.price_41,
    description: s.description,
    benefits: s.benefits ?? null,
    hairPrices: p ? { short: num(p.short), medium: num(p.medium), long: num(p.long) } : null,
  };
}

function getServiceType(svc: DbService): string | null {
  if (svc.hair_options?.type) {
    const parts = [svc.hair_options.type, svc.hair_options.subType].filter(Boolean);
    return parts.join(" · ");
  }
  if (svc.brows_type) return svc.brows_type;
  if (svc.body_wellness_type) return svc.body_wellness_type;
  if (svc.laser_type) return svc.laser_type;
  if (svc.slimming_type) return svc.slimming_type;
  if (svc.non_surgical_type) return svc.non_surgical_type;
  if (svc.doctor_type) return svc.doctor_type;
  if (svc.facial_options?.isPremium) return "Premium Facial Treatment";
  if (svc.facial_options?.hasAddons) return "Add On";
  return null;
}

const CATEGORY_META: Record<string, { image: string; description: string }> = {
  "Facial Services":          { image: "/images/services/facial.jpeg",                   description: "Expert facials and advanced skin treatments for every concern — from deep cleansing and brightening to collagen repair and rejuvenation." },
  "Hair Services":            { image: "/images/services/hair.jpeg",                     description: "Professional hair treatments tailored for every hair type — from color and straightening to deep conditioning and restoration." },
  "Nail Care":                { image: "/images/services/nail.jpeg",                     description: "Precision nail artistry and care — from classic manicures and pedicures to intricate nail art and long-lasting gel treatments." },
  "Body & Wellness":          { image: "/images/services/body&wellness.jpeg",            description: "Relax, restore, and recharge. Our wellness menu covers therapeutic massage, body waxing, and intimate skin treatments." },
  "Cocktail Drips":           { image: "/images/services/cocktaildrips.jpeg",            description: "Intravenous wellness and beauty drips — from whitening and anti-aging to slimming and hydration." },
  "Doctor's Procedure":       { image: "/images/services/doctorspro.jpeg",               description: "Medical-grade aesthetic procedures performed by our licensed doctor. Fillers, Botox, threads, PRP, and advanced programs." },
  "Laser Services":           { image: "/images/services/laser.jpeg",                    description: "Precision laser solutions for hair removal, skin brightening, and deep pore cleansing. Safe and tailored to your skin type." },
  "Slimming Services":        { image: "/images/services/slimming.jpeg",                 description: "Non-invasive body shaping and skin tightening using the latest HIFU, RF, and energy-based technologies." },
  "Non-Surgical Liposuction": { image: "/images/services/non-surgical-liposuction.jpeg", description: "Advanced non-surgical fat reduction treatments that contour and slim without the risks of surgery." },
  "Premium Treatments":       { image: "/images/services/premium.jpeg",                  description: "Exclusive signature treatments combining the best of science and luxury for transformative results." },
  "Brows & Lashes":           { image: "/images/services/brows&lashes.jpeg",             description: "Frame your face with perfectly shaped brows and luscious lashes — extensions, tints, lifts, and semi-permanent tattoos." },
};

const FALLBACK = { image: "/images/hero/clinic.jpeg", description: "Explore our curated selection of professional treatments." };

export default function ServiceCatalog({
  services,
  ratings = {},
  photos = {},
  promos = [],
}: {
  services: DbService[];
  ratings?: Record<string, ServiceReviewSummary>;
  promos?: GuidePromo[];
  /** Clients' review photos per service id (newest first). */
  photos?: Record<string, string[]>;
}) {
  const { open } = useBooking();
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);
  const router = useRouter();
  const sectionRef = useRef<HTMLElement>(null);
  const searchParams = useSearchParams();
  const [selectedCategory, setSelectedCategoryState] = useState<string | null>(() => searchParams.get("category"));
  function setSelectedCategory(name: string | null) {
    setSelectedCategoryState(name);
    const params = new URLSearchParams(window.location.search);
    if (name) params.set("category", name);
    else params.delete("category");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const map = new Map<string, { count: number; ratingSum: number; reviews: number }>();
    for (const s of services) {
      const cur = map.get(s.category) ?? { count: 0, ratingSum: 0, reviews: 0 };
      const r = ratings[s.id];
      map.set(s.category, {
        count: cur.count + 1,
        ratingSum: cur.ratingSum + (r ? r.average * r.count : 0),
        reviews: cur.reviews + (r?.count ?? 0),
      });
    }
    return Array.from(map.entries()).map(([name, v]) => ({
      name,
      count: v.count,
      reviews: v.reviews,
      average: v.reviews ? Math.round((v.ratingSum / v.reviews) * 10) / 10 : null,
    }));
  }, [services, ratings]);

  const filteredServices = useMemo(() => {
    if (!selectedCategory) return [];
    return services.filter(
      (s) =>
        s.category === selectedCategory &&
        (!query.trim() || s.name.toLowerCase().includes(query.toLowerCase()))
    );
  }, [services, selectedCategory, query]);

  const grouped = useMemo(
    () =>
      Array.from(
        filteredServices.reduce((map, svc) => {
          const type = getServiceType(svc) ?? "General";
          if (!map.has(type)) map.set(type, []);
          map.get(type)!.push(svc);
          return map;
        }, new Map<string, DbService[]>())
      ),
    [filteredServices]
  );

  // What the GlowSync guide says about each card, in on-screen order.
  const guideItems = useMemo<GuideFacts[]>(() => {
    const rating = (r?: ServiceReviewSummary) => (r ? { average: r.average, count: r.count } : null);
    if (!selectedCategory) {
      return categories.map((c) =>
        categoryFacts(
          c.name,
          services.filter((s) => s.category === c.name).map(toGuideService),
          promos,
          c.average !== null ? { average: c.average, count: c.reviews } : null,
          (CATEGORY_META[c.name] ?? FALLBACK).description
        )
      );
    }
    const siblings = services.filter((s) => s.category === selectedCategory).map(toGuideService);
    const blurb = (CATEGORY_META[selectedCategory] ?? FALLBACK).description;
    return grouped.flatMap(([, group]) => group.map((s) => serviceFacts(toGuideService(s), siblings, promos, rating(ratings[s.id]), blurb)));
  }, [selectedCategory, categories, services, promos, ratings, grouped]);

  function guideBook(item: GuideFacts) {
    if (item.kind === "category") {
      open({ name: "", duration: "", price: 0, category: item.category });
      return;
    }
    const svc = services.find((s) => s.id === item.id);
    if (svc) open({ name: svc.name, duration: svc.duration ?? "", price: svc.price ?? 0, preselect: true, category: svc.category });
  }

  function guideDetails(item: GuideFacts) {
    if (item.kind === "category") {
      setSelectedCategory(item.category);
      setQuery("");
    } else {
      router.push(`/services/${item.id}`);
    }
  }

  const guide = guideItems.length > 0 && (
    <GlowGuide containerRef={sectionRef} items={guideItems} onBook={guideBook} onDetails={guideDetails} />
  );

  // Category grid view
  if (!selectedCategory) {
    return (
      <section ref={sectionRef} id="catalog" className="relative mx-auto max-w-7xl scroll-mt-28 px-6 py-16">
        <SectionHeading
          eyebrow="Our Menu"
          title="Explore our services"
          subtitle="Choose a category to see every treatment, price and duration — then book in a few taps."
        />
        {guide}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map(({ name, count, reviews, average }) => {
            const meta = CATEGORY_META[name] ?? FALLBACK;
            return (
              <button
                key={name}
                data-guide-id={`category:${name}`}
                onClick={() => { setSelectedCategory(name); setQuery(""); }}
                className="group relative flex h-72 flex-col justify-end overflow-hidden rounded-3xl border-2 border-coral text-left shadow-sm ring-1 ring-champagne/60 ring-offset-2 ring-offset-cream transition duration-300 hover:-translate-y-1 hover:border-coral-dark hover:shadow-xl hover:shadow-[#a8843a]/15"
              >
                <Image
                  src={meta.image}
                  alt={name}
                  fill
                  className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#2b1a10]/90 via-[#3d2818]/45 to-transparent" />
                <div className="relative p-5">
                  <p className="text-xl font-semibold tracking-tight text-white">{name}</p>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-white/80">{meta.description}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                        {count} service{count !== 1 ? "s" : ""}
                      </span>
                      {average !== null && (
                        <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                          <Star className="h-3 w-3 fill-champagne text-champagne" /> {average.toFixed(1)} · {reviews} review{reviews !== 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors group-hover:bg-coral">
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // Services list view
  return (
    <section ref={sectionRef} id="catalog" className="relative mx-auto max-w-7xl scroll-mt-28 px-6 py-16">
      <button
        onClick={() => setSelectedCategory(null)}
        className="mb-6 flex items-center gap-2 text-base font-semibold text-ink/70 hover:text-coral-dark"
      >
        <ChevronLeft className="h-4 w-4" /> Back to all services
      </button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-coral-dark">Our Menu</p>
          <h2 className="mt-1 text-3xl font-semibold text-ink">{selectedCategory}</h2>
          <p className="mt-1 text-sm text-ink/50">Found {filteredServices.length} treatment{filteredServices.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2.5 sm:max-w-xs">
          <Search className="h-4 w-4 shrink-0 text-ink/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${selectedCategory}...`}
            className="w-full text-sm outline-none placeholder:text-ink/40"
          />
        </div>
      </div>

      {guide}

      {filteredServices.length > 0 ? (
        <div className="space-y-10">
          {grouped.map(([type, group]) => (
            <div key={type}>
              <h4 className="mb-4 flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.2em] text-coral-dark">{type}<span className="h-px flex-1 bg-nude" aria-hidden /></h4>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((svc) => (
            <div key={svc.id} data-guide-id={svc.id} className="group flex flex-col overflow-hidden rounded-3xl border border-nude/70 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#a8843a]/10">
              {/* Each card shows its category's photo; clients' own photos are in the strip below. */}
              <div className="relative h-32 overflow-hidden">
                <Image
                  src={(CATEGORY_META[svc.category] ?? FALLBACK).image}
                  alt=""
                  fill
                  className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/70 via-transparent to-transparent" />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div>
                  <h3 className="text-xl font-semibold tracking-tight text-ink">
                    <Link href={`/services/${svc.id}`} className="hover:text-coral-dark">{svc.name}</Link>
                  </h3>
                  {ratings[svc.id] ? (
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-gold">
                      <span aria-hidden>{"★".repeat(Math.round(ratings[svc.id].average))}</span>
                      <span className="font-semibold">{ratings[svc.id].average.toFixed(1)}</span>
                      <span className="text-ink/50">
                        ({ratings[svc.id].count} review{ratings[svc.id].count !== 1 ? "s" : ""})
                      </span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-ink/40">No reviews yet</p>
                  )}
                </div>
                {ratings[svc.id]?.latest && (
                  <figure className="rounded-2xl bg-cream p-3">
                    <blockquote className="line-clamp-3 text-sm italic leading-relaxed text-ink/75">&ldquo;{ratings[svc.id].latest!.text}&rdquo;</blockquote>
                    <figcaption className="mt-1.5 flex items-center justify-between gap-2 text-xs text-ink/55">
                      <span>
                        — {ratings[svc.id].latest!.reviewer} · <span className="text-gold">{"★".repeat(ratings[svc.id].latest!.rating)}</span>
                      </span>
                      <Link href={`/services/${svc.id}#reviews`} className="shrink-0 font-semibold text-coral-dark hover:underline">
                        Read all reviews →
                      </Link>
                    </figcaption>
                  </figure>
                )}
                {photos[svc.id] && photos[svc.id].length > 0 && (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-ink/55">
                      <Camera className="h-3.5 w-3.5" /> Photos from clients
                    </p>
                    <div className="flex gap-1.5">
                      {photos[svc.id].slice(0, 4).map((url, i) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setLightbox({ photos: photos[svc.id], index: i })}
                          aria-label={`Open client photo ${i + 1} of ${svc.name}`}
                          className="relative h-14 w-14 overflow-hidden rounded-xl bg-blush ring-1 ring-nude/70 transition hover:ring-coral"
                        >
                          <Image src={url} alt="" fill sizes="56px" unoptimized className="object-cover" />
                          {i === 3 && photos[svc.id].length > 4 && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-bold text-white">
                              +{photos[svc.id].length - 4}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {(svc.description || svc.benefits) && (
                  <p className="line-clamp-2 text-base text-ink/60">
                    {svc.description || svc.benefits}
                  </p>
                )}
                {svc.duration && (
                  <div className="flex items-center gap-1 text-sm text-ink/50">
                    <Clock className="h-4 w-4" />{svc.duration}
                  </div>
                )}
                <div className="mt-auto border-t border-ink/10 pt-3">
                  {svc.hair_options?.prices ? (
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 text-sm text-ink/60">
                        {(["short", "medium", "long"] as const).map((size) => {
                          const raw = svc.hair_options!.prices![size];
                          const val = Number(String(raw).replace(/,/g, ""));
                          return (
                            <p key={size} className="capitalize">
                              {size} — <span className="font-semibold text-gold">₱{isNaN(val) ? "—" : val.toLocaleString()}</span>
                            </p>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => open({ name: svc.name, duration: svc.duration ?? "", price: svc.price ?? 0, preselect: true, category: svc.category })}
                        className="shrink-0 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
                      >
                        Book Now
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-base">
                      <div>
                        <span className="text-2xl font-bold text-gold">₱{(svc.price ?? 0).toLocaleString()}</span>
                        {svc.price_41 && (
                          <p className="text-base text-ink/50">Package <span className="font-semibold text-gold">₱{svc.price_41.toLocaleString()}</span></p>
                        )}
                      </div>
                      <button
                        onClick={() => open({ name: svc.name, duration: svc.duration ?? "", price: svc.price ?? 0, preselect: true, category: svc.category })}
                        className="rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
                      >
                        Book Now
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-10 text-center text-ink/50">No treatments match your search.</p>
      )}
      {lightbox && (
        <PhotoLightbox photos={lightbox.photos.map((url) => ({ url }))} startIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </section>
  );
}
