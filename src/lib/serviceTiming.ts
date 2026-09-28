"use client";

import { useEffect, useState } from "react";

export type ServiceTiming = "overdue";

export const SERVICE_TIMING_LABEL: Record<ServiceTiming, string> = {
  overdue: "Overdue",
};

export const SERVICE_TIMING_STYLE: Record<ServiceTiming, string> = {
  overdue: "bg-red-100 text-red-600",
};

export function expectedCompletionAt(serviceStartedAt: string, durationMinutes: number): Date {
  return new Date(new Date(serviceStartedAt).getTime() + durationMinutes * 60000);
}

/** Only meaningful while a session is actually `in_service` — returns
 * null before the estimated completion time is reached, since "In
 * Service" is still the correct thing to show at that point. The spa's
 * policy is deliberately tight here (no grace period): the moment the
 * estimated time passes and the session isn't marked Completed, it's
 * Overdue — this is a display-only flag, never an automatic Complete. */
export function computeServiceTiming(
  serviceStartedAt: string | null,
  durationMinutes: number,
  now: Date = new Date()
): ServiceTiming | null {
  if (!serviceStartedAt) return null;
  const expectedEnd = expectedCompletionAt(serviceStartedAt, durationMinutes);
  return now.getTime() >= expectedEnd.getTime() ? "overdue" : null;
}

/** Ticks every 30s so components showing service timing re-render and
 * flip from In Service -> Overdue on wall-clock time alone, without
 * needing new data to arrive. */
export function useServiceTimingClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}
