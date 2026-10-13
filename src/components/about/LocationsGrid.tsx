"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CalendarPlus, Clock, MapPin, Sparkles, Star } from "lucide-react";
import { GUIDE_FONTS, useGuideTravel, MASCOT_DESKTOP, TypeText, useMascotSize } from "@/components/guide/guideKit";
import { PlayfulMascot } from "@/components/guide/MascotPlay";
import { useBooking } from "@/components/booking/BookingContext";
import type { BranchPitch, BranchStats } from "@/lib/branchGuide";

export type LocationCard = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  image: string;
  href: string;
  /** branchContacts id, for booking at this branch. */
  bookingBranchId: string | null;
  stats: BranchStats;
  pitch: BranchPitch;
};

const PANEL_W = 620;

/** The branches, each introduced by GlowSync AI on hover (or tap): what it's
 * known for, live numbers, and Book here / View branch. */
export default function LocationsGrid({ locations }: { locations: LocationCard[] }) {
  const { open } = useBooking();
  const mascotSize = useMascotSize();
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number; width: number } | null>(null);
  const [reply, setReply] = useState(0);
  const active = locations.find((l) => l.id === activeId) ?? null;

  // The introduction sits just under the chosen card.
  const { moving, note: notePos } = useGuideTravel();
  const place = useCallback(() => {
    const grid = gridRef.current;
    if (!grid || !activeId) return notePos(null), setPos(null);
    const card = grid.querySelector<HTMLElement>(`[data-branch-id="${activeId}"]`);
    if (!card) return setPos(null);
    const g = grid.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const width = Math.min(mascotSize === MASCOT_DESKTOP ? PANEL_W : 460, g.width);
    const centre = c.left - g.left + c.width / 2;
    const left = Math.max(0, Math.min(centre - width / 2, g.width - width));
    // Over the lower part of the photo, so it stays close to the card.
    const next = { left, top: c.top - g.top + Math.min(200, c.height * 0.45), arrow: centre - left, width };
    notePos(next);
    setPos(next);
  }, [activeId, mascotSize, notePos]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", place);
    };
  }, [place]);

  useEffect(() => {
    if (!activeId) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (panelRef.current?.contains(t) || t.closest("[data-branch-id]")) return;
      setActiveId(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActiveId(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [activeId]);

  // Hover with a mouse (short delays so it never flickers); tap on phones.
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const lastPointer = useRef("");
  const draggingMascot = useRef(false);
  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    []
  );
  const keepOpen = () => window.clearTimeout(closeTimer.current);
  const closeSoon = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || draggingMascot.current) return;
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setActiveId(null), 450);
  };
  const hoverCard = (e: React.PointerEvent, id: string) => {
    lastPointer.current = e.pointerType;
    if (e.pointerType !== "mouse") return;
    keepOpen();
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => {
      setActiveId((cur) => {
        if (cur !== id) setReply((n) => n + 1);
        return id;
      });
    }, activeId ? 120 : 260);
  };

  function book() {
    if (!active) return;
    open({ name: "", duration: "", price: 0, preselect: true, category: null, branchId: active.bookingBranchId ?? undefined });
    setActiveId(null);
  }

  return (
    <div ref={gridRef} className="relative mt-10">
      <div className="grid gap-6 sm:grid-cols-2">
        {locations.map((loc) => {
          const on = activeId === loc.id;
          return (
            <button
              key={loc.id}
              type="button"
              data-branch-id={loc.id}
              onPointerEnter={(e) => hoverCard(e, loc.id)}
              onPointerLeave={closeSoon}
              onPointerDown={(e) => (lastPointer.current = e.pointerType)}
              onClick={() => {
                if (lastPointer.current === "mouse") {
                  window.clearTimeout(openTimer.current);
                  if (!on) {
                    setActiveId(loc.id);
                    setReply((n) => n + 1);
                  }
                  return;
                }
                setActiveId((cur) => (cur === loc.id ? null : loc.id));
                setReply((n) => n + 1);
              }}
              aria-expanded={on}
              aria-label={`${loc.name} — GlowSync AI introduces it`}
              className={`group overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:shadow-lg ${
                on ? "border-[#d9b968] shadow-[0_0_0_2px_#d9b968,0_18px_40px_-24px_rgba(168,132,58,0.7)]" : "border-ink/10"
              }`}
            >
              <div className="relative h-56 overflow-hidden bg-gradient-to-br from-rose to-coral-dark">
                <Image
                  src={loc.image}
                  alt={loc.name}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#2b1a10]/45 to-transparent" />
                <span className="absolute left-4 top-4 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-ink shadow-sm">Open Daily</span>
                <span className="absolute bottom-3 left-4 flex flex-wrap gap-1.5">
                  {loc.stats.rating && (
                    <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-ink shadow-sm">
                      <Star className="h-3.5 w-3.5 fill-gold text-gold" /> {loc.stats.rating.toFixed(1)}
                    </span>
                  )}
                  {loc.stats.services > 0 && (
                    <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-ink shadow-sm">{loc.stats.services} services</span>
                  )}
                </span>
                <span className="absolute bottom-3 right-4 flex items-center gap-1 rounded-full bg-[#2b1a10]/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                  <Sparkles className="h-3 w-3" /> {on ? "GlowSync AI is here" : "Meet this branch"}
                </span>
              </div>
              <div className="p-5">
                <p className="flex items-center gap-1 text-xs font-medium text-coral-dark">
                  <MapPin className="h-3.5 w-3.5" />
                  {loc.subtitle}
                </p>
                <h3 className="mt-2 font-semibold text-ink">{loc.name}</h3>
                <p className="mt-2 text-sm text-ink/60">{loc.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {active && pos && (
        <div
          ref={panelRef}
          onPointerEnter={keepOpen}
          onPointerLeave={closeSoon}
          role="dialog"
          aria-label={`GlowSync AI introduces ${active.name}`}
          className={`guide-fly absolute left-0 top-0 z-30 ${GUIDE_FONTS}`}
          style={{ transform: `translate(${pos.left}px, ${pos.top}px)`, width: pos.width }}
        >
          <span aria-hidden className="absolute -top-1.5 h-4 w-4 rotate-45 rounded-sm bg-[#f6dc8e] transition-[left] duration-700 ease-out" style={{ left: pos.arrow - 8 }} />
          <div className="guide-bubble glowy-pop">
            <div className="guide-bubble-inner flex gap-3 p-4">
              <div className={`relative shrink-0 self-end ${moving ? "guide-moving" : ""}`}>
                <PlayfulMascot
                  size={mascotSize}
                  pose="present"
                  label="Play with GlowSync AI"
                  onDragging={(d) => {
                    draggingMascot.current = d;
                    keepOpen();
                  }}
                />
              </div>
              <div className={`min-w-0 flex-1 space-y-2 transition-opacity duration-300 ${moving ? "opacity-0" : "opacity-100"}`}>
                <p className="guide-rise flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a97c1c]">
                  <span aria-hidden className="guide-live-dot" />
                  GlowSync AI · Our branches
                </p>
                <p className="guide-rise guide-display guide-title text-[19px] leading-tight">{active.pitch.hook}</p>
                <p className="guide-rise text-[14px] font-semibold leading-relaxed text-ink/85">
                  <TypeText key={`${active.id}-${reply}-${moving ? 1 : 0}`} text={active.pitch.intro} />
                </p>
                <p className="guide-rise rounded-2xl bg-[#fff6e6] px-3 py-2 text-[13px] leading-snug text-ink/75 ring-1 ring-[#f1dfb6]">
                  <span className="guide-display font-semibold text-[#a97c1c]">Why visit?</span> {active.pitch.why}
                </p>
                <p className="guide-rise flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink/60">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-[#a97c1c]" /> {active.stats.hours ? `Open daily · ${active.stats.hours}` : "Open daily"}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-[#a97c1c]" /> {active.subtitle}
                  </span>
                </p>
                <div className="guide-rise grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={book}
                    className="flex items-center justify-center gap-1 rounded-full bg-gradient-to-br from-[#e9bc4c] to-[#c58d1d] px-3 py-1.5 text-xs font-extrabold text-white shadow-[0_8px_16px_-8px_rgba(169,124,28,0.8)] transition hover:-translate-y-0.5 hover:brightness-105"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" /> Book here
                  </button>
                  <Link
                    href={active.href}
                    className="flex items-center justify-center rounded-full border-[1.5px] border-[#d9b968] bg-white px-3 py-1.5 text-xs font-extrabold text-ink/80 transition hover:-translate-y-0.5"
                  >
                    View branch
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
