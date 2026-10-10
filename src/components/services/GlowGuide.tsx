"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { ArrowDown, CalendarPlus, ChevronLeft, Gift, Loader2, MessageCircleQuestion, Send } from "lucide-react";
import Link from "next/link";
import { GUIDE_FONTS, MASCOT_DESKTOP, MASCOT_PHONE, mascotWidth, TypeText } from "@/components/guide/guideKit";
import { MascotFigure, useMascotPlay } from "@/components/guide/MascotPlay";
import GlowMascot, { type MascotFace, type MascotPose } from "@/components/GlowMascot";
import { useBooking } from "@/components/booking/BookingContext";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import type { GuideFacts } from "@/lib/glowGuide";
import { CHAT_PANEL_EVENT, GUIDE_ACTIVE_EVENT, announce, requestChat, type GuideActiveDetail } from "@/lib/glowEvents";

/** GlowSync Guide: an arrow tours the service cards and the GlowSync
 * mascot flies to each one to introduce it. Hovering a card makes the guide
 * jump there; tapping the mascot opens quick questions. On smaller screens
 * it's a guide bar above the cards so it never covers buttons. */

const STEP_MS = 8000; // time on each card
const HOVER_RESUME_MS = 6000; // auto-tour resumes this long after the mouse leaves
const GREETING_MS = 4500; // "Hi! I'm GlowSync AI" before the tour starts
const ARRIVE_MS = 450; // the arrow reaches the card first; the mascot follows
const MOVE_MS = ARRIVE_MS + 900; // arrow + mascot travel time

