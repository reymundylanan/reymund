"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/* Motion pieces for the mascot's speech box: it reshapes smoothly to fit new
   text, tilts a touch toward the pointer, and can play a soft chime. */

/** Smoothly animates its height to whatever its content needs. */
export function MorphHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="guide-morph" style={{ height: height ?? "auto" }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

/** Leans its content a few degrees toward the pointer, then settles back. */
export function TiltLayer({ children, max = 4 }: { children: ReactNode; max?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const set = (x: number, y: number) => {
    el.current?.style.setProperty("--tilt-x", `${x}deg`);
    el.current?.style.setProperty("--tilt-y", `${y}deg`);
  };
  return (
    <div
      ref={el}
      className="guide-tilt"
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        set(px * max * 2, -py * max * 2);
      }}
      onPointerLeave={() => set(0, 0)}
    >
      {children}
    </div>
  );
}

// ── The opening chime: off unless the visitor turns it on ──
const SOUND_KEY = "glowsync-guide-sound";
const SOUND_EVENT = "glowsync-guide-sound";

function readSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

function subscribeSound(onChange: () => void) {
  window.addEventListener(SOUND_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SOUND_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useGuideSound(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeSound, readSound, () => false);
  const set = (next: boolean) => {
    try {
      window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      /* private mode: the switch just won't be remembered */
    }
    window.dispatchEvent(new Event(SOUND_EVENT));
    if (next) playChime();
  };
  return [on, set];
}

let audio: AudioContext | null = null;

/** Two soft bell notes, synthesised — no sound file to load. */
export function playChime() {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    [1318.5, 1975.5].forEach((freq, i) => {
      const start = now + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.045, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.95);
    });
  } catch {
    /* no audio available */
  }
}

export function chimeIfOn() {
  if (readSound()) playChime();
}
