"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Shared pieces of GlowSync AI's speech bubbles (Services guide, Meet the Team).

// The bubble's fonts are the site's serif + sans (--font-guide-* in globals.css).
export const GUIDE_FONTS = "";

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

const WORD_MS = 32;

/** The mascot's line, its words easing in one after another. Remount (key)
 * to replay. */
export function TypeText({ text, onDone }: { text: string; onDone?: () => void }) {
  const parts = text.split(/(\s+)/);
  const words = parts.filter((p) => p && !/^\s+$/.test(p)).length;
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => onDone?.(), reduce ? 0 : words * WORD_MS + 600);
    return () => window.clearTimeout(id);
  }, [text, words, onDone]);
  const delays = parts.map((_, i) => parts.slice(0, i).filter((p) => p && !/^\s+$/.test(p)).length * WORD_MS);
  return (
    <>
      <span aria-hidden>
        {parts.map((p, i) =>
          !p || /^\s+$/.test(p) ? (
            p
          ) : (
            <span key={i} className="guide-word" style={{ animationDelay: `${delays[i]}ms` }}>
              {p}
            </span>
          )
        )}
      </span>
      {/* Screen readers get the whole line at once. */}
      <span className="sr-only">{text}</span>
    </>
  );
}
