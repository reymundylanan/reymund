"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Fredoka, Nunito } from "next/font/google";

// Shared pieces of GlowSync AI's speech bubbles (Services guide, Meet the Team).

// Rounded, friendly faces for the speech bubble.
const guideDisplay = Fredoka({ subsets: ["latin"], variable: "--font-guide-display" });
const guideBody = Nunito({ subsets: ["latin"], variable: "--font-guide-body" });
export const GUIDE_FONTS = `${guideDisplay.variable} ${guideBody.variable}`;

/** The full-body mascot's height everywhere: computers and phones. */
export const MASCOT_DESKTOP = 208;
export const MASCOT_PHONE = 112;
/** Its width at a given height (the full body is 120 × 152). */
export const mascotWidth = (h: number) => Math.round((h * 120) / 152);

const WIDE = "(min-width: 1024px)";
function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** MASCOT_DESKTOP on computers, MASCOT_PHONE on phones and tablets. */
export function useMascotSize(): number {
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  return wide ? MASCOT_DESKTOP : MASCOT_PHONE;
}

/** Like the Services guide: when the guide's spot moves to another card it
 * glides there (`.guide-fly`), wiggling, with the text hidden until it lands.
 * Call `note(pos)` whenever the position is (re)measured. */
export function useGuideTravel(ms = 900) {
  const [moving, setMoving] = useState(false);
  const last = useRef<{ left: number; top: number } | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const note = useCallback(
    (p: { left: number; top: number } | null) => {
      const prev = last.current;
      last.current = p;
      if (!p || !prev || (Math.abs(prev.left - p.left) < 3 && Math.abs(prev.top - p.top) < 3)) return;
      setMoving(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setMoving(false), ms);
    },
    [ms]
  );
  return { moving, note };
}

/** Types its text out like the mascot is speaking. Remount (key) to replay. */
export function TypeText({ text, onDone }: { text: string; onDone?: () => void }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = window.setTimeout(() => {
        setShown(text.length);
        onDone?.();
      }, 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setInterval(() => {
      setShown((n) => {
        if (n + 1 >= text.length) {
          window.clearInterval(id);
          onDone?.();
        }
        return Math.min(n + 1, text.length);
      });
    }, 22);
    return () => window.clearInterval(id);
  }, [text, onDone]);
  return (
    <>
      <span>{text.slice(0, shown)}</span>
      {shown < text.length && <span aria-hidden className="guide-caret" />}
      {/* Screen readers get the whole line at once. */}
      <span className="sr-only">{text}</span>
    </>
  );
}
