import { CalendarClock, Mail, MessageSquare, Printer, Receipt, ShieldCheck } from "lucide-react";
import { lastTransaction, securityChecklist } from "@/lib/frontdeskData";

export default function SidePanels() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blush text-coral-dark">
            <CalendarClock className="h-4 w-4" />
          </span>
          No-Refund Policy
        </h2>
        <div className="mt-3 rounded-xl bg-blush/60 p-4">
          <p className="text-sm text-ink/70">
            Payments are non-refundable. If a client needs to change or cancel a paid appointment, use{" "}
            <span className="font-medium text-ink">Reschedule</span> on that appointment — the original
            payment carries over to the new date and time.
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
            <Receipt className="h-4 w-4" />
          </span>
          Quick Receipt
        </h2>
        <div className="mt-3 rounded-xl border border-dashed border-ink/15 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">
            Last Transaction
          </p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            ₱{lastTransaction.amount.toLocaleString()}.00
          </p>
          <p className="text-xs text-ink/40">Ref: {lastTransaction.reference}</p>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-ink/15 px-3 py-2 text-xs font-medium text-ink/70 hover:border-coral">
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-ink/15 px-3 py-2 text-xs font-medium text-ink/70 hover:border-coral">
            <Mail className="h-3.5 w-3.5" /> Email
          </button>
          <button className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-ink/15 px-3 py-2 text-xs font-medium text-ink/70 hover:border-coral">
            <MessageSquare className="h-3.5 w-3.5" /> SMS
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
            <ShieldCheck className="h-4 w-4" />
          </span>
          Security Checklist
        </h2>
        <div className="mt-3 space-y-2">
          {securityChecklist.map((item) => (
            <p key={item} className="flex items-start gap-2 text-sm text-ink/70">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
              {item}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
