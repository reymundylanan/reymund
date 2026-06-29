"use client";

import { useState } from "react";
import AppointmentsToolbar from "@/components/frontdesk/appointments/AppointmentsToolbar";
import ConflictBanner from "@/components/frontdesk/appointments/ConflictBanner";
import StaffTimeline from "@/components/frontdesk/appointments/StaffTimeline";
import AppointmentsListView from "@/components/frontdesk/appointments/AppointmentsListView";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";

export default function AppointmentsManager() {
  const [view, setView] = useState<"calendar" | "list">("list");
  const [query, setQuery] = useState("");
  const { profile } = useStaffProfile();

  return (
    <div className="space-y-6">
      <AppointmentsToolbar
        view={view}
        onViewChange={setView}
        query={query}
        onQueryChange={setQuery}
        branchName={profile?.branchName}
      />
      <ConflictBanner />
      {view === "calendar" ? <StaffTimeline /> : <AppointmentsListView />}
    </div>
  );
}
