import type { SessionStatus } from "@/lib/sessionStatus";
import { computeServiceTiming, expectedCompletionAt, type ServiceTiming } from "@/lib/serviceTiming";
import type { WalkinRow } from "@/lib/supabase/queries/walkins";

export type WalkinStatusKey = "waiting" | "in_service" | "time_reached" | "overdue" | "completed" | "other";

const STATUS_STYLE: Record<WalkinStatusKey, string> = {
  waiting: "bg-slate-100 text-slate-600",
  in_service: "bg-blue-100 text-blue-700",
  time_reached: "bg-amber-100 text-amber-700",
  overdue: "bg-red-100 text-red-600",
  completed: "bg-green-100 text-green-700",
  other: "bg-ink/10 text-ink/50",
};

const STATUS_LABEL: Record<WalkinStatusKey, string> = {
  waiting: "Waiting",
  in_service: "In Service",
  time_reached: "Time Reached",
  overdue: "Overdue",
  completed: "Completed",
  other: "—",
};

/** Collapses session_status + the live timing computation into the
 * single badge Walk-Ins shows everywhere: In Service itself splits into
 * three visual states (remaining / time reached / overdue) without the
 * underlying session_status ever changing. */
export function walkinStatusKey(sessionStatus: SessionStatus, timing: ServiceTiming | null): WalkinStatusKey {
  if (sessionStatus === "completed" || sessionStatus === "paid") return "completed";
  if (sessionStatus === "in_service") {
    if (timing?.kind === "overdue") return "overdue";
    if (timing?.kind === "time_reached") return "time_reached";
    return "in_service";
  }
  if (sessionStatus === "waiting" || sessionStatus === "arrived" || sessionStatus === "ready" || sessionStatus === "late_arrival") {
    return "waiting";
  }
  return "other";
}

export function walkinStatusLabel(key: WalkinStatusKey): string {
  return STATUS_LABEL[key];
}

export function walkinStatusStyle(key: WalkinStatusKey): string {
  return STATUS_STYLE[key];
}

export type WalkinTimelineStep = {
  key: "waiting" | "in_service" | "time_reached" | "overdue" | "completed";
  label: string;
  done: boolean;
  detail: string;
};

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/** Drives the "Walk-In Status Flow" timeline in the detail panel — each
 * step is either done (with a real timestamp) or a grey placeholder
 * explaining what still has to happen for it to fire. Never implies a
 * step is "next" if it can't happen yet (e.g. Overdue before Time
 * Reached). */
export function computeWalkinTimeline(row: WalkinRow, now: Date): WalkinTimelineStep[] {
  const sessionStatus = (row.session_status ?? "waiting") as SessionStatus;
  const isCompleted = sessionStatus === "completed" || sessionStatus === "paid";
  const referenceNow = isCompleted && row.completed_at ? new Date(row.completed_at) : now;
  const timing = row.service_started_at
    ? computeServiceTiming(row.service_started_at, row.duration_minutes, referenceNow)
    : null;
  const expectedEnd = row.service_started_at ? expectedCompletionAt(row.service_started_at, row.duration_minutes) : null;

  return [
    {
      key: "waiting",
      label: "Waiting",
      done: !!row.arrival_time,
      detail: row.arrival_time ? `Checked in: ${clockTime(row.arrival_time)}` : "Not checked in yet",
    },
    {
      key: "in_service",
      label: "In Service",
      done: !!row.service_started_at,
      detail: row.service_started_at
        ? `Started at ${clockTime(row.service_started_at)} · Service started`
        : "Not yet (service hasn't started)",
    },
    {
      key: "time_reached",
      label: "Time Reached",
      done: !!expectedEnd && referenceNow.getTime() >= expectedEnd.getTime(),
      detail: expectedEnd
        ? referenceNow.getTime() >= expectedEnd.getTime()
          ? `Estimated duration ${row.duration_minutes} min · reached ${clockTime(expectedEnd.toISOString())}`
          : "Not yet (will show after estimated time)"
        : "Not yet (will show after estimated time)",
    },
    {
      key: "overdue",
      label: "Overdue",
      done: timing?.kind === "overdue" || (isCompleted && !!expectedEnd && !!row.completed_at && new Date(row.completed_at).getTime() > expectedEnd.getTime()),
      detail:
        timing?.kind === "overdue"
          ? `Over by ${timing.minutes} min`
          : isCompleted && expectedEnd && row.completed_at && new Date(row.completed_at).getTime() > expectedEnd.getTime()
          ? `Finished ${Math.round((new Date(row.completed_at).getTime() - expectedEnd.getTime()) / 60000)} min over estimate`
          : "Not yet (will show after estimated time)",
    },
    {
      key: "completed",
      label: "Completed",
      done: isCompleted,
      detail: isCompleted && row.completed_at ? `Completed ${clockTime(row.completed_at)}` : "When service is finished",
    },
  ];
}
