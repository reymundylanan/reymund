"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { CalendarHeart, Sparkles } from "lucide-react";
import { useBooking } from "@/components/booking/BookingContext";
import { branchServiceCategories } from "@/lib/data";

export default function ServicesHero() {
  const { open } = useBooking();
  // The category the client is browsing below (set by the catalog).
  const category = useSearchParams().get("category");
  return (
    <section className="relative isolate flex min-h-[30rem] items-center overflow-hidden px-6 py-24 text-white">
      <Image src="/images/services/services.png" alt="" fill priority className="-z-20 object-cover object-[center_30%]" />
      {/* Warm shade, strongest behind the text, plus a fade into the page. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#2b1a10]/80 via-[#3d2818]/55 to-[#a8843a]/15" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-cream to-transparent" />

      <div className="mx-auto w-full max-w-7xl">
        <div className="max-w-xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-champagne" /> Our Services
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-6xl">
            Indulge in <span className="italic text-champagne">Absolute Serenity</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/90">
            Rejuvenate your mind, body, and soul with our curated selection of luxury spa treatments — from ancient healing
            techniques to modern skin science.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                category
                  ? open({ name: "", duration: "", price: 0, preselect: true, category })
                  : open(branchServiceCategories[0].services[0])
              }
              className="inline-flex items-center gap-2 rounded-full bg-coral px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-coral-dark"
            >
              <CalendarHeart className="h-4 w-4" /> {category ? `Book ${category}` : "Book a Treatment"}
            </button>
            <a
              href="#catalog"
              className="rounded-full border border-white/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Browse Services
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
