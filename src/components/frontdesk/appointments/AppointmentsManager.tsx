"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import AppointmentsToolbar from "@/components/frontdesk/appointments/AppointmentsToolbar";
import ConflictBanner from "@/components/frontdesk/appointments/ConflictBanner";
import StaffTimeline from "@/components/frontdesk/appointments/StaffTimeline";
import AppointmentsListView from "@/components/frontdesk/appointments/AppointmentsListView";
import AppointmentDetailPanel from "@/components/frontdesk/appointments/AppointmentDetailPanel";
import {
  clientInfo,
  parseService,
  hasSpecificSpecialist,
  toDateKey,
  toMinutes,
  type AppointmentRow,
} from "@/components/frontdesk/appointments/utils";

export type ConflictPair = { a: AppointmentRow; b: AppointmentRow; specialist: string };
export type StaffRow = { id: string; full_name: string; department: string | null };

const ACTIVE_STATUSES = new Set(["pending", "confirmed", "checked_in", "in_service"]);

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default function AppointmentsManager() {
  const { profile } = useStaffProfile();
  const [view, setView] = useState<"calendar" | "list">("list");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState(() => startOfDay(new Date()));

  const load = useCallback(async () => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const [apptRes, staffRes] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          "id, booking_code, appointment_type, scheduled_date, start_time, duration_minutes, status, notes, client:profiles(full_name, phone), payments(method, status, amount)"
        )
        .eq("branch_id", profile.branchId)
        .not("client_id", "is", null)
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true }),
      supabase
        .from("staff_members")
        .select("id, full_name, department")
        .eq("branch_id", profile.branchId)
        .order("full_name"),
    ]);
    setRows((apptRes.data as unknown as AppointmentRow[]) ?? []);
    setStaff((staffRes.data as StaffRow[]) ?? []);
    setLoading(false);
  }, [profile?.branchId]);

  useEffect(() => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    load();

    const channel = supabase
      .channel(`frontdesk-appointments-${profile.branchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `branch_id=eq.${profile.branchId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as { notes: string | null };
            setToast(row.notes ? `New booking: ${row.notes}` : "New booking received.");
            setTimeout(() => setToast(null), 6000);
          }
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.branchId, load]);

  const searchedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const info = clientInfo(r.client);
      return info.full_name.toLowerCase().includes(q) || (info.phone ?? "").toLowerCase().includes(q);
    });
  }, [rows, query]);

  const conflicts = useMemo<ConflictPair[]>(() => {
    const today = toDateKey(new Date());
    const active = rows.filter((r) => ACTIVE_STATUSES.has(r.status) && r.scheduled_date >= today);
    const pairs: ConflictPair[] = [];
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      const { specialist: aSpecialist } = parseService(a.notes);
      if (!hasSpecificSpecialist(aSpecialist)) continue;
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (a.scheduled_date !== b.scheduled_date) continue;
        const { specialist: bSpecialist } = parseService(b.notes);
        if (aSpecialist.toLowerCase() !== bSpecialist.toLowerCase()) continue;
        const aStart = toMinutes(a.start_time);
        const aEnd = aStart + a.duration_minutes;
        const bStart = toMinutes(b.start_time);
        const bEnd = bStart + b.duration_minutes;
        if (aStart < bEnd && bStart < aEnd) {
          pairs.push({ a, b, specialist: aSpecialist });
        }
      }
    }
    return pairs;
  }, [rows]);

  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    conflicts.forEach((c) => {
      ids.add(c.a.id);
      ids.add(c.b.id);
    });
    return ids;
  }, [conflicts]);

  const activeAppointment = rows.find((r) => r.id === activeId);

  return (
    <div className="relative space-y-6">
      {toast && (
        <div className="fixed right-6 top-20 z-40 flex items-center gap-2 rounded-full bg-coral px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <AppointmentsToolbar
        view={view}
        onViewChange={setView}
        query={query}
        onQueryChange={setQuery}
        branchName={profile?.branchName}
      />
      <ConflictBanner conflicts={conflicts} onResolve={(id) => setActiveId(id)} />

      {loading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-ink/40 shadow-sm">
          Loading appointments…
        </div>
      ) : view === "calendar" ? (
        <StaffTimeline
          staff={staff}
          rows={searchedRows}
          conflictIds={conflictIds}
          selectedDate={calendarDate}
          onPrevDay={() => setCalendarDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))}
          onNextDay={() => setCalendarDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))}
          onToday={() => setCalendarDate(startOfDay(new Date()))}
          onSelectDate={(date) => setCalendarDate(startOfDay(date))}
          onSelect={(id) => setActiveId(id)}
        />
      ) : (
        <AppointmentsListView rows={searchedRows} conflictIds={conflictIds} onSelect={(id) => setActiveId(id)} />
      )}

      {activeAppointment && (
        <AppointmentDetailPanel
          appointment={{
            id: activeAppointment.id,
            booking_code: activeAppointment.booking_code,
            appointment_type: activeAppointment.appointment_type,
            scheduled_date: activeAppointment.scheduled_date,
            start_time: activeAppointment.start_time,
            duration_minutes: activeAppointment.duration_minutes,
            status: activeAppointment.status,
            notes: activeAppointment.notes,
            clientName: clientInfo(activeAppointment.client).full_name,
            clientPhone: clientInfo(activeAppointment.client).phone,
            payment: activeAppointment.payments?.[0] ?? null,
          }}
          onClose={() => setActiveId(null)}
          onConfirmed={load}
        />
      )}
    </div>
  );
}
