import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import type { RawAppointment, RawPayment, RawReview, ReportData } from "@/lib/reports/model";

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  return !v ? null : Array.isArray(v) ? (v[0] ?? null) : v;
}

const manilaDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

type ApptEmbed = {
  id: string;
  client_id: string | null;
  walkin_name: string | null;
  visit_type: string | null;
  branch_id: string;
  professional_id: string | null;
  notes: string | null;
  client: Rel<{ full_name: string | null }>;
  branch: Rel<{ name: string | null }>;
  professional: Rel<{ full_name: string | null }>;
  service: Rel<{ name: string | null }>;
  appointment_services: { service_name: string; position: number }[] | null;
};

function serviceList(a: Pick<ApptEmbed, "appointment_services" | "service" | "notes">): string[] {
  const listed = [...(a.appointment_services ?? [])].sort((x, y) => x.position - y.position).map((s) => s.service_name.trim());
  if (listed.length) return listed;
  const joined = one(a.service)?.name?.trim();
  if (joined) return [joined];
  const fromNotes = a.notes?.split(" with ")[0]?.trim();
  return fromNotes ? fromNotes.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

const priceFromNotes = (notes: string | null) => {
  const m = notes?.match(/₱([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
};

const staffFromNotes = (notes: string | null) => notes?.split(" with ")[1]?.split(" — ")[0]?.trim() || "";

const EMBED =
  "client_id, walkin_name, visit_type, branch_id, professional_id, notes, client:profiles!appointments_client_id_fkey(full_name), branch:branches(name), professional:staff_members(full_name), service:branch_services(name), appointment_services(service_name, position)";

/** Every record the Report Generator needs for [from, to] (Manila dates),
 * across all branches; filters are applied in memory by the builders. */
export async function loadReportData(supabase: SupabaseClient, from: string, to: string): Promise<ReportData> {
  const startIso = `${from}T00:00:00+08:00`;
  const endIso = `${to}T23:59:59.999+08:00`;

  const [appts, pays, revs, staff, branches] = await Promise.all([
    supabase
      .from("appointments")
      .select(`id, scheduled_date, start_time, status, session_status, walkin_phone, duration_minutes, arrival_time, service_started_at, completed_at, reschedule_count, ${EMBED}`)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .limit(20000),
    supabase
      .from("payments")
      .select(`id, amount, method, status, payment_type, created_at, verified_at, reference_no, appointment:appointments!inner(id, ${EMBED})`)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .limit(20000),
    supabase
      .from("reviews")
      .select(
        "id, target_type, rating, text, status, created_at, staff_id, branch_id, client:profiles!reviews_client_id_fkey(full_name), staff:staff_members(full_name), branch:branches(name), service:branch_services(name), review_photos(count), appointment:appointments(branch_id, professional_id)"
      )
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .limit(20000),
    supabase.from("staff_members").select("id, full_name, department, branch_id").order("full_name"),
    supabase.from("branches").select("id, name").order("name"),
  ]);

  for (const [label, res] of [
    ["appointments", appts],
    ["payments", pays],
    ["reviews", revs],
    ["staff", staff],
    ["branches", branches],
  ] as const) {
    logQueryError(`loadReportData ${label}`, res.error);
  }
  if (appts.error || pays.error) throw new Error("Couldn't load report data. Please try again.");

  type ApptRow = ApptEmbed & {
    scheduled_date: string;
    start_time: string;
    status: string;
    session_status: string | null;
    walkin_phone: string | null;
    duration_minutes: number | null;
    arrival_time: string | null;
    service_started_at: string | null;
    completed_at: string | null;
    reschedule_count: number | null;
  };

  const appointments: RawAppointment[] = ((appts.data ?? []) as unknown as ApptRow[]).map((a) => ({
    id: a.id,
    date: a.scheduled_date,
    time: a.start_time,
    status: a.status,
    sessionStatus: a.session_status,
    visitType: a.visit_type === "walk_in" || (a.visit_type == null && !a.client_id) ? "walk_in" : "appointment",
    clientId: a.client_id,
    clientName: one(a.client)?.full_name?.trim() || a.walkin_name?.trim() || "Walk-in guest",
    walkinPhone: a.walkin_phone,
    branchId: a.branch_id,
    branchName: one(a.branch)?.name ?? "—",
    staffId: a.professional_id,
    staffName: one(a.professional)?.full_name ?? staffFromNotes(a.notes),
    services: serviceList(a),
    durationMinutes: a.duration_minutes ?? 60,
    price: priceFromNotes(a.notes),
    arrivalTime: a.arrival_time,
    serviceStartedAt: a.service_started_at,
    completedAt: a.completed_at,
    rescheduleCount: a.reschedule_count ?? 0,
  }));

  type PayRow = {
    id: string;
    amount: number;
    method: string;
    status: string;
    payment_type: string | null;
    created_at: string;
    verified_at: string | null;
    reference_no: string | null;
    appointment: Rel<ApptEmbed>;
  };

  const payments: RawPayment[] = ((pays.data ?? []) as unknown as PayRow[]).flatMap((p) => {
    const a = one(p.appointment);
    if (!a) return [];
    return [
      {
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        status: p.status,
        paymentType: p.payment_type,
        createdAt: p.created_at,
        date: manilaDate(p.created_at),
        verifiedAt: p.verified_at,
        referenceNo: p.reference_no,
        appointmentId: a.id,
        clientId: a.client_id,
        clientName: one(a.client)?.full_name?.trim() || a.walkin_name?.trim() || "Walk-in guest",
        branchId: a.branch_id,
        branchName: one(a.branch)?.name ?? "—",
        staffId: a.professional_id,
        staffName: one(a.professional)?.full_name ?? staffFromNotes(a.notes),
        services: serviceList(a),
        visitType: a.visit_type === "walk_in" || (a.visit_type == null && !a.client_id) ? "walk_in" : "appointment",
      },
    ];
  });

  type RevRow = {
    id: string;
    target_type: RawReview["type"];
    rating: number;
    text: string | null;
    status: string;
    created_at: string;
    staff_id: string | null;
    branch_id: string | null;
    client: Rel<{ full_name: string | null }>;
    staff: Rel<{ full_name: string | null }>;
    branch: Rel<{ name: string | null }>;
    service: Rel<{ name: string | null }>;
    review_photos: { count: number }[] | null;
    appointment: Rel<{ branch_id: string; professional_id: string | null }>;
  };

  const reviews: RawReview[] = ((revs.data ?? []) as unknown as RevRow[]).map((r) => {
    const a = one(r.appointment);
    const serviceName = one(r.service)?.name ?? null;
    return {
      id: r.id,
      type: r.target_type,
      rating: r.rating,
      text: r.text,
      status: r.status,
      date: manilaDate(r.created_at),
      target:
        r.target_type === "staff"
          ? one(r.staff)?.full_name ?? "Former staff"
          : r.target_type === "branch"
            ? one(r.branch)?.name ?? "Branch"
            : serviceName ?? "Service",
      clientName: one(r.client)?.full_name ?? "Client",
      staffId: r.staff_id ?? a?.professional_id ?? null,
      branchId: r.branch_id ?? a?.branch_id ?? null,
      serviceName,
      photos: r.review_photos?.[0]?.count ?? 0,
    };
  });

  // Returning = the client had a (non-cancelled) visit before the period.
  const ids = [...new Set(appointments.map((a) => a.clientId).filter((x): x is string => !!x))];
  const returningClientIds = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("appointments")
      .select("client_id")
      .in("client_id", ids.slice(i, i + 200))
      .lt("scheduled_date", from)
      .neq("status", "cancelled")
      .limit(5000);
    logQueryError("loadReportData returning", error);
    for (const r of (data ?? []) as { client_id: string }[]) returningClientIds.add(r.client_id);
  }

  return {
    appointments,
    payments,
    reviews,
    returningClientIds,
    staff: ((staff.data ?? []) as { id: string; full_name: string; department: string | null; branch_id: string | null }[]).map((s) => ({
      id: s.id,
      name: s.full_name,
      department: s.department,
      branchId: s.branch_id,
    })),
    branches: (branches.data ?? []) as { id: string; name: string }[],
  };
}
