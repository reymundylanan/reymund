"use client";

import { useEffect, useState } from "react";

/** Purely a display signal — a session never auto-completes just
 * because the estimated duration passed. The actual service can run
 * short or long, so Front Desk always clicks Complete/Finish Service
 * manually; this only tells them where things stand against the
 * estimate. */
export type ServiceTiming =
  | { kind: "remaining"; minutes: number }
  | { kind: "time_reached" }
  | { kind: "overdue"; minutes: number };

export function serviceTimingLabel(timing: ServiceTiming): string {
  switch (timing.kind) {
    case "remaining":
      return `${timing.minutes} min remaining`;
    case "time_reached":
      return "Time Reached";
    case "overdue":
      return `Overdue by ${timing.minutes} min`;
  }
}

export function serviceTimingStyle(timing: ServiceTiming): string {
  switch (timing.kind) {
    case "remaining":
      return "bg-green-100 text-green-700";
    case "time_reached":
      return "bg-amber-100 text-amber-700";
    case "overdue":
      return "bg-red-100 text-red-600";
  }
}

export function expectedCompletionAt(serviceStartedAt: string, durationMinutes: number): Date {
  return new Date(new Date(serviceStartedAt).getTime() + durationMinutes * 60000);
}

/** Only meaningful while a session is actually `in_service`. Based on
 * the actual service start time; the estimated duration is only a
 * guide for the remaining/overdue math, never a trigger to complete. */
export function computeServiceTiming(
  serviceStartedAt: string | null,
  durationMinutes: number,
  now: Date = new Date()
): ServiceTiming | null {
  if (!serviceStartedAt) return null;
  const expectedEnd = expectedCompletionAt(serviceStartedAt, durationMinutes);
  const diffMinutes = Math.round((expectedEnd.getTime() - now.getTime()) / 60000);
  if (diffMinutes > 0) return { kind: "remaining", minutes: diffMinutes };
  if (diffMinutes === 0) return { kind: "time_reached" };
  return { kind: "overdue", minutes: -diffMinutes };
}

/** Ticks every 30s so components showing service timing re-render and
 * count down/up on wall-clock time alone, without needing new data to
 * arrive. */
export function useServiceTimingClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Second-resolution clock for the Walk-Ins page's live HH:MM:SS
 * counters — the 30s tick above is plenty for badge text, but a
 * running stopwatch display needs to visibly move every second. */
export function useSecondClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function formatElapsedClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
