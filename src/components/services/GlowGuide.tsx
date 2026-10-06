"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { ArrowDown, CalendarPlus, ChevronLeft, Gift, Loader2, MessageCircleQuestion, Send, X } from "lucide-react";
import GlowMascot from "@/components/GlowMascot";
import { useBooking } from "@/components/booking/BookingContext";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import type { GuideFacts } from "@/lib/glowGuide";

/** GlowSync Guide: an arrow tours the service cards and the GlowSync
 * mascot flies to each one to introduce it. Hovering a card makes the guide
 * jump there; tapping the mascot opens quick questions. On smaller screens
 * it's a guide bar above the cards so it never covers buttons. */

const STEP_MS = 8000; // time on each card
const HOVER_RESUME_MS = 6000; // auto-tour resumes this long after the mouse leaves
const MINIMIZED_KEY = "glowguide-minimized";

type Mode = "intro" | "menu" | "ask" | "answer";
type QuickKey = "price" | "duration" | "benefits" | "promotions" | "compare";

const QUICK: { key: QuickKey; label: string }[] = [
  { key: "price", label: "💰 Price" },
  { key: "duration", label: "⏱️ Duration" },
  { key: "benefits", label: "🌿 Benefits" },
  { key: "promotions", label: "🎁 Promotions" },
  { key: "compare", label: "⚖️ Compare" },
];

type Box = { left: number; top: number; width: number; height: number };
type Layout = { card: Box; containerWidth: number } | null;

// "Hide guide" is remembered for this browser tab (sessionStorage).
const minimizedListeners = new Set<() => void>();
let minimizedFallback = false;

function readMinimized(): boolean {
  try {
    return sessionStorage.getItem(MINIMIZED_KEY) === "1";
  } catch {
    return minimizedFallback;
  }
}

function saveMinimized(v: boolean) {
  minimizedFallback = v;
  try {
    sessionStorage.setItem(MINIMIZED_KEY, v ? "1" : "0");
  } catch {
    // Storage blocked — remembered until the page reloads.
  }
  minimizedListeners.forEach((l) => l());
}

function subscribeMinimized(cb: () => void) {
  minimizedListeners.add(cb);
  return () => minimizedListeners.delete(cb);
}

