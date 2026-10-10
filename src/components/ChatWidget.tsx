"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  CalendarPlus,
  Clock,
  Gift,
  HelpCircle,
  MapPin,
  Send,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAssistantChat, type ServiceRecommendation } from "@/lib/hooks/useAssistantChat";
import GlowMascot, { type MascotFace } from "@/components/GlowMascot";
import { CHAT_OVERLAY_EVENT } from "@/components/promos/PromoSideAd";
import BookPromoButton from "@/components/promos/BookPromoButton";
import { useBooking } from "@/components/booking/BookingContext";
import { pageHelpMessage } from "@/lib/pageHelp";
import { promoImage } from "@/lib/promoImage";
import { createClient } from "@/lib/supabase/client";
import { getActivePromotions, type ActivePromotion } from "@/lib/supabase/queries/publicContent";
import { GUIDE_FONTS, mascotWidth, useMascotSize } from "@/components/guide/guideKit";
import { MascotFigure, useMascotPlay } from "@/components/guide/MascotPlay";
import { buildBriefing, buildBubbles, type BriefingData, type Bubble, type Reminder } from "@/lib/welcomeBriefing";
import { loadWelcomeBriefing, spaToday } from "@/lib/supabase/queries/welcomeBriefing";
import { CHAT_PANEL_EVENT, FLIGHT_MS, GUIDE_ACTIVE_EVENT, OPEN_CHAT_EVENT, announce, type GuideActiveDetail, type ScreenRect } from "@/lib/glowEvents";

const PAGE_HELP_Q = "What can I do on this page?";
// Bubbles play once per sign-in (session), can be turned off (device), never
// repeat a promo already shown, and only celebrate points earned since last time.
const BUBBLES_SHOWN_KEY = "glowy-bubbles-shown";
const BUBBLES_OFF_KEY = "glowy-bubbles-off";
const SEEN_PROMOS_KEY = "glowy-seen-promos";
const LAST_POINTS_KEY = "glowy-last-points";

function readStore(store: "session" | "local", key: string): string | null {
  try {
    return (store === "session" ? sessionStorage : localStorage).getItem(key);
  } catch {
    return null;
  }
}
function writeStore(store: "session" | "local", key: string, value: string) {
  try {
    (store === "session" ? sessionStorage : localStorage).setItem(key, value);
  } catch {
    // Storage blocked — the bubbles simply may repeat.
  }
}

function greeting(firstName: string | null) {
  return `Hi${firstName ? ` ${firstName}` : " there"}! 👋 I'm GlowSync AI, your beauty concierge ✨ I can find the right treatment for you, show today's promos and branch info, and help you book.`;
}

export function TypingDots() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-2xl bg-blush px-3 py-2.5" aria-label="GlowSync AI is typing">
      <span className="glowy-dot h-1.5 w-1.5 rounded-full bg-coral-dark" />
      <span className="glowy-dot h-1.5 w-1.5 rounded-full bg-coral-dark [animation-delay:150ms]" />
      <span className="glowy-dot h-1.5 w-1.5 rounded-full bg-coral-dark [animation-delay:300ms]" />
    </div>
  );
}

