import { CheckCircle2, Mail, MessageSquare, Printer } from "lucide-react";
import { lastTransaction, pendingRefund, securityChecklist } from "@/lib/frontdeskData";

export default function SidePanels() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-ink">Adjustments &amp; Refunds</h2>
        <div className="mt-3 rounded-xl bg-amber-50 p-4">
          <p className="text-sm font-medium text-ink">Pending Refund Request</p>
          <p className="mt-1 text-xs text-ink/60">{pendingRefund.reason}</p>
          <div className="mt-3 flex gap-2">
            <button className="flex-1 rounded-full border border-ink/15 px-3 py-2 text-xs font-medium text-ink/70 hover:border-coral">
              Deny
            </button>
            <button className="flex-1 rounded-full bg-coral px-3 py-2 text-xs font-semibold text-white hover:bg-coral-dark">
              Approve Refund
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-ink">Quick Receipt</h2>
        <p className="text-xs text-ink/50">Last Transaction</p>
        <p className="mt-1 text-2xl font-semibold text-ink">
          ₱{lastTransaction.amount.toLocaleString()}.00
        </p>
        <p className="text-xs text-ink/40">Ref: {lastTransaction.reference}</p>
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
        <h2 className="font-semibold text-ink">Security Checklist</h2>
        <div className="mt-3 space-y-2">
          {securityChecklist.map((item) => (
            <p key={item} className="flex items-start gap-2 text-sm text-ink/70">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              {item}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