const WIDE_QUERY = "(min-width: 1024px)";
function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export default function GlowGuide({
  containerRef,
  items,
  onBook,
  onDetails,
}: {
  containerRef: RefObject<HTMLElement | null>;
  items: GuideFacts[];
  onBook: (item: GuideFacts) => void;
  onDetails: (item: GuideFacts) => void;
}) {
  const { isOpen: bookingOpen } = useBooking();
  const { open: openLogin } = useLoginModal();
  const { user } = useCurrentUser();

  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("intro");
  const [answer, setAnswer] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const minimized = useSyncExternalStore(subscribeMinimized, readMinimized, () => false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
  const [inView, setInView] = useState(false);
  const [layout, setLayout] = useState<Layout>(null);
  const [moving, setMoving] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const pausedUntil = useRef(0);
  const hovering = useRef(false);

  const itemsKey = items.map((i) => i.id).join("|");
  const [lastKey, setLastKey] = useState(itemsKey);
  if (lastKey !== itemsKey) {
    // New set of cards (e.g. a category was opened): start the tour over.
    setLastKey(itemsKey);
    setIndex(0);
    setMode("intro");
    setAnswer(null);
  }

  const item = items[Math.min(index, items.length - 1)] ?? null;

  // Only tour while the catalog is on screen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [containerRef]);

  const cardEl = useCallback(
    (id: string) => containerRef.current?.querySelector<HTMLElement>(`[data-guide-id="${CSS.escape(id)}"]`) ?? null,
    [containerRef]
  );

  // Where the active card is, relative to the catalog.
  const measure = useCallback(() => {
    const c = containerRef.current;
    if (!c || !item) return setLayout(null);
    const el = cardEl(item.id);
    if (!el) return setLayout(null);
    const cr = c.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setLayout({ card: { left: r.left - cr.left, top: r.top - cr.top, width: r.width, height: r.height }, containerWidth: cr.width });
  }, [containerRef, cardEl, item]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => measure());
    ro.observe(c);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, measure, wide]);

  // Highlight the card the guide is talking about.
  useEffect(() => {
    if (!item || minimized) return;
    const el = cardEl(item.id);
    el?.setAttribute("data-guide-active", "true");
    return () => el?.removeAttribute("data-guide-active");
  }, [item, cardEl, minimized]);

  const goTo = useCallback(
    (next: number) => {
      setIndex((cur) => {
        if (cur !== next) {
          setMoving(true);
          window.setTimeout(() => setMoving(false), 900);
        }
        return next;
      });
      setMode("intro");
      setAnswer(null);
    },
    []
  );

  // The tour: next card every few seconds (desktop: only cards on screen).
  useEffect(() => {
    if (minimized || !inView || bookingOpen || mode !== "intro" || items.length < 2) return;
    const t = window.setInterval(() => {
      if (document.hidden || hovering.current || Date.now() < pausedUntil.current) return;
      setIndex((cur) => {
        for (let step = 1; step <= items.length; step++) {
          const i = (cur + step) % items.length;
          if (!wide) return i;
          const el = cardEl(items[i].id);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 90);
          if (visible >= r.height * 0.6) {
            if (i !== cur) {
              setMoving(true);
              window.setTimeout(() => setMoving(false), 900);
            }
            return i;
          }
        }
        return cur;
      });
    }, STEP_MS);
    return () => window.clearInterval(t);
  }, [minimized, inView, bookingOpen, mode, items, wide, cardEl]);

  // Hovering a card (desktop) makes the guide jump to it and pauses the tour.
  useEffect(() => {
    const c = containerRef.current;
    if (!c || !wide || minimized) return;
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const card = (e.target as HTMLElement).closest<HTMLElement>("[data-guide-id]");
      if (!card) return;
      hovering.current = true;
      const i = items.findIndex((it) => it.id === card.dataset.guideId);
      if (i >= 0 && items[i].id !== item?.id) goTo(i);
    };
    const out = (e: PointerEvent) => {
      const from = (e.target as HTMLElement).closest("[data-guide-id]");
      const to = (e.relatedTarget as HTMLElement | null)?.closest?.("[data-guide-id]");
      if (from && from !== to) {
        hovering.current = false;
        pausedUntil.current = Date.now() + HOVER_RESUME_MS;
      }
    };
    c.addEventListener("pointerover", over);
    c.addEventListener("pointerout", out);
    return () => {
      c.removeEventListener("pointerover", over);
      c.removeEventListener("pointerout", out);
    };
  }, [containerRef, wide, minimized, items, item, goTo]);

  function minimize(v: boolean) {
    saveMinimized(v);
    setMode("intro");
  }

  function book() {
    if (!item) return;
    setCelebrate(true);
    window.setTimeout(() => {
      setCelebrate(false);
      onBook(item);
    }, 650);
  }

  function quick(key: QuickKey) {
    if (!item) return;
    setAnswer(item.answers[key]);
    setMode("answer");
  }

  async function ask() {
    const q = question.trim();
    if (!q || !item || asking) return;
    if (!user) {
      setAnswer("Log in first and I can answer anything about our services ✨");
      setMode("answer");
      return;
    }
    setAsking(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: `About "${item.title}" (${item.category}): ${q}` }] }),
      });
      const data = await res.json().catch(() => null);
      setAnswer(res.ok && data?.reply ? data.reply : data?.error ?? "I couldn't answer that right now — please try again.");
    } catch {
      setAnswer("Network error — please try again.");
    } finally {
      setAsking(false);
      setQuestion("");
      setMode("answer");
    }
  }

  if (!item) return null;

  // ── The speech bubble (same content in both layouts) ──
  const bubble = (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-coral-dark">
          {mode === "intro" ? `GlowSync AI · ${item.kind === "category" ? "Category" : "Treatment"}` : item.title}
        </p>
        <button type="button" onClick={() => minimize(true)} aria-label="Hide the GlowSync guide" className="-mr-1 -mt-1 rounded-full p-0.5 text-ink/35 hover:bg-blush hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>

      {mode === "intro" && (
        <>
          <p className="text-sm leading-relaxed text-ink">
            <span className="font-semibold">✨ {item.intro}</span>
          </p>
          <p className="text-sm text-ink/70">
            <span className="font-semibold text-ink">Why choose this?</span> {item.why}
          </p>
          {item.meta.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.meta.map((m) => (
                <span key={m} className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-medium text-ink/70 ring-1 ring-champagne/60">
                  {m}
                </span>
              ))}
            </div>
          )}
          {item.promo && (
            <p className="flex items-start gap-1.5 rounded-xl bg-[#fbf1dc] px-2.5 py-1.5 text-xs font-medium text-coral-dark">
              <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {item.answers.promotions.replace(/^🎁\s*/, "")}
            </p>
          )}
        </>
      )}

      {mode === "menu" && (
        <>
          <p className="text-sm font-semibold text-ink">Hi! What would you like to know? ✨</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button key={q.key} type="button" onClick={() => quick(q.key)} className="rounded-full border border-champagne bg-white px-2.5 py-1 text-xs font-medium text-ink/75 hover:border-coral hover:bg-blush">
                {q.label}
              </button>
            ))}
            <button type="button" onClick={() => setMode("ask")} className="rounded-full border border-coral/50 bg-blush/60 px-2.5 py-1 text-xs font-semibold text-coral-dark hover:bg-blush">
              💬 Ask a question
            </button>
          </div>
        </>
      )}

      {mode === "ask" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className="space-y-2"
        >
          <p className="text-sm text-ink/75">Ask me about {item.title}:</p>
          <div className="flex items-center gap-1.5 rounded-full border border-ink/15 bg-white px-3 py-1.5 focus-within:border-coral">
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value.slice(0, 300))}
              placeholder="e.g. Is this good for dry skin?"
              aria-label={`Ask about ${item.title}`}
              className="w-full text-xs outline-none placeholder:text-ink/40"
            />
            <button type="submit" disabled={asking || !question.trim()} aria-label="Ask" className="text-coral-dark disabled:opacity-40">
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      )}

      {mode === "answer" && (
        <div aria-live="polite" className="space-y-2">
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{answer}</p>
          {!user && answer?.startsWith("Log in") && (
            <button type="button" onClick={openLogin} className="rounded-full bg-coral px-3 py-1 text-xs font-semibold text-white hover:bg-coral-dark">
              Log in
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {mode !== "intro" && (
          <button type="button" onClick={() => setMode(mode === "answer" ? "menu" : "intro")} className="flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-semibold text-ink/60 hover:bg-blush">
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}
        <button type="button" onClick={() => onDetails(item)} className="rounded-full border border-champagne px-3 py-1 text-xs font-semibold text-ink/75 hover:border-coral">
          {item.kind === "category" ? "See treatments" : "View Details"}
        </button>
        <button type="button" onClick={book} className="flex items-center gap-1 rounded-full bg-coral px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-coral-dark">
          <CalendarPlus className="h-3.5 w-3.5" /> Book Now
        </button>
        {mode === "intro" && (
          <button type="button" onClick={() => setMode("menu")} className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-coral-dark hover:bg-blush">
            <MessageCircleQuestion className="h-3.5 w-3.5" /> Ask me
          </button>
        )}
      </div>
    </div>
  );

  const mascot = (size: number) => (
    <span className={`relative block ${celebrate ? "guide-celebrate" : moving ? "guide-moving" : "glowy-bob"}`}>
      <GlowMascot size={size} talking={moving || asking} />
      {!moving && (
        <span key={`${item.id}-${celebrate}`} aria-hidden className="guide-react pointer-events-none absolute -top-3 left-1/2 text-lg">
          {celebrate ? "💖" : item.reaction}
        </span>
      )}
    </span>
  );

  // ── Minimized: a small button to bring the guide back ──
  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => minimize(false)}
        className="absolute right-6 top-6 z-20 flex items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-3 text-xs font-semibold text-coral-dark shadow-md ring-1 ring-champagne hover:bg-cream"
      >
        <GlowMascot size={26} /> Show GlowSync guide
      </button>
    );
  }

  // ── Phones and tablets: a guide bar above the cards ──
  if (!wide) {
    return (
      <div className="mb-6 flex items-start gap-3 rounded-3xl bg-gradient-to-br from-cream via-white to-[#fbf1dc] p-4 shadow-sm ring-1 ring-champagne/70">
        <button type="button" onClick={() => setMode(mode === "intro" ? "menu" : "intro")} aria-label="Ask GlowSync AI" className="shrink-0">
          {mascot(52)}
        </button>
        <div className="min-w-0 flex-1">{bubble}</div>
      </div>
    );
  }

  // ── Desktop: the arrow and mascot fly to the active card ──
  if (!layout) return null;
  const { card, containerWidth } = layout;
  const BUBBLE_W = 310;
  const side: "right" | "left" = card.left + card.width + 24 + BUBBLE_W <= containerWidth ? "right" : "left";
  const arrowX = card.left + card.width / 2 - 14;
  const arrowY = card.top - 34;
  const mascotX = card.left + card.width - 40;
  const mascotY = card.top - 44;
  const bubbleX = side === "right" ? card.left + card.width + 18 : card.left - BUBBLE_W - 18;
  const bubbleY = Math.max(card.top - 8, 0);

  return (
    <>
      <span aria-hidden className="guide-fly pointer-events-none absolute left-0 top-0 z-20" style={{ transform: `translate(${arrowX}px, ${arrowY}px)` }}>
        <span className="guide-arrow flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-[#f3d98b] to-coral text-white shadow-md">
          <ArrowDown className="h-4 w-4" strokeWidth={3} />
        </span>
      </span>

      <button
        type="button"
        onClick={() => setMode(mode === "intro" ? "menu" : "intro")}
        aria-label="Ask GlowSync AI about this service"
        className="guide-fly absolute left-0 top-0 z-30 rounded-full bg-white p-1 shadow-lg ring-2 ring-champagne"
        style={{ transform: `translate(${mascotX}px, ${mascotY}px)` }}
      >
        {mascot(54)}
      </button>

      <div
        className={`guide-fly absolute left-0 top-0 z-30 transition-opacity ${moving ? "pointer-events-none opacity-0" : "opacity-100"}`}
        style={{ transform: `translate(${bubbleX}px, ${bubbleY}px)`, width: BUBBLE_W }}
      >
        <div key={`${item.id}-${mode}`} className="glowy-pop relative rounded-3xl bg-white p-4 shadow-xl ring-1 ring-champagne">
          <span
            aria-hidden
            className={`absolute top-8 h-4 w-4 rotate-45 bg-white ${side === "right" ? "-left-2 border-b border-l" : "-right-2 border-r border-t"} border-champagne`}
          />
          {bubble}
        </div>
      </div>
    </>
  );
}
