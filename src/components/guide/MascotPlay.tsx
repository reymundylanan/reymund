"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import GlowMascot, { type MascotFace, type MascotPose } from "@/components/GlowMascot";

// The GlowSync mascot's "alive" behaviour, shared by every full-size mascot
// (Services guide, Meet the Team, Help pop-up, chat greeting): tap to tuck
// its body into its head and pop back with hearts, three quick taps to twirl,
// rub to pet it, giggles on hover, idle moments and eyes that follow the mouse.

export type BurstKind = "hearts" | "stars" | "party";
type Particle = { id: number; kind: BurstKind; char: string; color: string; dx: number; dy: number; rot: number; delay: number };
export type MoodStep = { face?: MascotFace; emote?: string; ms: number };
export type Mood = { face?: MascotFace; emote?: string } | null;

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

// Little things it does on its own every few seconds.
const IDLE_MOMENTS: MoodStep[][] = [
  [{ face: "wink", emote: "✨", ms: 1100 }],
  [{ face: "giggle", emote: "♪", ms: 1500 }],
  [{ face: "excited", emote: "♥", ms: 1300 }],
  [{ face: "happy", emote: "✨", ms: 1200 }],
  [{ face: "think", emote: "?", ms: 900 }, { face: "giggle", emote: "💡", ms: 1000 }],
];

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export type MascotPlay = ReturnType<typeof useMascotPlay>;

/** State and handlers that make a mascot feel alive. `idle` plays the idle
 * moments; `track` makes its eyes follow the mouse (measured from `targetRef`). */
export function useMascotPlay({ targetRef, idle = true, track = true }: { targetRef: RefObject<HTMLElement | null>; idle?: boolean; track?: boolean }) {
  const [mood, setMood] = useState<Mood>(null);
  const [look, setLook] = useState<{ x: number; y: number } | undefined>(undefined);
  const [tucked, setTucked] = useState(false);
  const [twirl, setTwirl] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const moodTimers = useRef<number[]>([]);
  const taps = useRef<number[]>([]);
  const rubState = useRef({ x: 0, dir: 0, flips: 0, since: 0, cooldown: 0 });

  /** Plays a short sequence of expressions, e.g. surprised "!" then excited. */
  const emote = useCallback((steps: MoodStep[]) => {
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
    if (reducedMotion()) return;
    const fresh = makeBurst(kind);
    setParticles((p) => [...p, ...fresh]);
    window.setTimeout(() => setParticles((p) => p.filter((x) => !fresh.includes(x))), 1700);
  }, []);

  /** Tap: the body tucks into the head and springs back with hearts.
   *  Three quick taps: a twirl with sparkles. */
  const tap = useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current.filter((x) => now - x < 1200), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      setTwirl(true);
      window.setTimeout(() => setTwirl(false), 750);
      burst("stars");
      emote([{ face: "giggle", emote: "✨", ms: 1500 }]);
      return;
    }
    setTucked(true);
    window.setTimeout(() => {
      setTucked(false);
      burst("hearts");
      emote([{ face: "love", emote: "💖", ms: 1300 }]);
    }, 380);
  }, [burst, emote]);

  /** Rubbing back and forth over it (petting) gives heart eyes and hearts. */
  const rub = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = rubState.current, now = Date.now();
      const dx = e.clientX - r.x;
      r.x = e.clientX;
      if (Math.abs(dx) < 3) return;
      const dir = Math.sign(dx);
      if (now - r.since > 1200) {
        r.flips = 0;
        r.since = now;
      }
      if (dir !== r.dir) {
        r.flips += 1;
        r.dir = dir;
      }
      if (r.flips >= 5 && now > r.cooldown) {
        r.flips = 0;
        r.cooldown = now + 2500;
        burst("hearts");
        emote([{ face: "love", emote: "♥", ms: 1600 }]);
      }
    },
    [burst, emote]
  );

  /** A giggle when the mouse comes over it. */
  const hover = useCallback(() => emote([{ face: "giggle", emote: "♥", ms: 1400 }]), [emote]);

  // Idle moments.
  useEffect(() => {
    if (!idle) return;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      if (Math.random() < 0.55) emote(IDLE_MOMENTS[Math.floor(Math.random() * IDLE_MOMENTS.length)]);
    }, 5200);
    return () => window.clearInterval(t);
  }, [idle, emote]);

  // Eyes follow the mouse.
  useEffect(() => {
    if (!track || reducedMotion()) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = targetRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        const next = {
          x: Math.round(clamp((e.clientX - (r.left + r.width / 2)) / 260) * 10) / 10,
          y: Math.round(clamp((e.clientY - (r.top + r.height * 0.3)) / 260) * 10) / 10,
        };
        setLook((cur) => (cur && cur.x === next.x && cur.y === next.y ? cur : next));
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [track, targetRef]);

  return { mood, look, tucked, twirl, particles, emote, burst, tap, rub, hover };
}

