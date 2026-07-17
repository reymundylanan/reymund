"use client";

import { useEffect, useState } from "react";
import BookingsToolbar from "@/components/admin/bookings/BookingsToolbar";
import BookingsStats from "@/components/admin/bookings/BookingsStats";
import BookingsCalendar from "@/components/admin/bookings/BookingsCalendar";
import BookingsListView from "@/components/admin/bookings/BookingsListView";
import { createClient } from "@/lib/supabase/client";

export type DbAppointment = {
  id: string;
  booking_code: string;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status: "confirmed" | "pending" | "conflict";
  notes: string | null;
  appointment_type: string;
  client_name: string;
  branch_name: string;
};

export default function BookingsManager() {
  const [view, setView] = useState<"calendar" | "list">("list");
  const [appointments, setAppointments] = useState<DbAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id, booking_code, scheduled_date, start_time, duration_minutes, status, notes, appointment_type,
          profiles ( full_name ),
          branches ( name )
        `)
        .order("scheduled_date", { ascending: false })
        .order("start_time", { ascending: true });

      if (error) console.error("[bookings] fetch error:", error.message);

      const rows: DbAppointment[] = ((data ?? []) as {
        id: string;
        booking_code: string;
        scheduled_date: string;
        start_time: string;
        duration_minutes: number;
        status: string;
        notes: string | null;
        appointment_type: string;
        profiles: { full_name: string } | null;
        branches: { name: string } | null;
      }[]).map((r) => ({
        id: r.id,
        booking_code: r.booking_code,
        scheduled_date: r.scheduled_date,
        start_time: r.start_time,
        duration_minutes: r.duration_minutes,
        status: (r.status as DbAppointment["status"]) ?? "pending",
        notes: r.notes,
        appointment_type: r.appointment_type,
        client_name: r.profiles?.full_name ?? "Unknown",
        branch_name: r.branches?.name ?? "—",
      }));

      setAppointments(rows);
      setLoading(false);
    }
    load();
  }, []);

  const confirmed = appointments.filter((a) => a.status === "confirmed").length;
  const pending = appointments.filter((a) => a.status === "pending").length;
  const conflict = appointments.filter((a) => a.status === "conflict").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Bookings Management</h1>
        <p className="text-sm text-ink/50">
          Manage appointments across all branches and handle conflicts.
        </p>
      </div>

      <BookingsStats confirmed={confirmed} pending={pending} conflict={conflict} />
      <BookingsToolbar view={view} onViewChange={setView} />

      {loading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-ink/40 shadow-sm">
          Loading bookings…
        </div>
      ) : view === "calendar" ? (
        <BookingsCalendar onSelect={() => {}} />
      ) : (
        <BookingsListView appointments={appointments} />
      )}
    </div>
  );
}
