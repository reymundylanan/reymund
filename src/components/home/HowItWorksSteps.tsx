"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, CalendarPlus, CreditCard, MapPin, Sparkles } from "lucide-react";
import { GUIDE_FONTS, MASCOT_DESKTOP, TypeText, useMascotSize } from "@/components/guide/guideKit";
import { PlayfulMascot } from "@/components/guide/MascotPlay";
import { useBooking } from "@/components/booking/BookingContext";
import { branchServiceCategories } from "@/lib/data";

type Step = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text: string;
  /** What GlowSync AI says when this step is pointed at. */
  hook: string;
  explain: string;
  tip: string;
  action: { label: string; href: string } | "book";
};

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Pick a treatment",
    text: "Browse the menu with prices, durations and real client reviews.",
    hook: "First, let's find your treatment!",
    explain: "Open the menu and tap any treatment to see its price, how long it takes, what it helps with and what other clients said about it.",
    tip: "Not sure yet? Ask me in the chat — tell me your concern and I'll suggest a few.",
    action: { label: "Browse services", href: "/services" },
  },
  {
    icon: MapPin,
    title: "Choose branch & specialist",
    text: "Book at the branch near you, with a specialist you like — or any available.",
    hook: "Where and with whom?",
    explain: "Pick the branch that's easiest for you, then choose a specialist. Each one shows their reviews, so you can book someone clients love.",
    tip: "No favourite yet? Choose “Any staff” and you'll get whoever is free at your time.",
    action: { label: "Meet the team", href: "/#team" },
  },
  {
    icon: CalendarClock,
    title: "Choose your time",
    text: "Only open time slots are shown — no back-and-forth messages.",
    hook: "Now, pick a time that suits you.",
    explain: "The calendar only shows times your specialist is really free, so there's no waiting for a reply. Your booking then appears in My Glow.",
    tip: "You can add more than one treatment to the same visit.",
    action: "book",
  },
  {
    icon: CreditCard,
    title: "Pay your way",
    text: "Pay ahead with GCash, or at the branch on the day of your visit.",
    hook: "Last step — paying is easy.",
    explain: "Pay ahead by GCash: the number and amount are shown at checkout, then you upload your receipt. Or simply pay at the branch on the day of your visit.",
    tip: "After your visit, review it to earn GlowPoints you can trade for vouchers in My Glow.",
    action: "book",
  },
];

const PANEL_W = 560;

