"use client";

import { useEffect, useState } from "react";

/** How long past the estimated completion time a session can run before
 * it's flagged Overdue instead of just Ready for Completion. */
const GRACE_MINUTES = 10;

export type ServiceTiming = "ready_for_completion" | "overdue";

export const SERVICE_TIMING_LABEL: Record<ServiceTiming, string> = {
  ready_for_completion: "Ready for Completion",
  overdue: "Overdue / Extended Service",
};

export const SERVICE_TIMING_STYLE: Record<ServiceTiming, string> = {
  ready_for_completion: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-600",
};

export function expectedCompletionAt(serviceStartedAt: string, durationMinutes: number): Date {
  return new Date(new Date(serviceStartedAt).getTime() + durationMinutes * 60000);
}

/** Only meaningful while a session is actually `in_service` — returns
 * null before the estimated completion time is reached, since "In
 * Service" is still the correct thing to show at that point. */
export function computeServiceTiming(
  serviceStartedAt: string | null,
  durationMinutes: number,
  now: Date = new Date()
): ServiceTiming | null {
  if (!serviceStartedAt) return null;
  const expectedEnd = expectedCompletionAt(serviceStartedAt, durationMinutes);
  const minutesPastExpected = (now.getTime() - expectedEnd.getTime()) / 60000;
  if (minutesPastExpected < 0) return null;
  return minutesPastExpected < GRACE_MINUTES ? "ready_for_completion" : "overdue";
}

/** Ticks every 30s so components showing service timing re-render and
 * flip from In Service -> Ready for Completion -> Overdue on wall-clock
 * time alone, without needing new data to arrive. */
export function useServiceTimingClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}
