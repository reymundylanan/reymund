import { AlertOctagon } from "lucide-react";
import { appointmentSummary } from "@/lib/frontdeskData";

export default function ConflictBanner() {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-red-50 p-4">
      <div className="flex items-center gap-3">
        <AlertOctagon className="h-5 w-5 text-red-500" />
        <div>
          <p className="text-sm font-semibold text-ink">
            Conflict Detection &mdash; {appointmentSummary.conflicts} ACTIVE
          </p>
          <p className="text-xs text-ink/60">
            Room 2 Overlap: Laser Therapy conflicts with a Double Booking slot.
          </p>
        </div>
      </div>
      <button className="rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white hover:bg-coral-dark">
        Resolve Now
      </button>
    </div>
  );
}
