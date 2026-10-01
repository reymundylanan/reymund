"use client";

import Link from "next/link";
import { CalendarPlus, ShieldCheck, UserPlus } from "lucide-react";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";

// The live clock and branch are already in FrontDeskTopbar.
export default function DashboardHeader() {
  const { profile } = useStaffProfile();
  const firstName = profile?.fullName?.split(" ")[0] ?? "";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">
          Welcome back{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-ink/50">
          {profile?.branchName ?? "No branch assigned"} &mdash;{" "}
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/frontdesk/appointments?new=1"
          className="flex items-center gap-2 rounded-xl bg-coral px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-coral-dark"
        >
          <CalendarPlus className="h-4 w-4" /> New Booking
        </Link>
        <Link
          href="/frontdesk/walk-ins"
          className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm font-medium text-ink/70 shadow-sm hover:border-coral"
        >
          <UserPlus className="h-4 w-4" /> Walk-in Client
        </Link>
        <Link
          href="/frontdesk/payments"
          className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm font-medium text-ink/70 shadow-sm hover:border-coral"
        >
          <ShieldCheck className="h-4 w-4" /> Verify GCash
        </Link>
      </div>
    </div>
  );
}
