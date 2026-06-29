"use client";

import Image from "next/image";
import { Search, SlidersHorizontal, Star } from "lucide-react";
import { useBooking } from "@/components/booking/BookingContext";
import { branchServiceCategories } from "@/lib/data";

const filters = ["Popular", "Massage", "Facial", "Body"];

export default function Hero() {
  const { open } = useBooking();
  const defaultService = branchServiceCategories[0].services[0];

  return (
    <section className="relative">
      <div className="relative isolate overflow-hidden px-6 pb-28 pt-16 text-white sm:pb-32">
        <Image
          src="/images/hero/salon1.jpg"
          alt=""
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#1f2a20]/65 via-[#2c3a2a]/55 to-[#3a2a22]/50" />
        <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium backdrop-blur">
            <Star className="h-3.5 w-3.5 fill-gold text-gold" />
            Ranked #1 Wellness Spa in Pagadian
          </span>

          <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
            Synchronized Care for
            <br />
            <span className="italic text-rose">Your Natural Glow</span>
          </h1>

          <p className="max-w-xl text-white/80">
            Discover a sanctuary where expert therapy meets aesthetic
            perfection. Your journey to radiance starts with a single click.
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
            <button
              onClick={() => open(defaultService)}
              className="rounded-full bg-coral px-6 py-3 text-sm font-semibold text-white transition hover:bg-coral-dark"
            >
              Book an Experience
            </button>
            <button className="rounded-full border border-white/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              View Menu
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-16 max-w-5xl px-6">
        <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-xl shadow-black/10 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-ink/10 px-4 py-2.5">
            <Search className="h-4 w-4 text-ink/40" />
            <input
              type="text"
              placeholder="Search services (e.g. Massage, Facial)..."
              className="w-full text-sm outline-none placeholder:text-ink/40"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink/70 transition hover:border-coral hover:text-coral-dark"
              >
                {filter}
              </button>
            ))}
            <button className="flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-95">
              <SlidersHorizontal className="h-4 w-4" />
              Find Best Match
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
