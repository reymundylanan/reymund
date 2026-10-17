"use client";

import { useMemo, useRef } from "react";
import Image from "next/image";
import { CalendarHeart, Check, MapPin, PartyPopper, Users } from "lucide-react";
import { useBooking } from "@/components/booking/BookingContext";
import { branchContacts, branches as BRANCHES } from "@/lib/data";
import type { SpaPartyPackage } from "@/lib/supabase/queries/spaParty";
import GlowGuide from "@/components/services/GlowGuide";
import { spaPackageFacts, type GuideFacts } from "@/lib/glowGuide";

/** Services → Spa Party: the group packages Admin sets up under Promotions →
 * Spa Packages. Book opens the booking window on the party packages. */
export default function SpaPartySection({ packages }: { packages: SpaPartyPackage[] }) {
  const { open } = useBooking();
  const sectionRef = useRef<HTMLElement>(null);
  // The GlowSync mascot introduces each package, like on the service cards.
  const guideItems = useMemo(() => packages.map((p) => spaPackageFacts(p, packages)), [packages]);
  if (packages.length === 0) return null;
  // Where the parties happen: one branch gets an "Only at …" label with its address.
  const where = [...new Set(packages.flatMap((p) => p.branches))];
  const only = where.length === 1 ? where[0] : null;
  const address = only ? BRANCHES.find((b) => b.name === only)?.address : null;

  function book(p: SpaPartyPackage) {
    // Only one branch has it: skip choosing the branch.
    const only = p.branches.length === 1 ? branchContacts.find((b) => b.name === p.branches[0])?.id : undefined;
    open({ name: `${p.tier} Spa Package`, duration: "3 hrs", price: p.price, category: "Spa Package", group: true, branchId: only });
  }

  const byGuide = (item: GuideFacts) => packages.find((p) => `party:${p.key}` === item.id);

  return (
    <section ref={sectionRef} id="spa-party" className="relative mx-auto max-w-7xl scroll-mt-28 px-6 pb-20">
      <GlowGuide
        containerRef={sectionRef}
        items={guideItems}
        onBook={(item) => {
          const p = byGuide(item);
          if (p) book(p);
        }}
        hoverOnly
        onDetails={(item) => document.querySelector(`[data-guide-id="${CSS.escape(item.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
      />
      {/* Gold outline, like the service category cards. */}
      <div className="relative isolate overflow-hidden rounded-[2rem] border-2 border-coral px-6 py-10 shadow-sm ring-1 ring-champagne/60 ring-offset-2 ring-offset-cream sm:px-10 sm:py-12">
        <Image src="/images/about/about1.jpg" alt="" fill sizes="100vw" className="-z-20 object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#2b1a10]/92 via-[#4a3020]/85 to-[#8a6a1c]/70" />

        <div className="max-w-2xl text-white">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] backdrop-blur">
              <PartyPopper className="h-3.5 w-3.5" /> Spa Party
            </span>
            {only && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-champagne px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#4a3020] shadow">
                <MapPin className="h-3.5 w-3.5" /> Only at {only}
              </span>
            )}
          </div>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight sm:text-4xl">Celebrate together at Blush</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80 sm:text-base">
            Birthdays, bridal showers, barkada days — book the spa for your group, with treatments, the space all to yourselves, and the little extras that make
            it a party.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/85">
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Users className="h-3.5 w-3.5" /> For groups</span>
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><CalendarHeart className="h-3.5 w-3.5" /> Reserve your date</span>
          </div>
          {only && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/20 backdrop-blur">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-champagne text-[#4a3020]"><MapPin className="h-4 w-4" /></span>
              <span className="text-sm">
                <span className="block font-semibold">Hosted exclusively at {only}</span>
                {address && <span className="block text-white/70">{address}</span>}
                <span className="block text-xs text-white/60">Not available at our other branches.</span>
              </span>
            </div>
          )}
        </div>

        <div className={`mt-8 grid gap-5 ${packages.length === 1 ? "max-w-md" : packages.length === 2 ? "md:grid-cols-2 lg:max-w-4xl" : "md:grid-cols-2 lg:grid-cols-3"}`}>
          {packages.map((p, i) => {
            const featured = packages.length > 1 && i === packages.length - 1;
            return (
              <article
                key={p.key}
                data-guide-id={`party:${p.key}`}
                className={`flex flex-col rounded-3xl border-2 bg-white p-6 shadow-xl ring-1 ring-champagne/60 ring-offset-2 ring-offset-[#4a3020] transition duration-300 hover:-translate-y-1 ${featured ? "border-coral" : "border-[#d9b968]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${featured ? "bg-coral text-white" : "bg-[#fbf3dc] text-[#8A6A1C]"}`}>
                    {p.tier}
                  </span>
                  {featured && <span className="text-[11px] font-semibold uppercase tracking-wide text-coral-dark">Most complete</span>}
                </div>
                <p className="mt-4 text-sm text-ink/50">
                  Package price
                  <span className="mt-0.5 block font-display text-4xl font-semibold text-ink">₱{p.price.toLocaleString()}</span>
                </p>
                {p.inclusions.length > 0 && (
                  <ul className="mt-5 space-y-2.5 border-t border-[#f1e4c4] pt-5">
                    {p.inclusions.map((line) => (
                      <li key={line} className="flex items-start gap-2.5 text-sm text-ink/75">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#E6EDE2] text-[#4F6B4A]">
                          <Check className="h-3 w-3" />
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto pt-6">
                  {!only && p.branches.length > 0 && (
                    <p className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-ink/55">
                      <MapPin className="h-3.5 w-3.5 text-coral-dark" />
                      {p.branches.join(" · ")}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => book(p)}
                    className={`w-full rounded-full py-3 text-sm font-semibold transition ${
                      featured ? "bg-coral text-white shadow-[0_10px_24px_-12px_rgba(168,132,58,0.9)] hover:bg-coral-dark" : "border border-coral text-coral-dark hover:bg-coral hover:text-white"
                    }`}
                  >
                    Book this party
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-xs text-white/65">Spa Party packages need full payment to confirm your date.</p>
      </div>
    </section>
  );
}
