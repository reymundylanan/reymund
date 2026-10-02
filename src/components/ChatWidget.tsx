"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileText, HelpCircle, Send, Star, X, type LucideIcon } from "lucide-react";
import { useAssistantChat } from "@/lib/hooks/useAssistantChat";
import GlowMascot from "@/components/GlowMascot";
import { CHAT_OVERLAY_EVENT } from "@/components/promos/PromoSideAd";

const QUICK_REPLIES = ["Recommend a treatment", "Prices & promos", "Branch hours", "My bookings"];
const TEASER_KEY = "glowy-teaser-dismissed";

/** One greeting line per bubble; the intro "types" them out one by one. */
function greetingLines(firstName: string | null) {
  return [
    `Hi${firstName ? ` ${firstName}` : " there"}! 👋 I'm GlowSync AI ✨`,
    "I can recommend treatments, check prices and promos, or help with your bookings.",
    "What can I help you with today?",
  ];
}

function TypingDots() {
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

export default function ChatWidget({ firstName = null }: { firstName?: string | null }) {
  const router = useRouter();
  const lines = greetingLines(firstName);
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  // How many greeting lines are visible; the intro plays the first time it opens.
  const [shown, setShown] = useState(0);
  const { messages, input, setInput, sending, send, containerRef } = useAssistantChat(lines.join("\n"));

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

  useEffect(() => {
    if (!open || shown >= lines.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 700 : 1100);
    return () => clearTimeout(t);
  }, [open, shown, lines.length]);

  // Let the promo pop-up step aside while the greeting card or chat is open.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CHAT_OVERLAY_EVENT, { detail: open || teaser }));
  }, [open, teaser]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, messages.length, sending, containerRef]);

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

  const actions: { label: string; icon: LucideIcon; run: () => void }[] = [
    { label: "Book Appointment", icon: CalendarDays, run: () => router.push("/services") },
    { label: "Check Reviews", icon: Star, run: () => router.push("/#reviews") },
    { label: "View Services", icon: FileText, run: () => router.push("/services") },
    { label: "Other Questions", icon: HelpCircle, run: () => setOpen(true) },
  ];

  const introDone = shown >= lines.length;
  const typing = (open && !introDone) || sending;
  const userHasSpoken = messages.some((m) => m.role === "user");

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end">
      {open && (
        <div className="glowy-pop mb-3 flex h-[36rem] max-h-[calc(100vh-8rem)] w-[calc(100vw-3rem)] max-w-96 origin-bottom-right flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-champagne/60">
          <div className="flex items-center justify-between bg-gradient-to-r from-coral to-coral-dark px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-white/95 p-0.5 shadow-sm">
                <GlowMascot size={38} talking={typing} />
              </span>
              <div>
                <p className="text-base font-bold leading-tight tracking-wide">GlowSync AI</p>
                <p className="flex items-center gap-1.5 text-xs text-white/85">
                  <span className="h-2 w-2 rounded-full bg-[#7ddc8f]" /> Blush Assistant · Online
                </p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-1 hover:bg-white/20">
              <X className="h-6 w-6" />
            </button>
          </div>

          <div ref={containerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain scrollbar-hidden bg-cream/40 p-4">
            {lines.slice(0, shown).map((line, i) => (
              <div key={`g${i}`} className="glowy-msg flex items-end gap-2">
                <span className={i === shown - 1 ? "" : "invisible"}>
                  <GlowMascot size={28} />
                </span>
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-blush px-3 py-2 text-sm text-ink">{line}</div>
              </div>
            ))}

            {introDone && !userHasSpoken && (
              <div className="glowy-msg flex flex-wrap gap-2 pl-9">
                {QUICK_REPLIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    disabled={sending}
                    className="rounded-full border border-coral/50 bg-white px-3 py-1.5 text-xs font-medium text-coral-dark transition hover:-translate-y-0.5 hover:bg-blush disabled:opacity-40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* The greeting (message 0) is shown above as separate bubbles. */}
            {messages.slice(1).map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="glowy-msg ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-coral px-3 py-2 text-sm text-white">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="glowy-msg flex items-end gap-2">
                  <GlowMascot size={28} />
                  <div className="max-w-[80%] whitespace-pre-line rounded-2xl rounded-bl-sm bg-blush px-3 py-2 text-sm text-ink">{m.content}</div>
                </div>
              )
            )}

            {typing && (
              <div className="flex items-end gap-2">
                <GlowMascot size={28} talking />
                <TypingDots />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-ink/10 bg-white p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask GlowSync AI anything..."
              className="flex-1 rounded-full border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
            <button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="rounded-full bg-coral p-2.5 text-white hover:bg-coral-dark disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Greeting card from the chat head. */}
      {teaser && !open && (
        <div className="glowy-pop relative mb-4 mr-6 w-[calc(100vw-3rem)] max-w-[26rem] origin-bottom-right rounded-[2rem] bg-white p-4 shadow-2xl ring-1 ring-champagne/50">
          <button
            onClick={dismissTeaser}
            aria-label="Dismiss"
            className="absolute right-3 top-3 rounded-full p-1 text-ink/50 hover:bg-blush hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="relative shrink-0 rounded-full bg-gradient-to-br from-cream to-champagne/50 p-1">
              <span className="glowy-bob">
                <GlowMascot size={96} full />
              </span>
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

          <div className="mt-3 grid grid-cols-2 gap-2">
            {actions.map(({ label, icon: Icon, run }) => (
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

      <div className="relative">
        {!open && (
          <>
            <Rays className="-left-6 -top-3 h-9 w-9" />
            <Rays className="-right-6 -top-3 h-9 w-9 -scale-x-100" />
          </>
        )}
        <button
          onClick={toggle}
          aria-label={open ? "Close GlowSync AI" : "Chat with GlowSync AI"}
          className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#f3d98b] via-coral to-coral-dark shadow-xl shadow-[#a8843a]/30 ring-4 ring-white transition hover:scale-105"
        >
          {teaser && !open && <span className="absolute inset-0 animate-ping rounded-full bg-coral/40 motion-reduce:hidden" />}
          {open ? (
            <X className="h-7 w-7 text-white" />
          ) : (
            <span className="glowy-bob">
              <GlowMascot size={50} />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
