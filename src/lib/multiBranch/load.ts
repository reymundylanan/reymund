import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { addDays, toMinutes, type Appointment, type Context } from "./engine";

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Today's date key and minutes-since-midnight in the salon's time zone. */
export function manilaNow(now = new Date()): { today: string; nowMinutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { today: `${parts.year}-${parts.month}-${parts.day}`, nowMinutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

type ApptRow = {
  id: string;
  booking_code: string | null;
  branch_id: string;
  professional_id: string | null;
  client_id: string | null;
  walkin_name: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  session_status: string | null;
  visit_type: string | null;
  service_id: string | null;
  notes: string | null;
  client: Rel<{ full_name: string | null }>;
  appointment_services: { service_id: string | null; service_name: string; position: number }[] | null;
  payments: { id: string }[] | null;
};

/** Everything the board and the availability checks need, from the live
 * database (no copies): `days` days from today (and at least through `date`). */
export async function loadContext(supabase: SupabaseClient, opts: { date?: string; days?: number } = {}): Promise<Context> {
  const { today, nowMinutes } = manilaNow();
  const from = today;
  const until = addDays(opts.date && opts.date > today ? opts.date : today, opts.days ?? 14);

  const [branches, staff, offs, lends, attendance, breaks, services, appts, settings] = await Promise.all([
    supabase.from("branches").select("id, name, address, phone, hours, status").order("name"),
    supabase.from("staff_members").select("id, full_name, department, branch_id, avatar_url").order("full_name"),
    supabase.from("staff_shifts").select("staff_member_id, shift_date, period, source").gte("shift_date", from).lte("shift_date", until),
    supabase.from("branch_transfer_requests").select("id, staff_member_id, target_branch_id, dates").eq("status", "approved"),
    supabase.from("staff_attendance").select("id, staff_member_id, attendance_date, status").eq("attendance_date", today),
    supabase.from("staff_attendance_breaks").select("attendance_id, break_start").is("break_end", null),
    supabase.from("branch_services").select("id, branch_id, name, department, category, duration, price, status"),
    supabase
      .from("appointments")
      .select(
        "id, booking_code, branch_id, professional_id, client_id, walkin_name, scheduled_date, start_time, duration_minutes, status, session_status, visit_type, service_id, notes, client:profiles!appointments_client_id_fkey(full_name), appointment_services(service_id, service_name, position), payments(id)"
      )
      .gte("scheduled_date", from)
      .lte("scheduled_date", until)
      .in("status", ["pending", "confirmed"]),
    supabase.from("spa_settings").select("booking_window_start, booking_window_end").maybeSingle(),
  ]);

  for (const [label, res] of Object.entries({ branches, staff, offs, lends, attendance, services, appts })) {
    if (res.error) logQueryError(`multiBranch.load ${label}`, res.error);
  }

  const serviceRows = (services.data ?? []) as { id: string; branch_id: string; name: string; department: string | null; category: string | null; duration: string | null; price: number | null; status: string | null }[];
  const serviceById = new Map(serviceRows.map((s) => [s.id, s]));

  const breakByAttendance = new Map(
    ((breaks.data ?? []) as { attendance_id: string; break_start: string }[]).map((b) => [b.attendance_id, manilaNow(new Date(b.break_start)).nowMinutes])
  );

  const appointments: Appointment[] = ((appts.data ?? []) as unknown as ApptRow[]).map((r) => {
    const lines = [...(r.appointment_services ?? [])].sort((a, b) => a.position - b.position);
    const ids = [...new Set([...lines.map((l) => l.service_id), r.service_id].filter((x): x is string => !!x))];
    const linked = ids.map((id) => serviceById.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
    return {
      id: r.id,
      code: r.booking_code,
      branchId: r.branch_id,
      professionalId: r.professional_id,
      clientId: r.client_id,
      clientName: one(r.client)?.full_name ?? r.walkin_name ?? "Walk-in client",
      date: r.scheduled_date,
      start: r.start_time.slice(0, 5),
      duration: r.duration_minutes || 60,
      status: String(r.status),
      sessionStatus: r.session_status,
      visitType: r.visit_type ?? "appointment",
      serviceLabel: lines.length ? lines.map((l) => l.service_name).join(", ") : linked.map((s) => s.name).join(", ") || (r.notes ?? "").split(" with ")[0] || "Appointment",
      services: [...new Set(linked.map((s) => s.name))],
      departments: [...new Set(linked.map((s) => s.department ?? "").filter(Boolean))],
      paid: (r.payments ?? []).length > 0,
    };
  });

  const window = settings.data as { booking_window_start: string; booking_window_end: string } | null;

  return {
    branches: ((branches.data ?? []) as Context["branches"]).map((b) => ({ ...b })),
    staff: ((staff.data ?? []) as { id: string; full_name: string; department: string | null; branch_id: string | null; avatar_url: string | null }[]).map((s) => ({
      id: s.id,
      name: s.full_name,
      department: s.department ?? "",
      branchId: s.branch_id,
      avatarUrl: s.avatar_url,
    })),
    offs: ((offs.data ?? []) as { staff_member_id: string; shift_date: string; period: Context["offs"][number]["period"]; source: Context["offs"][number]["source"] }[]).map((o) => ({
      staffId: o.staff_member_id,
      date: o.shift_date,
      period: o.period,
      source: o.source ?? "manual",
    })),
    lends: ((lends.data ?? []) as { id: string; staff_member_id: string; target_branch_id: string; dates: string[] }[])
      .map((l) => ({ id: l.id, staffId: l.staff_member_id, branchId: l.target_branch_id, dates: l.dates.filter((d) => d >= from && d <= until) }))
      .filter((l) => l.dates.length > 0),
    attendance: ((attendance.data ?? []) as { id: string; staff_member_id: string; attendance_date: string; status: string }[]).map((a) => ({
      staffId: a.staff_member_id,
      date: a.attendance_date,
      status: a.status,
      breakStartedMinutes: breakByAttendance.get(a.id) ?? null,
    })),
    services: serviceRows.map((s) => ({
      id: s.id,
      branchId: s.branch_id,
      name: s.name,
      department: s.department ?? "",
      category: s.category ?? "",
      duration: s.duration,
      price: Number(s.price ?? 0),
      status: s.status ?? "Active",
    })),
    appointments,
    today,
    nowMinutes,
    fallbackHours: window
      ? { open: toMinutes(window.booking_window_start), close: toMinutes(window.booking_window_end) }
      : { open: 8 * 60, close: 18 * 60 },
  };
}
