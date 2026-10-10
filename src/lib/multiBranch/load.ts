import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { addDays, clientKey, toMinutes, type Appointment, type ClientCard, type Context, type Service } from "./engine";

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
  walkin_phone: string | null;
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
    supabase.from("branches").select("id, name, address, phone, hours, status, lat, lng").order("name"),
    supabase.from("staff_members").select("id, full_name, department, branch_id, avatar_url").order("full_name"),
    supabase.from("staff_shifts").select("staff_member_id, shift_date, period, source").gte("shift_date", from).lte("shift_date", until),
    supabase.from("branch_transfer_requests").select("id, staff_member_id, target_branch_id, dates").eq("status", "approved"),
    supabase.from("staff_attendance").select("id, staff_member_id, attendance_date, status").eq("attendance_date", today),
    supabase.from("staff_attendance_breaks").select("attendance_id, break_start").is("break_end", null),
    supabase.from("branch_services").select("id, branch_id, name, department, category, duration, price, status, hair_options"),
    supabase
      .from("appointments")
      .select(
        "id, booking_code, branch_id, professional_id, client_id, walkin_name, walkin_phone, scheduled_date, start_time, duration_minutes, status, session_status, visit_type, service_id, notes, client:profiles!appointments_client_id_fkey(full_name), appointment_services(service_id, service_name, position), payments(id)"
      )
      .gte("scheduled_date", from)
      .lte("scheduled_date", until)
      .in("status", ["pending", "confirmed"]),
    supabase.from("spa_settings").select("booking_window_start, booking_window_end").maybeSingle(),
  ]);

  for (const [label, res] of Object.entries({ branches, staff, offs, lends, attendance, services, appts })) {
    if (res.error) logQueryError(`multiBranch.load ${label}`, res.error);
  }

  const serviceRows = (services.data ?? []) as { id: string; branch_id: string; name: string; department: string | null; category: string | null; duration: string | null; price: number | null; status: string | null; hair_options: { prices?: Record<string, string | number | null> } | null }[];
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
      walkinName: r.client_id ? null : r.walkin_name,
      walkinPhone: r.client_id ? null : r.walkin_phone,
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
      hairPrices: hairPriceMap(s.hair_options),
    })),
    appointments,
    today,
    nowMinutes,
    fallbackHours: window
      ? { open: toMinutes(window.booking_window_start), close: toMinutes(window.booking_window_end) }
      : { open: 8 * 60, close: 18 * 60 },
  };
}

type VisitRow = {
  client_id: string | null;
  walkin_name: string | null;
  walkin_phone: string | null;
  branch_id: string;
  scheduled_date: string;
  status: string;
  session_status: string | null;
  payments: { amount: number | string | null; status: string }[] | null;
};

type ProfileRow = { id: string; full_name: string | null; phone: string | null; avatar_url: string | null; vip: boolean | null; loyalty_points: number | null; branch_id: string | null };
type Building = ClientCard & { last: string | null; next: string | null; lastBranch: string | null; nextBranch: string | null };

/** Clients with bookings or walk-in visits, with their records (all branches).
 * Visits and spend follow the front desk's client stats (058): a visit is a
 * completed one; spend is settled payments. */
