"use client";

import { useState } from "react";
import BookingsToolbar from "@/components/admin/bookings/BookingsToolbar";
import BookingsStats from "@/components/admin/bookings/BookingsStats";
import BookingsCalendar from "@/components/admin/bookings/BookingsCalendar";
import BookingsListView from "@/components/admin/bookings/BookingsListView";
import BookingDetailsPanel from "@/components/admin/bookings/BookingDetailsPanel";
import type { Appointment } from "@/lib/adminData";

export default function BookingsManager() {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [selected, setSelected] = useState<Appointment | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Bookings Management</h1>
        <p className="text-sm text-ink/50">
          Manage appointments across all branches and handle conflicts.
        </p>
      </div>

      <BookingsStats />
      <BookingsToolbar view={view} onViewChange={setView} />

      {view === "calendar" ? (
        <BookingsCalendar onSelect={setSelected} />
      ) : (
        <BookingsListView onSelect={setSelected} />
      )}

      {selected && (
        <BookingDetailsPanel
          appointment={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
