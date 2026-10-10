"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { ArrowDown, CalendarPlus, ChevronLeft, Gift, Loader2, MessageCircleQuestion, Send } from "lucide-react";
import Link from "next/link";
import { GUIDE_FONTS, MASCOT_DESKTOP, MASCOT_PHONE, mascotWidth, TypeText } from "@/components/guide/guideKit";
import GlowMascot, { type MascotFace, type MascotPose } from "@/components/GlowMascot";
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
const GREETING_MS = 4500; // "Hi! I'm GlowSync AI" before the tour starts
const ARRIVE_MS = 450; // the arrow reaches the card first; the mascot follows
const MOVE_MS = ARRIVE_MS + 900; // arrow + mascot travel time

const sameName = (a?: string | null, b?: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const MINIMIZED_KEY = "glowguide-minimized";

type BurstKind = "hearts" | "stars" | "party";
type Particle = { id: number; kind: BurstKind; char: string; color: string; dx: number; dy: number; rot: number; delay: number };

const BURST_CHARS: Record<BurstKind, string[]> = {
  hearts: ["❤️", "💖", "💕", "💗"],
  stars: ["✨", "⭐", "🌟", "✨"],
  party: ["🎉", "🎊", "", "", "", ""], // blanks become confetti pieces
};
const CONFETTI = ["#f6c84a", "#ff8bc8", "#b98af0", "#7ed3c4", "#ffb36b"];
let particleSeq = 0;

/** A burst of hearts, sparkles or party confetti flying out of the mascot. */
function makeBurst(kind: BurstKind): Particle[] {
  const n = kind === "party" ? 22 : 9;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const r = (kind === "party" ? 70 : 55) + Math.random() * 40;
    const chars = BURST_CHARS[kind];
    return {
      id: ++particleSeq,
      kind,
      char: chars[i % chars.length],
      color: CONFETTI[i % CONFETTI.length],
      dx: Math.cos(a) * r,
      // Hearts and sparkles float up; confetti flies out and falls.
      dy: kind === "party" ? Math.sin(a) * r * 0.7 + 40 : Math.sin(a) * r * 0.6 - 45,
      rot: (Math.random() - 0.5) * 540,
      delay: Math.random() * 120,
    };
  });
}

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
  const [mood, setMood] = useState<{ face?: MascotFace; emote?: string } | null>(null);
  const [landing, setLanding] = useState(false);
  const [look, setLook] = useState<{ x: number; y: number } | undefined>(undefined);
  const mascotRef = useRef<HTMLButtonElement>(null);
  // Play: tap to tuck the body into the head, tap fast to spin, rub to pet.
  const [tucked, setTucked] = useState(false);
  const [twirl, setTwirl] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const taps = useRef<number[]>([]);
  const rub = useRef({ x: 0, dir: 0, flips: 0, since: 0, cooldown: 0 });
  const moodTimers = useRef<number[]>([]);
  const [greeting, setGreeting] = useState(true);
  const pausedUntil = useRef(0);

  /** Plays a short sequence of expressions, e.g. surprised "!" then excited. */
  const emote = useCallback((steps: { face?: MascotFace; emote?: string; ms: number }[]) => {
    moodTimers.current.forEach((id) => window.clearTimeout(id));
    moodTimers.current = [];
    let at = 0;
    for (const s of steps) {
      moodTimers.current.push(window.setTimeout(() => setMood({ face: s.face, emote: s.emote }), at));
      at += s.ms;
    }
    moodTimers.current.push(window.setTimeout(() => setMood(null), at));
  }, []);
  useEffect(() => () => moodTimers.current.forEach((id) => window.clearTimeout(id)), []);

  const burst = useCallback((kind: BurstKind) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const fresh = makeBurst(kind);
    setParticles((p) => [...p, ...fresh]);
    window.setTimeout(() => setParticles((p) => p.filter((x) => !fresh.includes(x))), 1700);
  }, []);
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
      moodTimers.current.forEach((id) => window.clearTimeout(id));
      moodTimers.current = [
        window.setTimeout(() => {
          emote([
            { face: "surprised", emote: "!", ms: 650 },
            { face: "excited", emote: hasPromo ? "🎉" : reaction, ms: 1600 },
          ]);
          if (hasPromo) burst("party");
        }, MOVE_MS),
      ];
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
    if (minimized || !inView || greeting || bookingOpen || mode !== "intro" || locked || items.length < 2) return;
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
  }, [minimized, inView, greeting, bookingOpen, mode, locked, items, wide, cardEl, index, travel]);

  useEffect(() => {
    if (minimized || !inView || greeting) return;
    const moments: { face?: MascotFace; emote?: string; ms: number }[][] = [
      [{ face: "wink", emote: "✨", ms: 1100 }],
      [{ face: "giggle", emote: "♪", ms: 1500 }],
      [{ face: "excited", emote: "♥", ms: 1300 }],
      [{ face: "happy", emote: "✨", ms: 1200 }],
      [{ face: "think", emote: "?", ms: 900 }, { face: "giggle", emote: "💡", ms: 1000 }],
    ];
    const t = window.setInterval(() => {
      if (document.hidden || moving || asking || celebrate || mode === "ask") return;
      if (Math.random() < 0.55) emote(moments[Math.floor(Math.random() * moments.length)]);
    }, 5200);
    return () => window.clearInterval(t);
  }, [minimized, inView, greeting, moving, asking, celebrate, mode, emote]);

  // Its eyes follow the mouse (desktop).
  useEffect(() => {
    if (!wide || minimized || !inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = mascotRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / 260;
        const dy = (e.clientY - (r.top + r.height * 0.3)) / 260;
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        const next = { x: Math.round(clamp(dx) * 10) / 10, y: Math.round(clamp(dy) * 10) / 10 };
        setLook((cur) => (cur && cur.x === next.x && cur.y === next.y ? cur : next));
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [wide, minimized, inView]);

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
      if (locked) return;
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
  }, [containerRef, wide, minimized, items, item, goTo, locked]);

  /** Tap: the body tucks into the head and springs back with hearts.
   *  Three quick taps: a twirl with sparkles. Either way, its questions open. */
  function tapMascot() {
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < 1200), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      setTwirl(true);
      window.setTimeout(() => setTwirl(false), 750);
      burst("stars");
      emote([{ face: "giggle", emote: "✨", ms: 1500 }]);
    } else {
      setTucked(true);
      window.setTimeout(() => {
        setTucked(false);
        burst("hearts");
        emote([{ face: "love", emote: "💖", ms: 1300 }]);
      }, 380);
    }
    openMenu();
  }

  /** Rubbing back and forth over it (petting) gives heart eyes and hearts. */
  function rubMascot(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const r = rub.current, now = Date.now();
    const dx = e.clientX - r.x;
    r.x = e.clientX;
    if (Math.abs(dx) < 3) return;
    const dir = Math.sign(dx);
    if (now - r.since > 1200) { r.flips = 0; r.since = now; }
    if (dir !== r.dir) { r.flips += 1; r.dir = dir; }
    if (r.flips >= 5 && now > r.cooldown) {
      r.flips = 0;
      r.cooldown = now + 2500;
      burst("hearts");
      emote([{ face: "love", emote: "♥", ms: 1600 }]);
    }
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

  const face: MascotFace | undefined = celebrate ? "love" : asking ? "think" : moving ? "excited" : mood?.face;
  const bubbleEmote = asking ? "…" : greeting ? "👋" : moving ? undefined : mood?.emote;

  const mascot = (size: number, flip = false) => (
    <span className="relative block">
    <span className={`relative block drop-shadow-[0_10px_12px_rgba(120,90,30,0.28)] ${twirl ? "guide-twirl" : celebrate ? "guide-celebrate" : moving ? "guide-moving" : landing ? "guide-land" : "glowy-bob"}`}>
      <GlowMascot
        size={size}
        full
        pose={pose}
        face={face}
        look={look}
        flip={flip}
        alive={!moving && !celebrate}
        blink={!moving && !celebrate}
        talking={asking || greeting}
        tucked={tucked}
      />
      {bubbleEmote && (
        <span
          key={bubbleEmote + (mood?.face ?? "")}
          aria-hidden
          className={`guide-emote pointer-events-none absolute -top-3 ${flip ? "left-1" : "right-1"} flex h-8 min-w-8 items-center justify-center rounded-full border border-[#d9b968] bg-white px-1.5 text-base font-black leading-none text-[#c9a24a] shadow-md`}
        >
          {bubbleEmote === "…" ? (
            <span className="flex gap-0.5">
              <span className="glowy-dot h-1.5 w-1.5 rounded-full bg-[#c9a24a]" />
              <span className="glowy-dot h-1.5 w-1.5 rounded-full bg-[#c9a24a] [animation-delay:150ms]" />
              <span className="glowy-dot h-1.5 w-1.5 rounded-full bg-[#c9a24a] [animation-delay:300ms]" />
            </span>
          ) : (
            bubbleEmote
          )}
        </span>
      )}
      {celebrate && (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span className="guide-sparkle absolute -left-2 top-2 text-sm">✨</span>
          <span className="guide-sparkle absolute -right-1 top-6 text-sm [animation-delay:120ms]">💕</span>
          <span className="guide-sparkle absolute -top-4 left-1/3 text-sm [animation-delay:240ms]">✨</span>
        </span>
      )}
    </span>
      <span aria-hidden className="guide-ground pointer-events-none absolute -bottom-1 left-1/2 h-2.5 w-[55%] -translate-x-1/2 rounded-full bg-[#7a5a1e]/25 blur-[3px]" />
      {particles.length > 0 && (
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-[38%] z-10">
          {particles.map((p) => (
            <span
              key={p.id}
              className="guide-particle absolute"
              style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--rot": `${p.rot}deg`, animationDelay: `${p.delay}ms` } as React.CSSProperties}
            >
              {p.char || <span className="block h-2.5 w-1.5 rounded-sm" style={{ background: p.color }} />}
            </span>
          ))}
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
        onPointerMove={rubMascot}
        onPointerEnter={() => emote([{ face: "giggle", emote: "♥", ms: 1400 }])}
        aria-label="Ask GlowSync AI about this service"
        className="guide-fly absolute left-0 top-0 z-40 rounded-full focus-visible:outline-2 focus-visible:outline-[#c9a24a]"
        style={{ transform: `translate(${mascotX}px, ${mascotY}px)`, ...follow }}
      >
        {mascot(MASCOT, side === "right")}
      </button>
    </>
  );
}
