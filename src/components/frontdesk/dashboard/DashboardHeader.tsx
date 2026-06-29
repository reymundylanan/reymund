"use client";

import { CalendarPlus, ShieldCheck, UserPlus } from "lucide-react";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";

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
          {profile?.branchName ?? "No branch assigned"} &mdash; Today is{" "}
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>
      <div className="flex gap-2">
        <button className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
          <CalendarPlus className="h-4 w-4" /> New Booking
        </button>
        <button className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
          <UserPlus className="h-4 w-4" /> Walk-in Client
        </button>
        <button className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
          <ShieldCheck className="h-4 w-4" /> Verify GCash
        </button>
      </div>
    </div>
  );
}
