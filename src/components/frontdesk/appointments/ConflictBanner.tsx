import { AlertOctagon, CheckCircle2 } from "lucide-react";
import { clientInfo, formatTime } from "@/components/frontdesk/appointments/utils";
import type { ConflictPair } from "@/components/frontdesk/appointments/AppointmentsManager";

export default function ConflictBanner({
  conflicts,
  onResolve,
}: {
  conflicts: ConflictPair[];
  onResolve: (id: string) => void;
}) {
  if (conflicts.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-green-50 p-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
        <p className="text-sm text-ink/70">No scheduling conflicts detected.</p>
      </div>
    );
  }

  const first = conflicts[0];
  const nameA = clientInfo(first.a.client).full_name;
  const nameB = clientInfo(first.b.client).full_name;

  return (
    <div className="flex items-center justify-between rounded-2xl bg-red-50 p-4">
      <div className="flex items-center gap-3">
        <AlertOctagon className="h-5 w-5 shrink-0 text-red-500" />
        <div>
          <p className="text-sm font-semibold text-ink">
            Conflict Detection &mdash; {conflicts.length} ACTIVE
          </p>
          <p className="text-xs text-ink/60">
            {first.specialist} is double-booked: {nameA} at {formatTime(first.a.start_time)} overlaps{" "}
            {nameB} at {formatTime(first.b.start_time)}.
          </p>
        </div>
      </div>
      <button
        onClick={() => onResolve(first.a.id)}
        className="rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white hover:bg-coral-dark"
      >
        Resolve Now
      </button>
    </div>
  );
}
