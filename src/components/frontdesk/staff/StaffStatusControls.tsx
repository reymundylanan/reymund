"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  punchIn,
  punchOut,
  startBreak,
  endBreak,
  type AttendanceStatus,
} from "@/lib/supabase/queries/staffAttendance";

export type DisplayStatus = AttendanceStatus | "day_off";

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  scheduled: "Scheduled",
  available: "Available",
  in_service: "In Service",
  on_break: "On Break",
  out: "Out",
  day_off: "Day Off",
};

export const STATUS_DOT: Record<DisplayStatus, string> = {
  scheduled: "bg-amber-400",
  available: "bg-green-500",
  in_service: "bg-blue-500",
  on_break: "bg-purple-500",
  out: "bg-red-500",
  day_off: "bg-gray-300",
};

export const STATUS_STYLE: Record<DisplayStatus, string> = {
  scheduled: "bg-amber-50 text-amber-700",
  available: "bg-green-50 text-green-700",
  in_service: "bg-blue-50 text-blue-700",
  on_break: "bg-purple-50 text-purple-700",
  out: "bg-red-50 text-red-600",
  day_off: "bg-gray-100 text-gray-500",
};

export type AttendanceActionName = "punch_in" | "punch_out" | "start_break" | "end_break";

type AttendanceActionFn = (
  supabase: ReturnType<typeof createClient>,
  input: { staffMemberId: string; branchId: string; dateKey: string }
) => Promise<{ error: string | null }>;

export const ACTION_LABEL: Record<AttendanceActionName, string> = {
  punch_in: "Punch In",
  punch_out: "Punch Out",
  start_break: "Start Break",
  end_break: "End Break",
};

export const ACTION_FN: Record<AttendanceActionName, AttendanceActionFn> = {
  punch_in: punchIn,
  punch_out: punchOut,
  start_break: startBreak,
  end_break: endBreak,
};

const ACTION_STYLE: Record<AttendanceActionName, string> = {
  punch_in: "bg-green-600 text-white hover:bg-green-700",
  punch_out: "border border-ink/15 text-ink/70 hover:border-ink/30",
  start_break: "border border-blue-200 text-blue-700 hover:border-blue-400",
  end_break: "bg-purple-600 text-white hover:bg-purple-700",
};

/** Mirrors the server-side gating in staffAttendance.ts so the UI never
 * offers an action the backend would reject — e.g. no Punch Out or
 * Start Break while a staff member is actively In Service. */
export function canRunAction(status: DisplayStatus, action: AttendanceActionName): boolean {
  switch (action) {
    case "punch_in":
      return status === "scheduled" || status === "out";
    case "punch_out":
      return status === "available" || status === "on_break";
    case "start_break":
      return status === "available";
    case "end_break":
      return status === "on_break";
  }
}

/** The single primary action shown per status, in display order — used
 * by the compact per-row controls. In Service shows its blocked actions
 * greyed out rather than hiding them, so it's visible at a glance that
 * a client is being served right now. Day Off shows a disabled Punch In
 * for the same reason. */
export function relevantActions(status: DisplayStatus): AttendanceActionName[] {
  switch (status) {
    case "scheduled":
    case "out":
    case "day_off":
      return ["punch_in"];
    case "available":
      return ["punch_out"];
    case "on_break":
      return ["end_break", "punch_out"];
    case "in_service":
      return ["punch_out", "start_break"];
    default:
      // Defensive fallback: a stray/legacy status value from before a
      // migration (e.g. the old "absent" status) shouldn't crash the
      // whole page — just show no actions for that row.
      return [];
  }
}

/** Actions valid from this status but not shown as a primary button —
 * tucked behind the "..." menu instead, so the row stays uncluttered. */
export function hiddenActions(status: DisplayStatus): AttendanceActionName[] {
  if (status === "available") return ["start_break"];
  return [];
}

function useAttendanceAction(input: { staffMemberId: string; branchId: string; dateKey: string }, onChanged: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: AttendanceActionName) {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: actionError } = await ACTION_FN[action](supabase, input);
    setBusy(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    onChanged();
  }

  return { run, busy, error };
}

export default function StaffStatusControls({
  status,
  staffMemberId,
  branchId,
  dateKey,
  editable,
  onChanged,
}: {
  status: DisplayStatus;
  staffMemberId: string;
  branchId: string;
  dateKey: string;
  editable: boolean;
  onChanged: () => void;
}) {
  const { run, busy, error } = useAttendanceAction({ staffMemberId, branchId, dateKey }, onChanged);
  const [showMore, setShowMore] = useState(false);
  const actions = relevantActions(status);
  const hidden = hiddenActions(status);

  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[status]}`}>
        <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
        {STATUS_LABEL[status]}
      </span>

      <div className="flex flex-col items-end gap-1">
        {actions.map((action) => {
          const enabled = editable && canRunAction(status, action);
          return (
            <button
              key={action}
              onClick={() => enabled && run(action)}
              disabled={busy || !enabled}
              className={`w-24 rounded-full px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${ACTION_STYLE[action]}`}
            >
              {ACTION_LABEL[action]}
            </button>
          );
        })}

        <button
          onClick={() => setShowMore((v) => !v)}
          disabled={!editable || hidden.length === 0}
          className="w-24 rounded-full border border-ink/15 py-1 text-ink/50 hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="More actions"
        >
          <MoreHorizontal className="mx-auto h-3.5 w-3.5" />
        </button>

        {showMore && hidden.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            {hidden.map((action) => (
              <button
                key={action}
                onClick={() => {
                  setShowMore(false);
                  run(action);
                }}
                disabled={busy}
                className={`w-24 rounded-full px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${ACTION_STYLE[action]}`}
              >
                {ACTION_LABEL[action]}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="max-w-[150px] text-right text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
