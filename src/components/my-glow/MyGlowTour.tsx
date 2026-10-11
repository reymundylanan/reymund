"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Compass, X } from "lucide-react";
import { GUIDE_FONTS, TypeText } from "@/components/guide/guideKit";
import { PlayfulMascot } from "@/components/guide/MascotPlay";
import { hasSeenMyGlowTour, markMyGlowTourSeen } from "@/lib/myGlowIntro";

type Stop = { target: string | null; title: string; text: string };

const stops = (firstName: string): Stop[] => [
  {
    target: null,
    title: `Welcome to My Glow, ${firstName}!`,
    text: "This is your personal page — your bookings, visit records, reviews and rewards all live here. Let me show you around in a few quick steps.",
  },
  {
    target: "upcoming",
    title: "Your next visit",
    text: "Your next booking shows here: date, time, branch and its status. New bookings say Pending until the front desk confirms them.",
  },
  {
    target: "services",
    title: "Your visit records",
    text: "Every treatment you've had is kept here. When a visit is completed, tap “Rate & Review” on it to tell us how it went.",
  },
  {
    target: "rewards",
    title: "GlowPoints & vouchers",
    text: "Each genuine review earns GlowPoints. Trade them for vouchers here, and the front desk applies them when you pay.",
  },
  {
    target: "reviews",
    title: "Your reviews",
    text: "Every review you've written is saved here, so you can look back at it any time.",
  },
  {
    target: "my-bookings",
    title: "All your bookings",
    text: "Every booking — upcoming and past — with its status and payment. To change one, call or message your branch.",
  },
  {
    target: "assistant",
    title: "Ask me anything",
    text: "I'm always here! Ask about your bookings, get a treatment suggestion, or check today's promos. You'll find My Glow any time in the top menu.",
  },
];

/** GlowSync AI's guided tour of My Glow: opens by itself on a client's first
 * visit (or with ?tour=1 from the booking screen); "Take the tour" replays it. */
export default function MyGlowTour({ userId, firstName }: { userId: string; firstName: string }) {
  const STOPS = stops(firstName);
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const ask = new URLSearchParams(window.location.search).get("tour") === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first visit is only known in the browser
    if (ask || !hasSeenMyGlowTour(userId)) setIndex(0);
  }, [userId]);

  const stop = index != null ? STOPS[index] : null;
  const target = stop?.target ?? null;

  const measure = useCallback(() => {
    const el = target ? document.getElementById(target) : null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [target]);

  // Bring the section into view and keep the highlight on it while scrolling.
  useEffect(() => {
    if (index == null) return;
    const el = target ? document.getElementById(target) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    const id = requestAnimationFrame(measure);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [index, target, measure]);

  const finish = useCallback(() => {
    markMyGlowTourSeen(userId);
    setIndex(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("tour")) {
      url.searchParams.delete("tour");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, [userId]);

  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setIndex((i) => (i != null && i < STOPS.length - 1 ? i + 1 : i));
      if (e.key === "ArrowLeft") setIndex((i) => (i != null && i > 0 ? i - 1 : i));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, finish, STOPS.length]);

  const last = index === STOPS.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setIndex(0)}
        className="flex items-center gap-1.5 rounded-full border border-coral/60 bg-[#fff8e8] px-4 py-1.5 text-sm font-semibold text-coral-dark shadow-sm transition hover:bg-coral hover:text-white"
      >
        <Compass className="h-4 w-4" aria-hidden /> Take the tour
      </button>

      {stop &&
        index != null &&
        createPortal(
          <div className={`fixed inset-0 z-[90] ${GUIDE_FONTS}`} role="dialog" aria-modal="true" aria-label="My Glow tour">
            {/* Dim the page, with a window cut out around the section being explained. */}
            {rect ? (
              <div
                aria-hidden
                className="pointer-events-none fixed rounded-3xl border-4 border-[#e9bc4c] transition-all duration-300"
                style={{
                  left: rect.left - 8,
                  top: rect.top - 8,
                  width: rect.width + 16,
                  height: rect.height + 16,
                  boxShadow: "0 0 0 9999px rgba(43,26,16,0.55)",
                }}
              />
            ) : (
              <div aria-hidden className="fixed inset-0 bg-[#2b1a10]/55" onClick={finish} />
            )}

            <div className="fixed inset-x-3 bottom-3 mx-auto max-w-xl sm:bottom-6">
              <div key={index} className="guide-bubble glowy-pop">
                <div className="guide-bubble-inner relative flex gap-3 p-4">
                  <button
                    type="button"
                    onClick={finish}
                    aria-label="Close the tour"
                    className="absolute right-3 top-3 rounded-full p-1 text-ink/45 transition hover:bg-ink/5 hover:text-ink"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="relative hidden shrink-0 self-end sm:block">
                    <PlayfulMascot size={128} pose={index === 0 ? "wave" : last ? "present" : "point"} label="Play with GlowSync AI" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2 pr-5">
                    <p className="guide-rise flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a97c1c]">
                      <span aria-hidden className="guide-live-dot" />
                      GlowSync AI · {index === 0 ? "My Glow tour" : `Step ${index} of ${STOPS.length - 1}`}
                    </p>
                    <p className="guide-rise guide-display guide-title text-[19px] leading-tight">{stop.title}</p>
                    <p className="guide-rise min-h-[4.5rem] text-[14px] font-semibold leading-relaxed text-ink/85">
                      <TypeText key={index} text={stop.text} />
                    </p>
                    <div className="guide-rise flex flex-wrap items-center gap-2 pt-1">
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => setIndex(index - 1)}
                          className="rounded-full border-[1.5px] border-[#d9b968] bg-white px-4 py-1.5 text-xs font-extrabold text-ink/80 transition hover:-translate-y-0.5"
                        >
                          ← Back
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => (last ? finish() : setIndex(index + 1))}
                        className="rounded-full bg-gradient-to-br from-[#e9bc4c] to-[#c58d1d] px-5 py-1.5 text-xs font-extrabold text-white shadow-[0_8px_16px_-8px_rgba(169,124,28,0.8)] transition hover:-translate-y-0.5 hover:brightness-105"
                      >
                        {index === 0 ? "Show me around" : last ? "Got it!" : "Next →"}
                      </button>
                      {!last && (
                        <button type="button" onClick={finish} className="ml-auto text-xs font-semibold text-ink/50 hover:text-ink">
                          Skip tour
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
