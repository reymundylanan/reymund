"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CalendarPlus, Star } from "lucide-react";
import GlowMascot from "@/components/GlowMascot";
import { GUIDE_FONTS, TypeText } from "@/components/guide/guideKit";
import { useBooking } from "@/components/booking/BookingContext";
import { branchContacts } from "@/lib/data";
import { staffFacts } from "@/lib/staffGuide";
import type { PublicStaff } from "@/lib/supabase/queries/staffProfiles";

const PANEL_W = 460;

/** Meet the Team: tap a team member and GlowSync AI introduces them — why
 * clients choose them, what they do — with Book and View Profile. */
export default function TeamGrid({ staff, categories }: { staff: PublicStaff[]; categories: Record<string, string[]> }) {
  const { open } = useBooking();
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number; width: number } | null>(null);
  const [reply, setReply] = useState(0); // bumps to replay the mascot's hello

  const active = staff.find((s) => s.id === activeId) ?? null;

  // Place the introduction right under the tapped card, inside the grid.
  const place = useCallback(() => {
    const grid = gridRef.current;
    if (!grid || !activeId) return setPos(null);
    const card = grid.querySelector<HTMLElement>(`[data-staff-id="${activeId}"]`);
    if (!card) return setPos(null);
    const g = grid.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const width = Math.min(PANEL_W, g.width);
    const centre = c.left - g.left + c.width / 2;
    const left = Math.max(0, Math.min(centre - width / 2, g.width - width));
    setPos({ left, top: c.bottom - g.top + 10, arrow: centre - left, width });
  }, [activeId]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", place);
    };
  }, [place]);

  // Tap outside or press Escape to close.
  useEffect(() => {
    if (!activeId) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (panelRef.current?.contains(t) || t.closest("[data-staff-id]")) return;
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

  function choose(id: string) {
    setActiveId((cur) => (cur === id ? null : id));
    setReply((n) => n + 1);
  }

  const cats = active ? categories[`${active.branchName}|${active.department}`] ?? [] : [];
  const facts = active ? staffFacts({ ...active, quote: active.quote ?? null, categories: cats }) : null;

  function book() {
    if (!active) return;
    const branchId = branchContacts.find((b) => b.name === active.branchName)?.id;
    open({ name: "", duration: "", price: 0, preselect: true, category: cats[0] ?? null, branchId, staffId: active.id });
    setActiveId(null);
  }

  return (
    <div ref={gridRef} className="relative">
      <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
        {staff.map((m) => (
          <button
            key={m.id}
            type="button"
            data-staff-id={m.id}
            onClick={() => choose(m.id)}
            aria-expanded={activeId === m.id}
            className={`group flex flex-col items-center gap-2 rounded-3xl p-2 text-center transition ${
              activeId === m.id ? "bg-white shadow-[0_0_0_2px_#d9b968,0_14px_30px_-18px_rgba(168,132,58,0.6)]" : "hover:bg-white/60"
            }`}
          >
            <span className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-blush text-2xl font-bold text-coral-dark transition group-hover:scale-105">
              {m.avatarUrl ? <Image src={m.avatarUrl} alt={m.fullName} fill sizes="80px" className="object-cover" /> : m.fullName.charAt(0).toUpperCase()}
            </span>
            <span className="font-medium text-ink group-hover:text-coral-dark">{m.fullName}</span>
            <span className="text-sm text-ink/50">
              {m.department}
              {m.branchName && <> · {m.branchName}</>}
            </span>
            <span className="flex items-center gap-1 text-xs text-ink/60">
              {m.count > 0 ? (
                <>
                  <Star className="h-3.5 w-3.5 fill-gold text-gold" /> {m.average} · {m.count} review{m.count === 1 ? "" : "s"}
                </>
              ) : (
                "No reviews yet"
              )}
            </span>
          </button>
        ))}
      </div>

      {active && facts && pos && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`GlowSync AI introduces ${active.fullName}`}
          className={`absolute z-30 ${GUIDE_FONTS}`}
          style={{ left: pos.left, top: pos.top, width: pos.width }}
        >
          {/* Little pointer up to the tapped card */}
          <span aria-hidden className="absolute -top-1.5 h-4 w-4 rotate-45 rounded-sm bg-[#f6dc8e]" style={{ left: pos.arrow - 8 }} />
          <div key={`${active.id}-${reply}`} className="guide-bubble glowy-pop">
            <div className="guide-bubble-inner flex gap-3 p-4">
              <div className="relative shrink-0 self-end">
                <span className="glowy-bob block drop-shadow-[0_10px_12px_rgba(120,90,30,0.28)]">
                  <GlowMascot size={128} full pose="present" face="excited" alive blink />
                </span>
                <span aria-hidden className="guide-emote absolute -top-2 right-0 flex h-8 min-w-8 items-center justify-center rounded-full border border-[#d9b968] bg-white px-1.5 text-base leading-none shadow-md">
                  ✨
                </span>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="guide-rise flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a97c1c]">
                  <span aria-hidden className="guide-live-dot" />
                  GlowSync AI · Meet the team
                </p>
                <p className="guide-rise guide-display guide-title text-[19px] leading-tight">{facts.hook}</p>
                <p className="guide-rise text-[14px] font-semibold leading-relaxed text-ink/85">
                  <TypeText key={`${active.id}-${reply}`} text={`${facts.intro} ${facts.specialties}`} />
                </p>
                <p className="guide-rise rounded-2xl bg-[#fff6e6] px-3 py-2 text-[13px] leading-snug text-ink/75 ring-1 ring-[#f1dfb6]">
                  <span className="guide-display font-semibold text-[#a97c1c]">Why choose {active.fullName}?</span> {facts.why}
                </p>
                {facts.quote && <p className="guide-rise text-[12.5px] italic leading-snug text-ink/60">{facts.quote}</p>}
                <div className="guide-rise grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={book}
                    className="flex items-center justify-center gap-1 rounded-full bg-gradient-to-br from-[#e9bc4c] to-[#c58d1d] px-3 py-1.5 text-xs font-extrabold text-white shadow-[0_8px_16px_-8px_rgba(169,124,28,0.8)] transition hover:-translate-y-0.5 hover:brightness-105"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" /> Book with {active.fullName.replace(/^Ms\.?\s+|^Mr\.?\s+/i, "")}
                  </button>
                  <Link
                    href={`/team/${active.id}`}
                    className="flex items-center justify-center rounded-full border-[1.5px] border-[#d9b968] bg-white px-3 py-1.5 text-xs font-extrabold text-ink/80 transition hover:-translate-y-0.5"
                  >
                    View Profile
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
