"use client";

import { useRef, useState } from "react";
import { Smartphone, Wallet } from "lucide-react";
import OnlinePaymentsTable from "@/components/frontdesk/payments/OnlinePaymentsTable";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import SidePanels from "@/components/frontdesk/payments/SidePanels";

type Tab = "online" | "cash";

export default function PaymentsManager() {
  const [tab, setTab] = useState<Tab>("online");
  const { profile } = useStaffProfile();
  const branchId = profile?.branchId ?? null;
  const onlineRef = useRef<HTMLDivElement>(null);
  const cashRef = useRef<HTMLDivElement>(null);

  function goTo(next: Tab) {
    setTab(next);
    const target = next === "online" ? onlineRef.current : cashRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        <div className="flex gap-2 rounded-2xl bg-white p-2 shadow-sm">
          <button
            onClick={() => goTo("online")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === "online" ? "bg-coral text-white" : "text-ink/60 hover:bg-blush"
            }`}
          >
            <Smartphone className="h-4 w-4" /> Online Payments
          </button>
          <button
            onClick={() => goTo("cash")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === "cash" ? "bg-coral text-white" : "text-ink/60 hover:bg-blush"
            }`}
          >
            <Wallet className="h-4 w-4" /> Cash Payments
          </button>
        </div>

        <div ref={onlineRef}>
          {branchId && <OnlinePaymentsTable key={`online-${branchId}`} branchId={branchId} />}
        </div>
        <div ref={cashRef}>
          {branchId && <OnlinePaymentsTable key={`cash-${branchId}`} branchId={branchId} method="cash" />}
        </div>
      </div>
      <SidePanels />
    </div>
  );
}
