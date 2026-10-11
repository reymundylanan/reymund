"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight, Clock, ShieldCheck, Sparkles, Star, Users, Wallet } from "lucide-react";
import { useBooking } from "@/components/booking/BookingContext";
import { branchServiceCategories } from "@/lib/data";
import MenuGalleryModal from "@/components/home/MenuGalleryModal";

export type HeroBranch = { name: string; hours: string | null; open: boolean | null };

export type HeroFacts = {
  branches: HeroBranch[];
  treatments: number;
  specialists: number;
  rating: number | null;
  reviews: number;
  /** Most-offered categories, for the quick links under the hero. */
  categories: string[];
};

const TRUST = [
  { icon: CalendarCheck, text: "Book online any time" },
  { icon: Wallet, text: "Pay with GCash or at the branch" },
  { icon: ShieldCheck, text: "See prices before you book" },
];

export default function Hero({ facts }: { facts: HeroFacts }) {
  const { open } = useBooking();
  const defaultService = branchServiceCategories[0].services[0];
  const [showMenu, setShowMenu] = useState(false);

  return (
    <section className="relative">
      <div className="relative isolate overflow-hidden px-6 pb-24 pt-16 text-white sm:pb-28">
        <video
          src="/images/hero/blushspavid.mp4"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#2b1a10]/75 via-[#4a3020]/50 to-[#a8843a]/30" />

        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1fr_24rem]">
          <div className="flex flex-col items-start gap-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-champagne" aria-hidden />
              Blush Spa &amp; Aesthetics · Pagadian City
            </p>

            <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-6xl">
              Synchronized Care for
              <br />
              <span className="italic text-champagne">Your Natural Glow</span>
            </h1>

            <p className="max-w-xl text-lg leading-relaxed text-white/90">
              Facials, laser, doctor&rsquo;s procedures, slimming, hair and nails — under one roof, with specialists who
              know your history. Choose your treatment, branch and time in a few taps.
            </p>

            <div className="flex flex-wrap gap-4 pt-1">
              <button
                onClick={() => open(defaultService)}
                className="rounded-full bg-coral px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-coral-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Book an Experience
              </button>
              <button
                onClick={() => setShowMenu(true)}
                className="rounded-full border border-white/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                View Menu
              </button>
            </div>

            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-champagne" aria-hidden /> {text}
                </li>
              ))}
            </ul>
          </div>

          <TodayCard facts={facts} />
        </div>
      </div>

      {facts.categories.length > 0 && <CategoryBar categories={facts.categories} />}

      {showMenu && <MenuGalleryModal onClose={() => setShowMenu(false)} />}
    </section>
  );
}

/** "Today at Blush" — live hours, open/closed and real numbers. */
function TodayCard({ facts }: { facts: HeroFacts }) {
  const numbers = [
    { icon: Sparkles, value: facts.treatments ? String(facts.treatments) : null, label: "Treatments" },
    { icon: Users, value: facts.specialists ? String(facts.specialists) : null, label: "Specialists" },
    { icon: Star, value: facts.rating != null ? facts.rating.toFixed(1) : null, label: `${facts.reviews} review${facts.reviews === 1 ? "" : "s"}` },
  ].filter((n) => n.value);

  return (
    <aside className="rounded-3xl border border-white/25 bg-[#2b1a10]/35 p-5 shadow-2xl shadow-black/20 backdrop-blur-md">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-champagne">Today at Blush</p>
      <ul className="mt-3 space-y-2.5">
        {facts.branches.map((b) => (
          <li key={b.name} className="rounded-2xl bg-white/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{b.name}</p>
              {b.open != null && (
                <span
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    b.open ? "bg-emerald-400/20 text-emerald-100" : "bg-white/15 text-white/75"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${b.open ? "bg-emerald-300" : "bg-white/60"}`} aria-hidden />
                  {b.open ? "Open now" : "Closed"}
                </span>
              )}
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/75">
              {b.hours && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden /> {b.hours}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>

      {numbers.length > 0 && (
        <div className="mt-4 grid auto-cols-fr grid-flow-col divide-x divide-white/15 rounded-2xl bg-black/15 py-3 text-center">
          {numbers.map(({ icon: Icon, value, label }) => (
            <div key={label} className="px-1">
              <p className="flex items-center justify-center gap-1 text-xl font-semibold">
                <Icon className="h-4 w-4 text-champagne" aria-hidden /> {value}
              </p>
              <p className="mt-0.5 text-[11px] text-white/70">{label}</p>
            </div>
          ))}
        </div>
      )}

      <Link href="/branches" className="mt-4 block text-center text-sm font-semibold text-champagne hover:underline">
        Directions &amp; contact →
      </Link>
    </aside>
  );
}

/** Category shortcuts under the hero. The bar itself stays solid; only the
 * pills fade at an edge where more are hidden, with arrows to scroll. */
function CategoryBar({ categories }: { categories: string[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const nudge = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  const fade = `linear-gradient(to right, ${edges.left ? "transparent, black 3rem" : "black"}, ${edges.right ? "black calc(100% - 3rem), transparent" : "black"})`;
  const arrow =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-nude bg-white text-coral-dark shadow-sm transition hover:bg-coral hover:text-white";

  return (
    <nav aria-label="Treatment categories" className="relative z-10 mx-auto -mt-7 max-w-7xl px-6">
      <div className="flex items-center gap-2 rounded-2xl border border-nude/70 bg-white p-2.5 shadow-lg shadow-[#a8843a]/10">
        <span className="hidden shrink-0 items-center px-3 text-xs font-semibold uppercase tracking-[0.18em] text-coral-dark sm:flex">
          Explore
        </span>
        {edges.left && (
          <button type="button" onClick={() => nudge(-1)} aria-label="Show earlier categories" className={`hidden sm:flex ${arrow}`}>
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div
          ref={scroller}
          onScroll={measure}
          className="scrollbar-hidden flex min-w-0 flex-1 gap-2 overflow-x-auto"
          style={{ maskImage: fade, WebkitMaskImage: fade }}
        >
          {categories.map((c) => (
            <Link
              key={c}
              href={`/services?category=${encodeURIComponent(c)}`}
              className="shrink-0 rounded-full bg-skin/70 px-4 py-2 text-sm font-medium text-ink/80 transition hover:bg-coral hover:text-white"
            >
              {c}
            </Link>
          ))}
        </div>
        {edges.right && (
          <button type="button" onClick={() => nudge(1)} aria-label="Show more categories" className={`hidden sm:flex ${arrow}`}>
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </nav>
  );
}
