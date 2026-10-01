import { CalendarClock, ShieldCheck } from "lucide-react";

const VERIFY_STEPS = [
  "Open the pending booking and look at the client's receipt.",
  "Open the spa's GCash account on your phone.",
  "Match the amount, sender, reference number and time.",
  "Make sure the payment wasn't already used for another booking.",
  "Click Verify Payment, then Confirm Appointment.",
];

export default function SidePanels() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blush text-coral-dark">
            <CalendarClock className="h-4 w-4" />
          </span>
          No-Refund Policy
        </h2>
        <p className="mt-2 rounded-xl bg-blush/60 p-3 text-xs text-ink/70">
          Payments are non-refundable. If a client needs to change or cancel a paid appointment, use{" "}
          <span className="font-medium text-ink">Reschedule</span> on that appointment — the original payment carries over
          to the new date and time.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
            <ShieldCheck className="h-4 w-4" />
          </span>
          Verifying Pay Now
        </h2>
        <p className="mt-1 text-xs text-ink/50">A receipt is not proof of payment until you see it in GCash.</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs text-ink/70">
          {VERIFY_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