export async function loadClients(supabase: SupabaseClient, ctx: Pick<Context, "today">): Promise<ClientCard[]> {
  const rows: VisitRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("appointments")
      .select("client_id, walkin_name, walkin_phone, branch_id, scheduled_date, status, session_status, payments(amount, status)")
      .neq("status", "cancelled")
      .order("scheduled_date", { ascending: true })
      .range(from, from + 999);
    if (error) {
      logQueryError("multiBranch.loadClients visits", error);
      break;
    }
    rows.push(...((data ?? []) as unknown as VisitRow[]));
    if (!data || data.length < 1000) break;
  }

  const ids = [...new Set(rows.map((r) => r.client_id).filter((x): x is string => !!x))];
  const profiles = new Map<string, ProfileRow>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone, avatar_url, vip, loyalty_points, branch_id")
      .in("id", ids.slice(i, i + 200));
    if (error) logQueryError("multiBranch.loadClients profiles", error);
    for (const p of (data ?? []) as ProfileRow[]) profiles.set(p.id, p);
  }

  const cards = new Map<string, Building>();
  for (const r of rows) {
    if (!r.client_id && !r.walkin_name?.trim()) continue;
    const p = r.client_id ? profiles.get(r.client_id) : undefined;
    if (r.client_id && !p) continue;
    const key = clientKey({ clientId: r.client_id, walkinName: r.walkin_name, walkinPhone: r.walkin_phone });
    let c = cards.get(key);
    if (!c) {
      c = {
        key,
        clientId: r.client_id,
        walkinName: r.client_id ? null : (r.walkin_name ?? "").trim(),
        walkinPhone: r.client_id ? null : r.walkin_phone?.trim() || null,
        name: p?.full_name ?? (r.walkin_name ?? "").trim(),
        phone: p?.phone ?? r.walkin_phone ?? null,
        avatarUrl: p?.avatar_url ?? null,
        vip: !!p?.vip,
        points: p?.loyalty_points ?? 0,
        homeBranchId: p?.branch_id ?? null,
        branchId: null,
        branchSource: "none",
        visits: 0,
        lastVisit: null,
        spend: 0,
        upcoming: 0,
        last: null,
        next: null,
        lastBranch: null,
        nextBranch: null,
      };
      cards.set(key, c);
    }
    const done = r.status === "completed" || ["completed", "paid"].includes(r.session_status ?? "");
    if (done) {
      c.visits++;
      if (!c.lastVisit || r.scheduled_date > c.lastVisit) c.lastVisit = r.scheduled_date;
    }
    for (const pay of r.payments ?? []) if (pay.status === "settled") c.spend += Number(pay.amount ?? 0);
    const upcoming =
      r.scheduled_date >= ctx.today && (r.status === "pending" || r.status === "confirmed") && !["no_show", "completed", "paid"].includes(r.session_status ?? "");
    if (upcoming) {
      c.upcoming++;
      if (!c.next || r.scheduled_date < c.next) {
        c.next = r.scheduled_date;
        c.nextBranch = r.branch_id;
      }
    } else if (r.scheduled_date <= ctx.today && (!c.last || r.scheduled_date >= c.last)) {
      c.last = r.scheduled_date;
      c.lastBranch = r.branch_id;
    }
  }

  return [...cards.values()]
    .map((c): ClientCard => {
      const where: [string | null, ClientCard["branchSource"]] = c.homeBranchId
        ? [c.homeBranchId, "home"]
        : c.nextBranch
          ? [c.nextBranch, "next_visit"]
          : c.lastBranch
            ? [c.lastBranch, "last_visit"]
            : [null, "none"];
      return {
        key: c.key,
        clientId: c.clientId,
        walkinName: c.walkinName,
        walkinPhone: c.walkinPhone,
        name: c.name,
        phone: c.phone,
        avatarUrl: c.avatarUrl,
        vip: c.vip,
        points: c.points,
        homeBranchId: c.homeBranchId,
        branchId: where[0],
        branchSource: where[1],
        visits: c.visits,
        lastVisit: c.lastVisit,
        spend: c.spend,
        upcoming: c.upcoming,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Short / Medium / Long prices set by Admin for a hair service (only the ones with a price). */
export function hairPriceMap(options: { prices?: Record<string, string | number | null> } | null | undefined): Service["hairPrices"] {
  const p = options?.prices;
  if (!p) return null;
  const out: NonNullable<Service["hairPrices"]> = {};
  for (const size of ["short", "medium", "long"] as const) {
    const v = Number(String(p[size] ?? "").replace(/[₱,\s]/g, ""));
    if (Number.isFinite(v) && v > 0) out[size] = v;
  }
  return Object.keys(out).length ? out : null;
}
