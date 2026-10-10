"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  FileText,
  Gift,
  HelpCircle,
  MapPin,
  Send,
  Sparkles,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAssistantChat, type ServiceRecommendation } from "@/lib/hooks/useAssistantChat";
import GlowMascot, { type MascotFace, type MascotPose } from "@/components/GlowMascot";
import { CHAT_OVERLAY_EVENT } from "@/components/promos/PromoSideAd";
import BookPromoButton from "@/components/promos/BookPromoButton";
import { useBooking } from "@/components/booking/BookingContext";
import { pageHelpFor, pageHelpMessage } from "@/lib/pageHelp";
import { promoImage } from "@/lib/promoImage";
import { createClient } from "@/lib/supabase/client";
import { getActivePromotions, type ActivePromotion } from "@/lib/supabase/queries/publicContent";
import { GUIDE_FONTS, useMascotSize } from "@/components/guide/guideKit";
import { PlayfulMascot } from "@/components/guide/MascotPlay";

const PAGE_HELP_Q = "What can I do on this page?";
const TEASER_KEY = "glowy-teaser-dismissed";

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

/** Gold "shine" rays around the mascot. */
function Rays({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={`glowy-rays pointer-events-none absolute ${className}`}>
      <path d="M6 22l7-3M10 8l6 6M24 4l-1 8" stroke="#d4af37" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
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

export default function ChatWidget({ firstName = null }: { firstName?: string | null }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { open: openBooking } = useBooking();
  const mascotSize = useMascotSize();
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [promos, setPromos] = useState<ActivePromotion[] | null>(null);
  const [booking, setBooking] = useState(false); // a moment of joy after choosing Book
  const { messages, input, setInput, sending, send, answerLocally, containerRef } = useAssistantChat(greeting(firstName));

  // The greeting card pops out of the chat head shortly after the page loads.
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(TEASER_KEY) === "1";
    } catch {}
    if (dismissed) return;
    const t = setTimeout(() => setTeaser(true), 1800);
    return () => clearTimeout(t);
  }, []);

  // Today's promos load the first time the chat opens.
  useEffect(() => {
    if (!open || promos !== null) return;
    let cancelled = false;
    getActivePromotions(createClient(), 8)
      .then((list) => !cancelled && setPromos(list))
      .catch(() => !cancelled && setPromos([]));
    return () => {
      cancelled = true;
    };
  }, [open, promos]);

  // Let the promo pop-up step aside while the greeting card or chat is open.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CHAT_OVERLAY_EVENT, { detail: open || teaser }));
  }, [open, teaser]);

  useEffect(() => {
    const el = containerRef.current;
    if (el && messages.length > 1) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending, containerRef]);

  function dismissTeaser() {
    setTeaser(false);
    try {
      sessionStorage.setItem(TEASER_KEY, "1");
    } catch {}
  }

  function toggle() {
    dismissTeaser();
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

  // Greeting-card shortcuts (chat closed).
  const teaserActions: { label: string; icon: LucideIcon; run: () => void }[] = [
    { label: "Book Appointment", icon: CalendarDays, run: () => router.push("/services") },
    { label: "Check Reviews", icon: Star, run: () => router.push("/#reviews") },
    { label: "View Services", icon: FileText, run: () => router.push("/services") },
    { label: "Ask GlowSync AI", icon: HelpCircle, run: () => setOpen(true) },
  ];

  const conversation = messages.slice(1); // message 0 is the greeting, shown in the welcome card
  const lastReply = [...conversation].reverse().find((m) => m.role === "assistant");
  const recommending = !sending && !!lastReply?.recommendations?.length;

  // The mascot's state: welcoming, thinking, recommending or celebrating a booking.
  const headFace: MascotFace = booking ? "love" : sending ? "think" : recommending ? "excited" : "happy";
  const pose: MascotPose = booking ? "love" : sending ? "think" : recommending ? "present" : "wave";
  const status = booking ? "Booking it for you 💖" : sending ? "Thinking…" : recommending ? "Here's what I recommend" : "Your beauty concierge · Online";

  return (
    <div className={`fixed bottom-6 right-6 z-[60] flex flex-col items-end ${GUIDE_FONTS}`}>
      {open && (
        <div
          role="dialog"
          aria-label="GlowSync AI beauty concierge"
          className="glowy-pop fixed inset-0 z-[61] flex origin-bottom-right flex-col overflow-hidden bg-[#fffaf5] sm:static sm:mb-3 sm:h-[40rem] sm:max-h-[calc(100vh-7rem)] sm:w-[26rem] sm:rounded-[28px] sm:shadow-2xl sm:ring-1 sm:ring-[#e8d3a8]"
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

          <div ref={containerRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain scrollbar-hidden px-4 pb-4 pt-3">
            {/* Welcome: the mascot itself, not a chat bubble with an avatar pasted on */}
            <section className="flex items-end gap-2 rounded-3xl bg-gradient-to-br from-white via-[#fff8ee] to-[#fdf0f7] p-3 ring-1 ring-[#efdcc6]">
              <div className="relative shrink-0">
                <PlayfulMascot size={mascotSize} pose={pose} face={sending ? "think" : undefined} emote={sending ? "…" : undefined} talking={sending} label="Play with GlowSync AI" />
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className="guide-display guide-title text-[18px] leading-tight">Hi{firstName ? ` ${firstName}` : " there"}! 👋</p>
                <p className="mt-1 text-[13px] font-semibold leading-snug text-ink/75">
                  I&apos;m your beauty concierge ✨ Tell me your skin, hair or body goal — or tap one below.
                </p>
              </div>
            </section>

            {/* Quick actions */}
            <div className="grid grid-cols-3 gap-2">
              {quick.map(({ label, icon: Icon, run }) => (
                <button
                  key={label}
                  type="button"
                  onClick={run}
                  disabled={sending}
                  className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-1.5 py-2.5 text-center text-[11.5px] font-bold leading-tight text-ink/80 shadow-sm ring-1 ring-[#efdcc6] transition hover:-translate-y-0.5 hover:ring-[#d9b968] disabled:opacity-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#f6dc8e] to-[#d4a537] text-white shadow-sm">
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-[#efdcc6] bg-white p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask GlowSync AI anything…"
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

      {/* Greeting card from the chat head. */}
      {teaser && !open && (
        <div className="glowy-pop relative mb-4 mr-6 w-[calc(100vw-3rem)] max-w-[30rem] origin-bottom-right rounded-[2rem] bg-white p-4 shadow-2xl ring-1 ring-champagne/50">
          <button
            onClick={dismissTeaser}
            aria-label="Dismiss"
            className="absolute right-3 top-3 rounded-full p-1 text-ink/50 hover:bg-blush hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="relative shrink-0 rounded-[2rem] bg-gradient-to-br from-cream to-champagne/50 px-2 pt-2">
              <PlayfulMascot size={mascotSize} pose="wave" label="Play with GlowSync AI" />
              <Rays className="-right-3 -top-1 h-8 w-8 -scale-x-100" />
            </div>
            <div className="mr-6 min-w-0 flex-1 rounded-2xl bg-cream/70 px-4 py-3">
              <p className="text-xl font-bold text-ink">
                Hi{firstName ? ` ${firstName}` : " there"}! <span className="glowy-wave-emoji inline-block">👋</span>
              </p>
              <p className="mt-1 text-sm leading-snug text-ink/80">
                I&apos;m GlowSync AI! ✨<br />
                What can I help you with today?
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              dismissTeaser();
              explainPage();
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-2xl bg-gradient-to-r from-[#f7f0ff] to-[#fdf0f7] px-3 py-2.5 text-left text-sm font-semibold text-[#5b2d86] ring-1 ring-[#e3d6f7] transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#c49bff] to-[#8a4fd8] text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              New here? What can I do on {pageHelpFor(pathname).page === "this page" ? "this page" : `the ${pageHelpFor(pathname).page} page`}?
            </span>
          </button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {teaserActions.map(({ label, icon: Icon, run }) => (
              <button
                key={label}
                onClick={() => {
                  dismissTeaser();
                  run();
                }}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cream to-champagne/30 px-2.5 py-2 text-left text-sm font-medium text-ink transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-coral text-white">
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </button>
            ))}
          </div>

          {/* Tail pointing at the chat head. */}
          <svg viewBox="0 0 24 16" aria-hidden className="absolute -bottom-3.5 right-2 h-4 w-6">
            <path d="M0 0h24L22 16z" fill="#ffffff" />
          </svg>
        </div>
      )}

      {/* The launcher: GlowSync AI itself. Hidden on phones while the chat fills the screen. */}
      <div className={`relative ${open ? "hidden sm:block" : ""}`}>
        {!open && (
          <>
            <Rays className="-left-6 -top-3 h-9 w-9" />
            <Rays className="-right-6 -top-3 h-9 w-9 -scale-x-100" />
          </>
        )}
        <button
          onClick={toggle}
          aria-label={open ? "Close GlowSync AI" : "Chat with GlowSync AI"}
          className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#fff6dc] via-white to-[#f8e2ef] shadow-xl shadow-[#a8843a]/30 ring-[3px] ring-[#d9b968] transition hover:scale-105"
        >
          {teaser && !open && <span className="absolute inset-0 animate-ping rounded-full bg-[#d9b968]/40 motion-reduce:hidden" />}
          {open ? (
            <X className="h-7 w-7 text-[#a97c1c]" />
          ) : (
            <span className="glowy-bob">
              <GlowMascot size={54} blink />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