/** A thought bubble beside the floating character: one short, real update. */
function ThoughtBubble({ b, onOpen, lift }: { b: Bubble; onOpen: () => void; /** px above the floor, beside the character's head */ lift: number }) {
  const body = (
    <>
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff6e6] text-lg ring-1 ring-[#f1dfb6]">
        {b.emoji}
      </span>
      <span className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-ink">{b.text}</span>
      {b.href && (
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff9fc8] to-[#e7679f] text-white shadow-sm">
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </>
  );
  const cls = `glowy-pop relative flex w-[min(17rem,calc(100vw-9rem))] origin-bottom-right items-center gap-2.5 rounded-[22px] bg-white px-3 py-2.5 text-left shadow-[0_18px_36px_-18px_rgba(168,132,58,0.7)] ring-2 ${b.important ? "ring-[#e8c766]" : "ring-[#f0dfc0]"} transition hover:-translate-y-0.5`;
  return (
    <div role="status" aria-live="polite" key={b.key} className="relative">
      {b.href ? (
        <Link href={b.href} onClick={onOpen} className={cls} style={{ marginBottom: lift }}>
          {body}
        </Link>
      ) : (
        <div className={cls} style={{ marginBottom: lift }}>{body}</div>
      )}
      {/* Thought-bubble dots toward the character */}
      <span aria-hidden className="absolute bottom-12 right-1 h-3 w-3 rounded-full bg-white ring-2 ring-[#f0dfc0]" />
      <span aria-hidden className="absolute bottom-9 -right-2 h-2 w-2 rounded-full bg-white ring-2 ring-[#f0dfc0]" />
    </div>
  );
}

/** The floating GlowSync character (default view). Tap to open the assistant;
 * drag it anywhere and it springs back to its corner when you let go. */
function FloatingCharacter({
  size,
  talking,
  onOpen,
  onDragging,
}: {
  size: number;
  talking: boolean;
  onOpen: () => void;
  onDragging: (dragging: boolean) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const play = useMascotPlay({ targetRef: ref });
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  function down(e: ReactPointerEvent<HTMLButtonElement>) {
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: ReactPointerEvent<HTMLButtonElement>) {
    const s = start.current;
    if (!s) return play.rub(e);
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!moved.current && Math.hypot(dx, dy) < 6) return;
    if (!moved.current) {
      moved.current = true;
      onDragging(true);
    }
    setOffset({ x: dx, y: dy });
  }
  function up() {
    start.current = null;
    if (!moved.current) return;
    // Spring back home, a little giggle on landing.
    setOffset(null);
    onDragging(false);
    window.setTimeout(() => play.emote([{ face: "giggle", emote: "♪", ms: 1200 }]), 500);
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Open GlowSync AI (you can also drag me)"
      onClick={() => {
        if (moved.current) {
          moved.current = false; // that was a drag, not a tap
          return;
        }
        play.tap();
        onOpen();
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerEnter={play.hover}
      style={{
        transform: offset ? `translate(${offset.x}px, ${offset.y}px) rotate(${Math.max(-12, Math.min(12, offset.x / 18))}deg)` : "none",
        transition: offset ? "none" : "transform 650ms cubic-bezier(0.3, 1.45, 0.5, 1)",
        touchAction: "none",
      }}
      className={`relative block rounded-full focus-visible:outline-2 focus-visible:outline-[#c9a24a] ${offset ? "cursor-grabbing" : "cursor-grab"}`}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-2 bottom-2 top-6 rounded-full bg-[radial-gradient(circle,rgba(255,214,140,0.45),transparent_70%)]" />
      <MascotFigure
        play={play}
        size={size}
        pose={offset ? "fly" : talking ? "wave" : "present"}
        face={offset ? "surprised" : undefined}
        emote={offset ? "!" : undefined}
        motion={offset ? "guide-moving" : undefined}
        talking={talking}
      />
    </button>
  );
}

type Flight = { id: number; from: ScreenRect; to: ScreenRect };

/** The character flying between its corner and the Services guide, along an arc. */
function Flyer({ flight, size, onDone }: { flight: Flight; size: number; onDone: () => void }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setGo(true));
    });
    const t = window.setTimeout(onDone, FLIGHT_MS + 80);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      window.clearTimeout(t);
    };
  }, [onDone]);
  const p = go ? flight.to : flight.from;
  const scale = go ? flight.to.h / size : flight.from.h / size;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[59]"
      style={{ transform: `translateX(${p.x}px)`, transition: `transform ${FLIGHT_MS}ms cubic-bezier(0.45, 0, 0.25, 1)` }}
    >
      {/* A different easing up/down than left/right draws a gentle arc. */}
      <div style={{ transform: `translateY(${p.y}px)`, transition: `transform ${FLIGHT_MS}ms cubic-bezier(0.3, -0.45, 0.45, 1)` }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", transition: `transform ${FLIGHT_MS}ms ease-in-out` }}>
          <span className="guide-moving relative block drop-shadow-[0_14px_16px_rgba(120,90,30,0.3)]">
            <GlowMascot size={size} full pose="fly" face="excited" />
            <span className="guide-sparkle absolute -left-3 top-1/2 text-lg">✨</span>
            <span className="guide-sparkle absolute -left-6 top-1/3 text-sm [animation-delay:150ms]">✨</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** One "welcome back" reminder: what needs attention, with a link to it. */
function ReminderRow({ r, onGo, compact = false }: { r: Reminder; onGo: () => void; compact?: boolean }) {
  const urgent = r.kind === "today" || r.kind === "pending";
  return (
    <Link
      href={r.href}
      onClick={onGo}
      className={`group flex items-center gap-2.5 rounded-2xl px-3 ${compact ? "py-1.5" : "py-2.5"} ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${
        urgent ? "bg-gradient-to-r from-[#fff4dc] to-[#fff0f7] ring-[#e8c766]" : "bg-white ring-[#efdcc6]"
      }`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#fff6e6] ring-1 ring-[#f1dfb6] ${compact ? "h-8 w-8 text-base" : "h-9 w-9 text-lg"}`} aria-hidden>
        {r.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold leading-snug text-ink">{r.title}</span>
        <span className={`text-xs leading-snug text-ink/60 ${compact ? "line-clamp-1" : "line-clamp-2"}`}>{r.detail}</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-[#a97c1c]">
        {!compact && r.cta}
        <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** A treatment GlowSync AI recommended: real price and time, straight to booking. */
function RecommendationCard({ s, onBook }: { s: ServiceRecommendation; onBook: (s: ServiceRecommendation) => void }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-[#efdcc6]">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#a97c1c]">{s.category}</p>
      <p className="guide-display text-[15px] font-semibold leading-snug text-ink">{s.name}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink/65">
        <span className="font-bold text-[#a97c1c]">{s.priceLabel ?? `₱${s.price.toLocaleString()}`}</span>
        {s.duration && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {s.duration}
          </span>
        )}
      </div>
      {s.description && <p className="mt-1 line-clamp-2 text-xs leading-snug text-ink/55">{s.description}</p>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onBook(s)}
          className="flex items-center justify-center gap-1 rounded-full bg-gradient-to-br from-[#e9bc4c] to-[#c58d1d] py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:brightness-105"
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Book
        </button>
        <Link
          href={`/services/${s.id}`}
          className="flex items-center justify-center rounded-full border-[1.5px] border-[#d9b968] py-1.5 text-xs font-extrabold text-ink/75 transition hover:bg-[#fffaf3]"
        >
          Details
        </Link>
      </div>
    </div>
  );
}

/** Today's real promos, from Admin → Promotions. */
function PromoStrip({ promos }: { promos: ActivePromotion[] | null }) {
  if (promos && promos.length === 0) return null;
  return (
    <section aria-label="Today's promos" className="space-y-2">
      <p className="flex items-center gap-1.5 px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a97c1c]">
        <Gift className="h-3.5 w-3.5" /> Today&apos;s promos
      </p>
      <div className="scrollbar-hidden -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1">
        {promos === null
          ? [0, 1].map((i) => <div key={i} className="h-44 w-52 shrink-0 animate-pulse rounded-2xl bg-[#f6ead8]" />)
          : promos.map((p) => (
              <article key={p.id} className="w-52 shrink-0 snap-start overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#efdcc6]">
                <Link href={`/promos/${p.id}`} className="block">
                  <span className="relative block h-20">
                    <Image src={promoImage(p)} alt="" fill sizes="208px" className="object-cover" />
                    <span className="absolute inset-0 bg-gradient-to-t from-[#2b1a10]/60 to-transparent" />
                    <span className="absolute bottom-1.5 left-2 max-w-[90%] truncate rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#a97c1c]">
                      {p.badge ?? p.branchName}
                    </span>
                  </span>
                  <span className="block px-3 pt-2">
                    <span className="line-clamp-2 block text-[13px] font-semibold leading-snug text-ink">{p.title}</span>
                    {p.price != null && <span className="mt-0.5 block text-xs font-bold text-[#a97c1c]">₱{Number(p.price).toLocaleString()}</span>}
                  </span>
                </Link>
                <div className="px-3 pb-3 pt-2">
                  <BookPromoButton
                    promoId={p.id}
                    fallbackHref={p.category ? `/services?category=${encodeURIComponent(p.category)}` : "/services"}
                    className="flex w-full items-center justify-center gap-1 rounded-full bg-gradient-to-br from-[#e9bc4c] to-[#c58d1d] py-1.5 text-xs font-extrabold text-white [&>svg]:h-3.5 [&>svg]:w-3.5"
                  />
                </div>
              </article>
            ))}
      </div>
    </section>
  );
}

export default function ChatWidget({ userId = null, firstName = null }: { userId?: string | null; firstName?: string | null }) {
  const pathname = usePathname() ?? "/";
  const { open: openBooking } = useBooking();
  const mascotSize = useMascotSize();
  const [open, setOpen] = useState(false);
  const [promos, setPromos] = useState<ActivePromotion[] | null>(null);
  const [booking, setBooking] = useState(false); // a moment of joy after choosing Book
  // "Welcome back" reminders from the client's account (null while loading).
  const [reminders, setReminders] = useState<Reminder[] | null>(null);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  // On the Services page the guide on the cards *is* GlowSync AI: while it's on
  // screen this character steps aside (and flies back when it isn't).
  const [guideActive, setGuideActive] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [dragging, setDragging] = useState(false);
  const endFlight = useCallback(() => setFlight(null), []);
  // Where the character sits in its corner (matches the wrapper's bottom/right spacing).
  const cornerRect = useCallback((): ScreenRect => {
    const w = mascotWidth(mascotSize), h = mascotSize, gap = window.innerWidth >= 640 ? 16 : 12;
    return { x: window.innerWidth - gap - w, y: window.innerHeight - gap - h, w, h };
  }, [mascotSize]);
  // The service the client is asking about (from the guide's "Ask a question").
  const [topic, setTopic] = useState<string | null>(null);
  const who = userId ?? "guest";
  // Bubble state: which one is showing, whether they're on, and whether they already played this sign-in.
  const [bubbleIdx, setBubbleIdx] = useState(0);
  const [bubblesOff, setBubblesOff] = useState(() => typeof window !== "undefined" && readStore("local", `${BUBBLES_OFF_KEY}:${who}`) === "1");
  const [alreadyShown] = useState(() => typeof window !== "undefined" && readStore("session", `${BUBBLES_SHOWN_KEY}:${who}`) === "1");
  const [lastPoints] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = readStore("local", `${LAST_POINTS_KEY}:${who}`);
    return v === null ? null : Number(v);
  });
  const [seenPromos] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(readStore("local", `${SEEN_PROMOS_KEY}:${who}`) ?? "[]");
    } catch {
      return [];
    }
  });
  const { messages, input, setInput, sending, send, answerLocally, containerRef } = useAssistantChat(greeting(firstName));

  // What needs their attention: bookings, notifications, reviews, vouchers, points.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadWelcomeBriefing(createClient(), userId)
      .then((data) => {
        if (cancelled) return;
        setBriefing(data);
        setReminders(buildBriefing(data, spaToday()));
      })
      .catch(() => !cancelled && setReminders([]));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Today's promos: for a "new offer" bubble, and the chat's promo strip.
  useEffect(() => {
    if ((!open && !userId) || promos !== null) return;
    let cancelled = false;
    getActivePromotions(createClient(), 8)
      .then((list) => !cancelled && setPromos(list))
      .catch(() => !cancelled && setPromos([]));
    return () => {
      cancelled = true;
    };
  }, [open, userId, promos]);

  // The bubbles: a welcome, then real updates, earned points and one new promo.
  const bubbles = useMemo(() => {
    if (!userId || !reminders || !briefing || promos === null) return [];
    const gained = lastPoints === null ? 0 : Math.max(0, briefing.points - lastPoints);
    const promo = promos.find((p) => !seenPromos.includes(p.id)) ?? null;
    return buildBubbles({ firstName, reminders, pointsGained: gained, promo: promo && { id: promo.id, title: promo.title } });
  }, [userId, reminders, briefing, promos, lastPoints, seenPromos, firstName]);
  const bubble = !open && !guideActive && !flight && !dragging && !bubblesOff && !alreadyShown ? bubbles[bubbleIdx] ?? null : null;

  useEffect(() => {
    const onGuide = (e: Event) => {
      const d = (e as CustomEvent<GuideActiveDetail>).detail;
      setGuideActive((was) => {
        // Fly between the corner and the guide (computers, when motion is welcome).
        if (was !== d.active && d.rect && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const corner = cornerRect();
          setFlight({ id: Date.now(), from: d.active ? corner : d.rect, to: d.active ? d.rect : corner });
        }
        return d.active;
      });
    };
    const onOpenChat = (e: Event) => {
      e.preventDefault(); // tells the guide the chat handled it
      const t = (e as CustomEvent<{ topic?: string }>).detail?.topic;
      setTopic(t ?? null);
      setOpen(true);
    };
    window.addEventListener(GUIDE_ACTIVE_EVENT, onGuide);
    window.addEventListener(OPEN_CHAT_EVENT, onOpenChat);
    return () => {
      window.removeEventListener(GUIDE_ACTIVE_EVENT, onGuide);
      window.removeEventListener(OPEN_CHAT_EVENT, onOpenChat);
    };
  }, [cornerRect]);

  // Tell the guide when the chat opens or closes.
  useEffect(() => {
    announce(CHAT_PANEL_EVENT, open);
  }, [open]);

  // Remember today's points so only new ones are celebrated next time.
  useEffect(() => {
    if (briefing) writeStore("local", `${LAST_POINTS_KEY}:${who}`, String(briefing.points));
  }, [briefing, who]);

  // Each bubble shows for a few seconds, then the next one; a shown promo is never repeated.
  useEffect(() => {
    if (!bubble) return;
    if (bubble.key.startsWith("promo:")) {
      writeStore("local", `${SEEN_PROMOS_KEY}:${who}`, JSON.stringify([...seenPromos, bubble.key.slice(6)].slice(-50)));
    }
    const t = window.setTimeout(() => {
      setBubbleIdx((i) => i + 1);
      if (bubbleIdx + 1 >= bubbles.length) writeStore("session", `${BUBBLES_SHOWN_KEY}:${who}`, "1");
    }, bubble.ms);
    return () => window.clearTimeout(t);
  }, [bubble, bubbleIdx, bubbles.length, seenPromos, who]);

  /** Stop the bubbles for this sign-in (e.g. once the client opens the assistant). */
  function finishBubbles() {
    setBubbleIdx(bubbles.length);
    writeStore("session", `${BUBBLES_SHOWN_KEY}:${who}`, "1");
  }

  function setBubbles(on: boolean) {
    setBubblesOff(!on);
    writeStore("local", `${BUBBLES_OFF_KEY}:${who}`, on ? "0" : "1");
  }

  // Let the promo pop-up step aside while the greeting card or chat is open.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CHAT_OVERLAY_EVENT, { detail: open || !!bubble }));
  }, [open, bubble]);

  useEffect(() => {
    const el = containerRef.current;
    if (el && messages.length > 1) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending, containerRef]);

  function toggle() {
    finishBubbles();
    setOpen((o) => !o);
  }

  /** Answers "What can I do on this page?" instantly from the page guide. */
  function explainPage() {
    setOpen(true);
    answerLocally(PAGE_HELP_Q, pageHelpMessage(pathname));
  }

  function bookService(s: ServiceRecommendation) {
    setBooking(true);
    window.setTimeout(() => {
      setBooking(false);
      setOpen(false);
      openBooking({ name: s.name, duration: s.duration ?? "", price: s.price, preselect: true, category: s.category });
    }, 650);
  }

  function bookAnything() {
    setOpen(false);
    openBooking({ name: "", duration: "", price: 0 });
  }

  // Quick actions inside the chat.
  const quick: { label: string; icon: LucideIcon; run: () => void }[] = [
    { label: "Find a treatment", icon: Sparkles, run: () => send("Can you recommend a treatment for me?") },
    { label: "Promotions", icon: Gift, run: () => send("What promos are running right now?") },
    { label: "Branches & hours", icon: MapPin, run: () => send("Where are your branches and what are the hours today?") },
    { label: "Book now", icon: CalendarPlus, run: bookAnything },
    { label: "My bookings", icon: CalendarDays, run: () => send("When is my next booking?") },
    { label: "Help with this page", icon: HelpCircle, run: explainPage },
  ];

  const conversation = messages.slice(1); // message 0 is the greeting, shown in the welcome card
  const lastReply = [...conversation].reverse().find((m) => m.role === "assistant");
  const recommending = !sending && !!lastReply?.recommendations?.length;

  // The mascot's state: welcoming, thinking, recommending or celebrating a booking.
  const headFace: MascotFace = booking ? "love" : sending ? "think" : recommending ? "excited" : "happy";
  const status = booking ? "Booking it for you 💖" : sending ? "Thinking…" : recommending ? "Here's what I recommend" : "Your beauty concierge · Online";

  return (
    <div className={`fixed bottom-3 right-3 z-[60] flex flex-col items-end sm:bottom-4 sm:right-4 ${GUIDE_FONTS}`}>
      {open && (
        <div
          role="dialog"
          aria-label="GlowSync AI beauty concierge"
          className="glowy-pop fixed inset-0 z-[61] flex origin-bottom-right flex-col overflow-hidden bg-[#fffaf5] sm:static sm:h-[min(38rem,calc(100dvh-2rem))] sm:w-[24rem] sm:rounded-[28px] sm:shadow-2xl sm:ring-1 sm:ring-[#e8d3a8]"
          style={{ fontFamily: "var(--font-guide-body), system-ui, sans-serif" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-[#d8ab45] via-[#c99a33] to-[#a97c1c] px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <span className="glowy-bob rounded-full bg-white/95 p-0.5 shadow-sm">
                <GlowMascot size={40} face={headFace} talking={sending} blink />
              </span>
              <div>
                <p className="guide-display text-[17px] font-semibold leading-tight">GlowSync AI</p>
                <p className="flex items-center gap-1.5 text-xs text-white/90">
                  <span className={`h-2 w-2 rounded-full ${sending ? "animate-pulse bg-[#ffe9a8]" : "bg-[#7ddc8f]"}`} /> {status}
                </p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-1.5 hover:bg-white/20">
              <X className="h-6 w-6" />
            </button>
          </div>

          <div ref={containerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain scrollbar-hidden px-3.5 pb-4 pt-3">
            {/* Welcome: the mascot itself, not a chat bubble with an avatar pasted on */}
            <section className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-white via-[#fff8ee] to-[#fdf0f7] p-3 ring-1 ring-[#efdcc6]">
              <span className="glowy-bob flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#fff4d6] to-[#f8e2ef] ring-2 ring-[#ecd39a]">
                <GlowMascot size={54} face={headFace} talking={sending} blink />
              </span>
              <div className="min-w-0 flex-1">
                <p className="guide-display guide-title text-[17px] leading-tight">Hi{firstName ? ` ${firstName}` : " there"}! 👋</p>
                <p className="mt-0.5 text-[12.5px] font-semibold leading-snug text-ink/70">
                  I&apos;m your beauty concierge ✨ Tell me your goal, or tap one below.
                </p>
              </div>
            </section>

            {reminders && reminders.length > 0 && (
              <section aria-label="Your reminders" className="space-y-2">
                <p className="px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a97c1c]">Your reminders</p>
                {reminders.slice(0, 2).map((r) => (
                  <ReminderRow key={r.kind} r={r} compact onGo={() => setOpen(false)} />
                ))}
              </section>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-3 gap-2">
              {quick.map(({ label, icon: Icon, run }) => (
                <button
                  key={label}
                  type="button"
                  onClick={run}
                  disabled={sending}
                  className="flex flex-col items-center gap-1 rounded-2xl bg-white px-1 py-2 text-center text-[11px] font-bold leading-tight text-ink/80 shadow-sm ring-1 ring-[#efdcc6] transition hover:-translate-y-0.5 hover:ring-[#d9b968] disabled:opacity-50"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#f6dc8e] to-[#d4a537] text-white shadow-sm">
                    <Icon className="h-4 w-4" />
                  </span>
                  {label}
                </button>
              ))}
            </div>

            <PromoStrip promos={promos} />

            {/* Conversation */}
            {conversation.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="glowy-msg ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-sm bg-gradient-to-br from-[#e2b44a] to-[#c58d1d] px-3 py-2 text-sm font-semibold text-white">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="glowy-msg space-y-2">
                  <div className="flex items-end gap-2">
                    <GlowMascot size={28} face={m.recommendations?.length ? "excited" : "happy"} />
                    <div className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm leading-relaxed text-ink shadow-sm ring-1 ring-[#efdcc6]">
                      {m.content}
                    </div>
                  </div>
                  {m.recommendations && m.recommendations.length > 0 && (
                    <div className="space-y-2 pl-9">
                      {m.recommendations.map((s) => (
                        <RecommendationCard key={s.id} s={s} onBook={bookService} />
                      ))}
                    </div>
                  )}
                </div>
              )
            )}

            {/* Only while a reply is actually on its way. */}
            {sending && (
              <div className="flex items-end gap-2">
                <GlowMascot size={28} face="think" talking />
                <TypingDots />
              </div>
            )}
          </div>

          {userId && (
            <label className="flex cursor-pointer items-center justify-between gap-2 border-t border-[#efdcc6] bg-[#fffaf3] px-4 py-2 text-[11.5px] font-semibold text-ink/60">
              <span>💬 Show updates as bubbles beside me</span>
              <input
                type="checkbox"
                checked={!bubblesOff}
                onChange={(e) => setBubbles(e.target.checked)}
                className="h-4 w-4 accent-[#c9a24a]"
              />
            </label>
          )}

          {topic && (
            <div className="flex items-center justify-between gap-2 border-t border-[#efdcc6] bg-[#f7f0ff] px-4 py-1.5 text-[12px] font-semibold text-[#5b2d86]">
              <span className="min-w-0 truncate">✨ Asking about {topic}</span>
              <button type="button" onClick={() => setTopic(null)} aria-label="Stop asking about this service" className="shrink-0 rounded-full p-0.5 hover:bg-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = input.trim();
              if (!q) return;
              send(topic ? `About "${topic}": ${q}` : q);
            }}
            className="flex items-center gap-2 border-t border-[#efdcc6] bg-white p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={topic ? `Ask about ${topic}…` : "Ask GlowSync AI anything…"}
              aria-label="Message GlowSync AI"
              className="flex-1 rounded-full border border-[#e3cfa6] bg-[#fffaf3] px-4 py-2.5 text-sm outline-none transition focus:border-[#c9a24a] focus:bg-white focus:ring-4 focus:ring-[#d9b968]/20"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#f3d98b] to-[#c9a24a] text-white shadow-sm transition hover:brightness-105 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {/* Default view: just the small GlowSync character, with a thought bubble now and then. */}
      {flight && !open && <Flyer key={flight.id} flight={flight} size={mascotSize} onDone={endFlight} />}
      <div className={`flex items-end gap-1 ${open ? "hidden" : guideActive || flight ? "invisible" : ""}`}>
        {bubble && <ThoughtBubble b={bubble} onOpen={finishBubbles} lift={Math.round(mascotSize * 0.48)} />}
        <FloatingCharacter size={mascotSize} talking={!!bubble} onOpen={toggle} onDragging={setDragging} />
      </div>
    </div>
  );
}