/** The full-body mascot with its emote bubble, ground shadow and particle bursts. */
export function MascotFigure({
  play,
  size,
  pose,
  face,
  emote,
  flip = false,
  motion,
  still = false,
  talking = false,
  extra,
  head = false,
}: {
  play: MascotPlay;
  size: number;
  pose: MascotPose;
  /** Overrides the play mood's face (e.g. thinking while answering). */
  face?: MascotFace;
  /** Overrides the play mood's emote. */
  emote?: string;
  flip?: boolean;
  /** Motion class while travelling/landing/celebrating; defaults to a gentle bob. */
  motion?: string;
  /** No idle head/eye life (e.g. while flying). */
  still?: boolean;
  talking?: boolean;
  extra?: React.ReactNode;
  /** Just the head (the floating chat character). */
  head?: boolean;
}) {
  const shownFace = face ?? play.mood?.face;
  const shownEmote = emote ?? play.mood?.emote;
  return (
    <span className="relative block">
      <span className={`relative block drop-shadow-[0_10px_12px_rgba(120,90,30,0.28)] ${play.twirl ? "guide-twirl" : motion ?? "glowy-bob"}`}>
        <GlowMascot size={size} full={!head} wings={head} pose={pose} face={shownFace} look={play.look} flip={flip} alive={!still} blink={!still} talking={talking} tucked={play.tucked} />
        {shownEmote && (
          <span
            key={shownEmote + (shownFace ?? "")}
            aria-hidden
            className={`guide-emote pointer-events-none absolute -top-3 ${flip ? "left-1" : "right-1"} flex h-8 min-w-8 items-center justify-center rounded-full border border-[#d9b968] bg-white px-1.5 text-base font-black leading-none text-[#c9a24a] shadow-md`}
          >
            {shownEmote === "…" ? (
              <span className="flex gap-0.5">
                <span className="glowy-dot h-1.5 w-1.5 rounded-full bg-[#c9a24a]" />
                <span className="glowy-dot h-1.5 w-1.5 rounded-full bg-[#c9a24a] [animation-delay:150ms]" />
                <span className="glowy-dot h-1.5 w-1.5 rounded-full bg-[#c9a24a] [animation-delay:300ms]" />
              </span>
            ) : (
              shownEmote
            )}
          </span>
        )}
        {extra}
      </span>
      <span aria-hidden className="guide-ground pointer-events-none absolute -bottom-1 left-1/2 h-2.5 w-[55%] -translate-x-1/2 rounded-full bg-[#7a5a1e]/25 blur-[3px]" />
      {play.particles.length > 0 && (
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-[38%] z-10">
          {play.particles.map((p) => (
            <span
              key={p.id}
              className="guide-particle absolute"
              style={{ "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--rot": `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}
            >
              {p.char || <span className="block h-2.5 w-1.5 rounded-sm" style={{ background: p.color }} />}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** A full-size mascot you can play with (tap, triple-tap, rub, hover). */
export function PlayfulMascot({
  size,
  pose = "present",
  face,
  emote,
  talking = false,
  label = "GlowSync AI",
  className = "",
}: {
  size: number;
  pose?: MascotPose;
  /** Forced expression (e.g. thinking while the AI answers). */
  face?: MascotFace;
  emote?: string;
  talking?: boolean;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const play = useMascotPlay({ targetRef: ref });
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onClick={play.tap}
      onPointerMove={play.rub}
      onPointerEnter={play.hover}
      className={`block rounded-full focus-visible:outline-2 focus-visible:outline-[#c9a24a] ${className}`}
    >
      <MascotFigure play={play} size={size} pose={pose} face={face} emote={emote} talking={talking} />
    </button>
  );
}