const sameName = (a?: string | null, b?: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const MINIMIZED_KEY = "glowguide-minimized";

type Mode = "intro" | "menu" | "ask" | "answer";
type QuickKey = "about" | "price" | "duration" | "benefits" | "promotions" | "compare";

const QUICK: { key: QuickKey; label: string }[] = [
  { key: "about", label: "ℹ️ About" },
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
  // After "Ask me" the guide stays on this service (hovering other cards is
  // ignored) until the visitor clicks another service card.
  const [locked, setLocked] = useState(false);
  // The full chat is open (the same AI is busy chatting): hold still.
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpens, setMenuOpens] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const minimized = useSyncExternalStore(subscribeMinimized, readMinimized, () => false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
  const [inView, setInView] = useState(false);
  const [layout, setLayout] = useState<Layout>(null);
  const [moving, setMoving] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [landing, setLanding] = useState(false);
  const mascotRef = useRef<HTMLButtonElement>(null);
  const [greeting, setGreeting] = useState(true);
  const pausedUntil = useRef(0);
  const arrival = useRef(0);

  // Tap, rub, idle moments, eyes that follow the mouse — shared with every mascot.
  const play = useMascotPlay({
    targetRef: mascotRef,
    idle: !minimized && inView && !greeting && !moving && !asking && !celebrate && mode !== "ask",
    track: wide && !minimized && inView,
  });
  const { emote, burst } = play;

  const hovering = useRef(false);

  const itemsKey = items.map((i) => i.id).join("|");
  const [lastKey, setLastKey] = useState(itemsKey);
  if (lastKey !== itemsKey) {
    // New set of cards (e.g. a category was opened): start the tour over.
    setLastKey(itemsKey);
    setIndex(0);
    setMode("intro");
    setAnswer(null);
    setLocked(false);
  }

  const item = items[Math.min(index, items.length - 1)] ?? null;

  // One GlowSync AI: while the guide is on screen the floating chat character
  // steps aside, and while the chat is open the guide holds still.
  // "On stage" = the cards fill a good part of the screen (not just a sliver).
  const [onStage, setOnStage] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      setOnStage(visible >= window.innerHeight * 0.45);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [containerRef]);
  useEffect(() => {
    const r = mascotRef.current?.getBoundingClientRect();
    const detail: GuideActiveDetail = {
      active: onStage && !minimized,
      rect: wide && r && r.width > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null,
    };
    announce(GUIDE_ACTIVE_EVENT, detail);
  }, [onStage, minimized, wide]);
  useEffect(() => () => announce(GUIDE_ACTIVE_EVENT, { active: false, rect: null } satisfies GuideActiveDetail), []);
  useEffect(() => {
    const onPanel = (e: Event) => setChatOpen(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(CHAT_PANEL_EVENT, onPanel);
    return () => window.removeEventListener(CHAT_PANEL_EVENT, onPanel);
  }, []);

  // Only tour while the catalog is on screen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [containerRef]);

  // Say hello first, then start the tour.
  useEffect(() => {
    if (!inView || !greeting) return;
    const t = window.setTimeout(() => setGreeting(false), GREETING_MS);
    return () => window.clearTimeout(t);
  }, [inView, greeting]);

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
    const t = window.setTimeout(() => el?.setAttribute("data-guide-active", "true"), wide ? ARRIVE_MS : 0);
    return () => {
      window.clearTimeout(t);
      el?.removeAttribute("data-guide-active");
    };
  }, [item, cardEl, minimized, wide]);

  // Arrow first, then the mascot travels to the card.
  const travel = useCallback(
    (next: number) => {
      if (next === index) return;
      setMoving(true);
      window.setTimeout(() => {
        setMoving(false);
        setLanding(true);
        window.setTimeout(() => setLanding(false), 520);
      }, MOVE_MS);
      setIndex(next);
      const reaction = items[next]?.reaction;
      const hasPromo = !!items[next]?.promo;
      window.clearTimeout(arrival.current);
      arrival.current = window.setTimeout(() => {
        emote([
          { face: "surprised", emote: "!", ms: 650 },
          { face: "excited", emote: hasPromo ? "🎉" : reaction, ms: 1600 },
        ]);
        if (hasPromo) burst("party");
      }, MOVE_MS);
    },
    [index, items, emote, burst]
  );

  const goTo = useCallback(
    (next: number) => {
      travel(next);
      setMode("intro");
      setAnswer(null);
      setGreeting(false);
    },
    [travel]
  );

  // The tour: next card every few seconds (desktop: only cards on screen).
  useEffect(() => {
    if (minimized || !inView || greeting || bookingOpen || mode !== "intro" || locked || chatOpen || items.length < 2) return;
    const t = window.setInterval(() => {
      if (document.hidden || hovering.current || Date.now() < pausedUntil.current) return;
      for (let step = 1; step <= items.length; step++) {
        const i = (index + step) % items.length;
        if (!wide) return travel(i);
        const el = cardEl(items[i].id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 90);
        if (visible >= r.height * 0.6) return travel(i);
      }
    }, STEP_MS);
    return () => window.clearInterval(t);
  }, [minimized, inView, greeting, bookingOpen, mode, locked, chatOpen, items, wide, cardEl, index, travel]);



  // Hovering a card (desktop) makes the guide jump to it and pauses the tour.
  // While the pointer is on the mascot or its speech bubble / question box the
  // guide stays put; it follows the mouse again as soon as the pointer leaves.
  useEffect(() => {
    const c = containerRef.current;
    if (!c || !wide || minimized) return;
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-guide-ui]")) {
        hovering.current = true;
        return;
      }
      const card = target.closest<HTMLElement>("[data-guide-id]");
      if (!card) return;
      hovering.current = true;
      if (locked || chatOpen) return;
      const i = items.findIndex((it) => it.id === card.dataset.guideId);
      if (i >= 0 && items[i].id !== item?.id) goTo(i);
    };
    const click = (e: MouseEvent) => {
      if (!locked) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-guide-ui]")) return;
      const card = target.closest<HTMLElement>("[data-guide-id]");
      if (!card) return;
      const i = items.findIndex((it) => it.id === card.dataset.guideId);
      if (i < 0) return;
      setLocked(false);
      if (items[i].id !== item?.id) goTo(i);
    };
    const out = (e: PointerEvent) => {
      const from = (e.target as HTMLElement).closest("[data-guide-id], [data-guide-ui]");
      const to = (e.relatedTarget as HTMLElement | null)?.closest?.("[data-guide-id], [data-guide-ui]");
      if (from && !to) {
        hovering.current = false;
        pausedUntil.current = Date.now() + HOVER_RESUME_MS;
      }
    };
    c.addEventListener("pointerover", over);
    c.addEventListener("pointerout", out);
    c.addEventListener("click", click);
    return () => {
      c.removeEventListener("pointerover", over);
      c.removeEventListener("pointerout", out);
      c.removeEventListener("click", click);
    };
  }, [containerRef, wide, minimized, items, item, goTo, locked, chatOpen]);

  /** Tap: the body tucks into the head and springs back with hearts.
   *  Three quick taps: a twirl with sparkles. Either way, its questions open. */
  function tapMascot() {
    play.tap();
    openMenu();
  }

  function openMenu() {
    setGreeting(false);
    setLocked(true);
    if (mode === "intro") {
      setMode("menu");
      setMenuOpens((n) => n + 1);
    }
  }


  function minimize(v: boolean) {
    saveMinimized(v);
    setMode("intro");
  }

  function book() {
    if (!item) return;
    emote([{ face: "love", emote: "💖", ms: 900 }]);
    setCelebrate(true);
    window.setTimeout(() => {
      setCelebrate(false);
      onBook(item);
    }, 650);
  }

  function quick(key: QuickKey) {
    if (!item) return;
    setAnswer(key === "about" ? `${item.intro} ${item.why}` : item.answers[key]);
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
      const recs: { name?: string; category?: string }[] = res.ok && Array.isArray(data?.recommendations) ? data.recommendations : [];
      const target = recs
        .map((r) => items.findIndex((it) => (it.kind === "service" ? sameName(it.title, r.name) && it.category === r.category : it.category === r.category)))
        .find((i) => i >= 0);
      if (target !== undefined) travel(target);
      else if (res.ok) emote([{ face: "giggle", emote: "💡", ms: 1600 }]);
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
      <p className="guide-rise flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a97c1c]">
        <span aria-hidden className="guide-live-dot" />
        {greeting ? "GlowSync AI" : mode === "intro" ? `GlowSync AI · ${item.kind === "category" ? "Category" : "Treatment"}` : item.title}
      </p>

      {greeting && mode === "intro" && (
        <div className="guide-rise space-y-1">
          <p className="guide-display guide-title text-[19px] leading-tight">Hi! I&apos;m GlowSync AI ✨</p>
          <p className="text-[14.5px] font-semibold leading-relaxed text-ink/85">
            <TypeText key="greet" text="Looking for the perfect service? I'm here to help you find what you need!" />
          </p>
        </div>
      )}

      {!greeting && mode === "intro" && (
        <>
          <p className="guide-rise guide-display guide-title text-[19px] leading-tight">✨ {item.hook}</p>
          <p className="guide-rise text-[14.5px] font-semibold leading-relaxed text-ink/85">
            <TypeText key={item.id} text={item.intro} />
          </p>
          <p className="guide-rise rounded-2xl bg-[#fff6e6] px-3 py-2 text-[13px] leading-snug text-ink/75 ring-1 ring-[#f1dfb6]">
            <span className="guide-display font-semibold text-[#a97c1c]">Why choose this?</span> {item.why}
          </p>
          {item.meta.length > 0 && (
            <div className="guide-rise flex flex-wrap gap-1.5">
              {item.meta.map((m) => (
                <span key={m} className="rounded-full bg-gradient-to-r from-[#f7f0ff] to-[#fdf0f7] px-2.5 py-0.5 text-[11.5px] font-bold text-[#5b2d86] ring-1 ring-[#e6d8f8]">
                  {m}
                </span>
              ))}
            </div>
          )}
          {item.promo && (
            <p className="guide-rise flex items-start gap-1.5 rounded-xl bg-gradient-to-r from-[#fff0f7] to-[#fbf1dc] px-2.5 py-1.5 text-xs font-bold text-[#b83c78]">
              <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {item.answers.promotions.replace(/^🎁\s*/, "")}
            </p>
          )}
        </>
      )}

      {mode === "menu" && (
        <>
          <p className="text-sm font-semibold text-ink">
            {menuOpens <= 1 ? "Hi! What would you like to know? ✨" : `Anything else about ${item.title}? ✨`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button key={q.key} type="button" onClick={() => quick(q.key)} className="rounded-full border border-champagne bg-white px-2.5 py-1 text-xs font-medium text-ink/75 hover:border-coral hover:bg-blush">
                {q.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                // Signed-in clients: the full chat opens about this service. Otherwise ask right here.
                if (requestChat(item.title)) setMode("intro");
                else setMode("ask");
              }}
              className="rounded-full border border-coral/50 bg-blush/60 px-2.5 py-1 text-xs font-semibold text-coral-dark hover:bg-blush"
            >
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
          <p className="text-sm text-ink">
            <span className="font-semibold">Of course! ✨</span> What would you like to know about {item.title}?
          </p>
          <div className="flex items-center gap-2 rounded-2xl border border-[#d9b968] bg-[#fffaf3] py-1.5 pl-3.5 pr-1.5 shadow-inner shadow-[#d9b968]/10 transition duration-200 focus-within:border-[#c9a24a] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#d9b968]/25">
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value.slice(0, 300))}
              placeholder="Ask me about this service..."
              aria-label={`Ask about ${item.title}`}
              disabled={asking}
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
            />
            <button
              type="submit"
              disabled={asking || !question.trim()}
              aria-label="Send question"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f3d98b] to-[#c9a24a] text-white shadow-sm transition hover:brightness-105 disabled:opacity-40"
            >
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          {asking && (
            <p className="flex items-center gap-1 text-xs text-ink/55">
              GlowSync AI is thinking
              <span className="glowy-dot inline-block">.</span>
              <span className="glowy-dot inline-block [animation-delay:150ms]">.</span>
              <span className="glowy-dot inline-block [animation-delay:300ms]">.</span>
            </p>
          )}
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

      {!greeting && (
      <div className="guide-rise space-y-2 pt-1">
        {/* Main actions: two equal buttons side by side. */}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onDetails(item)} className="flex items-center justify-center gap-1 rounded-full py-1.5 text-xs font-extrabold transition border-[1.5px] border-[#d9b968] bg-white px-3 text-ink/80 hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-8px_rgba(169,124,28,0.7)]">
            {item.kind === "category" ? "See treatments" : "View Details"}
          </button>
          <button type="button" onClick={book} className="flex items-center justify-center gap-1 rounded-full py-1.5 text-xs font-extrabold transition bg-gradient-to-br from-[#e9bc4c] to-[#c58d1d] px-3 text-white shadow-[0_8px_16px_-8px_rgba(169,124,28,0.8)] hover:-translate-y-0.5 hover:brightness-105">
            <CalendarPlus className="h-3.5 w-3.5" /> Book Now
          </button>
        </div>
        {/* Secondary actions: centred underneath. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {mode !== "intro" && (
            <button type="button" onClick={() => setMode(mode === "answer" ? "menu" : "intro")} className="flex items-center justify-center gap-1 rounded-full py-1.5 text-xs font-extrabold transition px-3 text-ink/60 hover:bg-[#fff6e6]">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
          {item.promo && mode === "intro" && (
            <Link href="/#promotions" className="flex items-center justify-center gap-1 rounded-full py-1.5 text-xs font-extrabold transition border border-[#f3a6c8] bg-[#fff0f6] px-3 text-[#b83c78] hover:bg-[#ffe3ef]">
              <Gift className="h-3.5 w-3.5" /> View Promotion
            </Link>
          )}
          {locked && mode !== "ask" && (
            <p className="w-full text-center text-[11px] font-semibold text-ink/45">Click another service to move on</p>
          )}
          {mode === "intro" && !locked && (
            <button type="button" onClick={openMenu} className="flex items-center justify-center gap-1 rounded-full py-1.5 text-xs font-extrabold transition min-w-[60%] flex-1 bg-gradient-to-r from-[#f5effd] to-[#fdf0f7] px-3 text-[#7b3fc4] ring-1 ring-[#e3d6f7] hover:ring-[#c9b0f0]">
              <MessageCircleQuestion className="h-3.5 w-3.5" /> Ask me
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  );

  // Pose per state: flying between cards, pointing (or relaxed for
  // massage) at a card, thinking while answering, love after Book Now.
  const pose: MascotPose = celebrate
    ? "love"
    : moving
      ? "fly"
      : asking || mode === "ask"
        ? "think"
        : greeting || mode === "menu"
          ? "wave"
          : mode === "answer" || item.mood === "point"
            ? "present"
            : item.mood;

  const face: MascotFace | undefined = celebrate ? "love" : asking ? "think" : moving ? "excited" : undefined;
  const bubbleEmote = asking ? "…" : greeting ? "👋" : moving ? "" : undefined;

  const mascot = (size: number, flip = false) => (
    <MascotFigure
      play={play}
      size={size}
      pose={pose}
      face={face}
      emote={bubbleEmote}
      flip={flip}
      motion={celebrate ? "guide-celebrate" : moving ? "guide-moving" : landing ? "guide-land" : undefined}
      still={moving || celebrate}
      talking={asking || greeting}
      extra={
        celebrate && (
          <span aria-hidden className="pointer-events-none absolute inset-0">
            <span className="guide-sparkle absolute -left-2 top-2 text-sm">✨</span>
            <span className="guide-sparkle absolute -right-1 top-6 text-sm [animation-delay:120ms]">💕</span>
            <span className="guide-sparkle absolute -top-4 left-1/3 text-sm [animation-delay:240ms]">✨</span>
          </span>
        )
      }
    />
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
      <div data-guide-ui className={`guide-bubble guide-bubble-still mb-6 ${GUIDE_FONTS}`}>
        <div className="guide-bubble-inner flex items-start gap-3 p-4">
          <button type="button" onClick={tapMascot} aria-label="Ask GlowSync AI" className="shrink-0">
            {mascot(MASCOT_PHONE)}
          </button>
          <div key={`${item.id}-${mode}-${greeting}`} className="min-w-0 flex-1">{bubble}</div>
        </div>
      </div>
    );
  }

  // ── Desktop: the arrow reaches the card, then the mascot follows ──
  if (!layout) return null;
  const { card, containerWidth } = layout;
  const MASCOT = MASCOT_DESKTOP;
  const MASCOT_W = mascotWidth(MASCOT);
  const OVERLAP = 14; // only the star wand reaches over the card's edge
  const TUCK = Math.round(MASCOT_W * 0.5); // how much of the mascot stands on the bubble
  const BUBBLE_W = 290 + TUCK; // room for the mascot inside the bubble's edge
  // The mascot stands right beside the card like a teacher, wand on the card,
  // standing on the edge of its own speech bubble — one compact unit.
  const side: "right" | "left" = card.left + card.width - OVERLAP + MASCOT_W - TUCK + BUBBLE_W <= containerWidth ? "right" : "left";
  const arrowX = card.left + card.width / 2 - 14;
  const arrowY = card.top - 34;
  const mascotX = side === "right" ? card.left + card.width - OVERLAP : card.left - MASCOT_W + OVERLAP;
  // Level with the middle of the card, clear of the Book Now buttons at the bottom.
  const mascotY = card.top + Math.max((card.height - MASCOT) / 2 - 24, 0);
  const bubbleX = side === "right" ? mascotX + MASCOT_W - TUCK : Math.max(mascotX + TUCK - BUBBLE_W, 0);
  const bubbleY = Math.max(card.top, 0);
  const follow = { transitionDelay: `${ARRIVE_MS}ms` };

  return (
    <>
      <span aria-hidden className="guide-fly pointer-events-none absolute left-0 top-0 z-20" style={{ transform: `translate(${arrowX}px, ${arrowY}px)` }}>
        <span className="guide-arrow flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-[#f3d98b] to-[#c9a24a] text-white shadow-md ring-2 ring-white">
          <ArrowDown className="h-4 w-4" strokeWidth={3} />
        </span>
      </span>

      <div
        className={`guide-fly absolute left-0 top-0 z-30 ${moving ? "pointer-events-none opacity-0" : "opacity-100"}`}
        style={{ transform: `translate(${bubbleX}px, ${bubbleY}px)`, width: BUBBLE_W, ...follow }}
      >
        <div key={`${item.id}-${mode}-${greeting}`} data-guide-ui className={`guide-bubble glowy-pop ${GUIDE_FONTS}`}>
          <div className="guide-bubble-inner p-4 pt-4" style={side === "right" ? { paddingLeft: TUCK + 12 } : { paddingRight: TUCK + 12 }}>
            {bubble}
          </div>
        </div>
      </div>

      <button
        type="button"
        ref={mascotRef}
        data-guide-ui
        onClick={tapMascot}
        onPointerMove={play.rub}
        onPointerEnter={play.hover}
        aria-label="Ask GlowSync AI about this service"
        className="guide-fly absolute left-0 top-0 z-40 rounded-full focus-visible:outline-2 focus-visible:outline-[#c9a24a]"
        style={{ transform: `translate(${mascotX}px, ${mascotY}px)`, ...follow }}
      >
        <span key={onStage ? "landed" : "away"} className={onStage ? "guide-after-flight block" : "block"}>
          {mascot(MASCOT, side === "right")}
        </span>
      </button>
    </>
  );
}