/** How It Works: point at (or tap) a step and GlowSync AI explains it, like Meet the Team. */
export default function HowItWorksSteps() {
  const { open } = useBooking();
  const mascotSize = useMascotSize();
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrow: number; width: number } | null>(null);
  const [reply, setReply] = useState(0);

  const place = useCallback(() => {
    const grid = gridRef.current;
    if (!grid || active == null) return setPos(null);
    const card = grid.querySelector<HTMLElement>(`[data-step="${active}"]`);
    if (!card) return setPos(null);
    const g = grid.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const width = Math.min(mascotSize === MASCOT_DESKTOP ? PANEL_W : 440, g.width);
    const centre = c.left - g.left + c.width / 2;
    const left = Math.max(0, Math.min(centre - width / 2, g.width - width));
    setPos({ left, top: c.bottom - g.top + 10, arrow: centre - left, width });
  }, [active, mascotSize]);

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
    if (active == null) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (panelRef.current?.contains(t) || t.closest("[data-step]")) return;
      setActive(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActive(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [active]);

  // With a mouse, hovering a step explains it; short delays stop flicker and
  // keep the explanation open while the pointer moves down into it.
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
    closeTimer.current = window.setTimeout(() => setActive(null), 420);
  };
  const show = (i: number) =>
    setActive((cur) => {
      if (cur !== i) setReply((n) => n + 1);
      return i;
    });
  const hoverStep = (e: React.PointerEvent, i: number) => {
    lastPointer.current = e.pointerType;
    if (e.pointerType !== "mouse") return;
    keepOpen();
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => show(i), active != null ? 120 : 220);
  };
  const clickStep = (i: number) => {
    if (lastPointer.current === "mouse") {
      window.clearTimeout(openTimer.current);
      return show(i);
    }
    setActive((cur) => (cur === i ? null : i));
    setReply((n) => n + 1);
  };

  const step = active != null ? STEPS[active] : null;

  return (
    <div ref={gridRef} className="relative">
      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title}>
            <button
              type="button"
              data-step={i}
              onPointerEnter={(e) => hoverStep(e, i)}
              onPointerLeave={closeSoon}
              onPointerDown={(e) => (lastPointer.current = e.pointerType)}
              onClick={() => clickStep(i)}
              aria-expanded={active === i}
              className={`group relative h-full w-full rounded-3xl border bg-white p-6 text-left shadow-sm transition ${
                active === i ? "border-transparent shadow-[0_0_0_2px_#d9b968,0_14px_30px_-18px_rgba(168,132,58,0.6)]" : "border-nude/70 hover:-translate-y-0.5 hover:shadow-md"
              }`}
            >
              <span className="absolute right-5 top-4 font-display text-4xl font-semibold text-coral-dark/80" aria-hidden>
                {i + 1}
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-skin text-coral-dark transition group-hover:bg-coral group-hover:text-white">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="mt-4 block font-semibold text-ink">
                <span className="sr-only">Step {i + 1}: </span>
                {title}
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed text-ink/70">{text}</span>
            </button>
          </li>
        ))}
      </ol>

      {step && active != null && pos && (
          <div
            ref={panelRef}
            onPointerEnter={keepOpen}
            onPointerLeave={closeSoon}
            role="dialog"
            aria-label={`GlowSync AI explains step ${active + 1}`}
            className={`absolute z-30 ${GUIDE_FONTS}`}
            style={{ left: pos.left, top: pos.top, width: pos.width }}
          >
            <span aria-hidden className="absolute -top-1.5 h-4 w-4 rotate-45 rounded-sm bg-[#f6dc8e]" style={{ left: pos.arrow - 8 }} />
            <div key={`${active}-${reply}`} className="guide-bubble glowy-pop">
              <div className="guide-bubble-inner flex gap-3 p-4">
                <div className="relative shrink-0 self-end">
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
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="guide-rise flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a97c1c]">
                    <span aria-hidden className="guide-live-dot" />
                    GlowSync AI · Step {active + 1} of {STEPS.length}
                  </p>
                  <p className="guide-rise guide-display guide-title text-[19px] leading-tight">{step.hook}</p>
                  <p className="guide-rise text-[14px] font-semibold leading-relaxed text-ink/85">
                    <TypeText key={`${active}-${reply}`} text={step.explain} />
                  </p>
                  <p className="guide-rise rounded-2xl bg-[#fff6e6] px-3 py-2 text-[13px] leading-snug text-ink/75 ring-1 ring-[#f1dfb6]">
                    <span className="guide-display font-semibold text-[#a97c1c]">Tip:</span> {step.tip}
                  </p>
                  <div className="guide-rise flex flex-wrap gap-2 pt-1">
                    {step.action === "book" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActive(null);
                          open(branchServiceCategories[0].services[0]);
                        }}
                        className="flex items-center gap-1 rounded-full bg-gradient-to-br from-[#e9bc4c] to-[#c58d1d] px-4 py-1.5 text-xs font-extrabold text-white shadow-[0_8px_16px_-8px_rgba(169,124,28,0.8)] transition hover:-translate-y-0.5 hover:brightness-105"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Book now
                      </button>
                    ) : (
                      <Link
                        href={step.action.href}
                        onClick={() => setActive(null)}
                        className="flex items-center gap-1 rounded-full bg-gradient-to-br from-[#e9bc4c] to-[#c58d1d] px-4 py-1.5 text-xs font-extrabold text-white shadow-[0_8px_16px_-8px_rgba(169,124,28,0.8)] transition hover:-translate-y-0.5 hover:brightness-105"
                      >
                        {step.action.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    )}
                    {active < STEPS.length - 1 && (
                      <button
                        type="button"
                        onClick={() => show(active + 1)}
                        className="rounded-full border-[1.5px] border-[#d9b968] bg-white px-4 py-1.5 text-xs font-extrabold text-ink/80 transition hover:-translate-y-0.5"
                      >
                        Next step →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
      )}
    </div>
  );
}
