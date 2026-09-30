"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { getStaffShiftsForDate } from "@/lib/supabase/queries/staffShifts";
import { getGracePeriodMinutes } from "@/lib/supabase/queries/spaSettings";
import { updateSessionStatus } from "@/lib/supabase/queries/appointments";
import AppointmentsToolbar, { type StatusFilter } from "@/components/frontdesk/appointments/AppointmentsToolbar";
import AppointmentsSummary from "@/components/frontdesk/appointments/AppointmentsSummary";
import ConflictBanner from "@/components/frontdesk/appointments/ConflictBanner";
import StaffTimeline from "@/components/frontdesk/appointments/StaffTimeline";
import AppointmentsListView, { type AvailabilityStatus } from "@/components/frontdesk/appointments/AppointmentsListView";
import AppointmentDetailPanel from "@/components/frontdesk/appointments/AppointmentDetailPanel";
import {
  clientInfo,
  appointmentStaffName,
  toDateKey,
  toMinutes,
  type AppointmentRow,
} from "@/components/frontdesk/appointments/utils";

export type ConflictPair = { a: AppointmentRow; b: AppointmentRow; specialist: string };
export type StaffRow = { id: string; full_name: string; department: string | null };
export type ServiceRow = { id: string; name: string; price: number };

const ACTIVE_STATUSES = new Set(["pending", "confirmed"]);

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default function AppointmentsManager() {
  const { profile } = useStaffProfile();
  const [view, setView] = useState<"calendar" | "list">("list");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("today");
  // A specific day chosen in the toolbar's date picker (YYYY-MM-DD); overrides the status tab.
  const [dateFilter, setDateFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [offToday, setOffToday] = useState<{ staff_member_id: string; source: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState(() => startOfDay(new Date()));
  const [graceMinutes, setGraceMinutes] = useState(15);

  const load = useCallback(async () => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const todayKey = toDateKey(new Date());
    const [apptRes, staffRes, servicesRes, offRes] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          "id, client_id, booking_code, appointment_type, scheduled_date, start_time, duration_minutes, status, session_status, arrival_time, service_started_at, additional_charges, professional_id, service_id, notes, staff_notes, created_at, client:profiles!appointments_client_id_fkey(full_name, phone, avatar_url), professional:staff_members(full_name, department, avatar_url), service:branch_services(name), payments(method, status, amount, reference_no, created_at)"
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
      supabase
        .from("branch_services")
        .select("id, name, price")
        .eq("branch_id", profile.branchId)
        .eq("status", "Active")
        .order("name"),
      getStaffShiftsForDate(supabase, profile.branchId, todayKey),
    ]);
    if (apptRes.error) console.error("Failed to load appointments:", apptRes.error);
    setRows((apptRes.data as unknown as AppointmentRow[]) ?? []);
    setStaff((staffRes.data as StaffRow[]) ?? []);
    setServices((servicesRes.data as ServiceRow[]) ?? []);
    setOffToday(offRes.map((r) => ({ staff_member_id: r.staff_member_id, source: r.source })));
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

  useEffect(() => {
    if (!profile?.branchId) return;
    let cancelled = false;
    getGracePeriodMinutes(createClient()).then((minutes) => {
      if (!cancelled) setGraceMinutes(minutes);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.branchId]);

  /** Auto-marks a client No-Show once the grace period is fully up and
   * they still haven't checked in — matches the spa's written late
   * policy ("we reserve the right to skip your time"). Runs while this
   * page is open; on load it also immediately catches anything that
   * went overdue while nobody had the page open. */
  useEffect(() => {
    if (!profile?.branchId) return;

    function sweep() {
      const now = new Date();
      const overdue = rows.filter((r) => {
        if (r.status === "cancelled" || r.session_status) return false;
        const start = new Date(`${r.scheduled_date}T${r.start_time}`);
        return now.getTime() >= start.getTime() + graceMinutes * 60000;
      });
      if (overdue.length === 0) return;

      setRows((prev) =>
        prev.map((r) => (overdue.some((o) => o.id === r.id) ? { ...r, session_status: "no_show" } : r))
      );
      const supabase = createClient();
      overdue.forEach((r) => {
        updateSessionStatus(supabase, r.id, "no_show");
      });
    }

    sweep();
    const id = setInterval(sweep, 30000);
    return () => clearInterval(id);
  }, [profile?.branchId, rows, graceMinutes]);

  const todayKey = toDateKey(new Date());

  const todaysRows = useMemo(() => rows.filter((r) => r.scheduled_date === todayKey), [rows, todayKey]);

  const busyProfessionalIds = useMemo(
    () => new Set(todaysRows.filter((r) => r.session_status === "in_service" && r.professional_id).map((r) => r.professional_id as string)),
    [todaysRows]
  );

  const staffAvailability = useMemo(() => {
    const map: Record<string, AvailabilityStatus> = {};
    for (const s of staff) {
      const off = offToday.find((o) => o.staff_member_id === s.id);
      if (off) {
        map[s.id] = off.source === "leave" ? "on_leave" : "day_off";
      } else if (busyProfessionalIds.has(s.id)) {
        map[s.id] = "busy";
      } else {
        map[s.id] = "available";
      }
    }
    return map;
  }, [staff, offToday, busyProfessionalIds]);

  const summary = useMemo(() => {
    return {
      total: todaysRows.length,
      confirmed: todaysRows.filter((r) => r.status === "confirmed").length,
      waiting: todaysRows.filter((r) => r.session_status === "waiting").length,
      inService: todaysRows.filter((r) => r.session_status === "in_service").length,
      completed: todaysRows.filter((r) => r.session_status === "completed").length,
      cancelled: todaysRows.filter((r) => r.status === "cancelled").length,
      noShow: todaysRows.filter((r) => r.session_status === "no_show").length,
    };
  }, [todaysRows]);

  const filteredRows = useMemo(() => {
    const matched = rows.filter((r) => {
      if (dateFilter) {
        if (r.scheduled_date !== dateFilter) return false;
      } else {
        if (statusFilter === "today" && r.scheduled_date !== todayKey) return false;
        if (statusFilter === "past" && r.scheduled_date >= todayKey) return false;
        if (statusFilter === "upcoming" && !(r.scheduled_date > todayKey && r.status !== "cancelled")) return false;
        if (statusFilter === "completed" && r.session_status !== "completed") return false;
        if (statusFilter === "cancelled" && r.status !== "cancelled") return false;
        if (statusFilter === "no_show" && r.session_status !== "no_show") return false;
      }
      if (staffFilter !== "all" && r.professional_id !== staffFilter) return false;
      if (serviceFilter !== "all" && r.service_id !== serviceFilter) return false;
      return true;
    });
    // Rows load oldest-first; previous days read better newest-first.
    return !dateFilter && statusFilter === "past" ? [...matched].reverse() : matched;
  }, [rows, statusFilter, dateFilter, staffFilter, serviceFilter, todayKey]);

  const searchedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filteredRows;
    return filteredRows.filter((r) => {
      const info = clientInfo(r.client);
      return (
        info.full_name.toLowerCase().includes(q) ||
        (info.phone ?? "").toLowerCase().includes(q) ||
        (r.booking_code ?? "").toLowerCase().includes(q)
      );
    });
  }, [filteredRows, query]);

  const conflicts = useMemo<ConflictPair[]>(() => {
    const today = toDateKey(new Date());
    const active = rows.filter((r) => ACTIVE_STATUSES.has(r.status) && r.scheduled_date >= today);
    const pairs: ConflictPair[] = [];
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      const aSpecialist = appointmentStaffName(a);
      const aKey = a.professional_id ?? aSpecialist.toLowerCase();
      if (!a.professional_id && (aSpecialist === "—" || aSpecialist.toLowerCase() === "any professional")) continue;
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (a.scheduled_date !== b.scheduled_date) continue;
        const bSpecialist = appointmentStaffName(b);
        const bKey = b.professional_id ?? bSpecialist.toLowerCase();
        if (aKey !== bKey) continue;
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
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        staff={staff}
        staffFilter={staffFilter}
        onStaffFilterChange={setStaffFilter}
        services={services}
        serviceFilter={serviceFilter}
        onServiceFilterChange={setServiceFilter}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
      />
      <AppointmentsSummary
        summary={summary}
        rows={todaysRows}
        onReschedule={(id) => {
          setRescheduleTargetId(id);
          setActiveId(id);
        }}
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
        <AppointmentsListView
          rows={searchedRows}
          conflictIds={conflictIds}
          staffAvailability={staffAvailability}
          activeId={activeId}
          onSelect={(id) => setActiveId(id)}
        />
      )}

      {activeAppointment && (
        <AppointmentDetailPanel
          key={activeAppointment.id}
          appointment={activeAppointment}
          staffAvailability={staffAvailability}
          staff={staff}
          services={services}
          branchName={profile?.branchName ?? null}
          startInReschedule={rescheduleTargetId === activeAppointment.id}
          onClose={() => {
            setActiveId(null);
            setRescheduleTargetId(null);
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}
