"use client";

import { CalendarPlus, ShieldCheck, UserPlus } from "lucide-react";
import SpaBanner, { spaGreeting } from "@/components/SpaBanner";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";

// The live clock and branch are also in FrontDeskTopbar.
export default function DashboardHeader() {
  const { profile } = useStaffProfile();
  const firstName = profile?.fullName?.split(" ")[0] ?? "";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "Asia/Manila" });

  return (
    <SpaBanner
      eyebrow={`Blush Spa & Aesthetics · ${profile?.branchName ?? "Front Desk"}`}
      title={
        <>
          {spaGreeting()}
          {firstName ? `, ${firstName}` : ""} <span className="text-champagne">✨</span>
        </>
      }
      subtitle={`${today} — let's give every guest a calm, lovely visit.`}
      image="/images/hero/clinic.jpeg"
      links={[
        { href: "/frontdesk/appointments?new=1", label: "New Booking", icon: CalendarPlus, primary: true },
        { href: "/frontdesk/walk-ins", label: "Walk-in Client", icon: UserPlus },
        { href: "/frontdesk/payments", label: "Verify GCash", icon: ShieldCheck },
      ]}
    />
  );
}
