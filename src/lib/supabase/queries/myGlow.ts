import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewStatus, ReviewTarget } from "@/lib/reviews";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import { orderedPhotoPaths, signReviewPhotos, type BookedService } from "@/lib/supabase/queries/visitReviews";

export type UpcomingAppointment = {
  id: string;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  serviceName: string | null;
  professionalName: string | null;
  branchName: string | null;
};

export type RecentAppointment = {
  id: string;
  scheduledDate: string;
  startTime: string;
  status: string;
  sessionStatus: string | null;
  branchId: string | null;
  serviceName: string | null;
  professionalName: string | null;
  branchName: string | null;
  bookedServices: BookedService[];
  /** "walk_in" for walk-ins Front Desk linked to the account (migration 054). */
  visitType: "appointment" | "walk_in";
};

type Rel<T> = T | T[] | null;

function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type RawAppointmentRow = {
  id: string;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  session_status?: string | null;
  branch_id?: string | null;
  notes: string | null;
  service: Rel<{ name: string }>;
  professional: Rel<{ full_name: string }>;
  branch: Rel<{ name: string }>;
};

export async function getUpcomingAppointment(
  supabase: SupabaseClient,
  clientId: string
): Promise<UpcomingAppointment | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, scheduled_date, start_time, duration_minutes, status, notes, service:branch_services(name), professional:staff_members(full_name), branch:branches(name)"
    )
    .eq("client_id", clientId)
    .in("status", ["confirmed", "pending"])
    .gte("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) console.error("getUpcomingAppointment failed:", error);
  if (!data) return null;
  const row = data as unknown as RawAppointmentRow;
  return {
    id: row.id,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    // Booking currently only records service/therapist as free text in
    // `notes` (see BookingModal.tsx) — service_id/professional_id are
    // not always set, so the structured join is a best-effort match
    // with the notes text as the fallback.
    serviceName: one(row.service)?.name ?? row.notes ?? null,
    professionalName: one(row.professional)?.full_name ?? null,
    branchName: one(row.branch)?.name ?? null,
  };
}

export async function getRecentAppointments(
  supabase: SupabaseClient,
  clientId: string,
  limit = 10,
  onlyId?: string
): Promise<RecentAppointment[]> {
  const query = (select: string) => {
    let q = supabase.from("appointments").select(select).eq("client_id", clientId);
    if (onlyId) q = q.eq("id", onlyId);
    return q.order("scheduled_date", { ascending: false }).order("start_time", { ascending: false }).limit(limit);
  };
  const base =
    "id, scheduled_date, start_time, status, session_status, branch_id, service_id, notes, service:branch_services(name), professional:staff_members(full_name), branch:branches(name)";
  const full = `${base}, booked:appointment_services(position, service_id, service_name)`;
  let first = await query(`${full}, visit_type`);
  if (first.error && isNotMigratedError(first.error)) {
    // Before migration 054 there is no visit_type column.
    first = await query(full);
  }
  let data: unknown = first.data;

  if (first.error) {
    // Before migration 051 the appointment_services embed fails; keep the
    // list working with the single legacy service instead of going blank.
    logQueryError("getRecentAppointments", first.error);
    const fallback = await query(base);
    if (fallback.error) logQueryError("getRecentAppointments fallback", fallback.error);
    data = fallback.data;
  }

  type Row = RawAppointmentRow & {
    service_id?: string | null;
    booked?: { position: number; service_id: string | null; service_name: string }[] | null;
    visit_type?: string | null;
  };
  return ((data as unknown as Row[]) ?? []).map((row) => {
    const serviceName = one(row.service)?.name ?? row.notes ?? null;
    const booked = [...(row.booked ?? [])].sort((a, b) => a.position - b.position);
    return {
      id: row.id,
      scheduledDate: row.scheduled_date,
      startTime: row.start_time,
      status: row.status,
      sessionStatus: row.session_status ?? null,
      branchId: row.branch_id ?? null,
      serviceName,
      professionalName: one(row.professional)?.full_name ?? null,
      branchName: one(row.branch)?.name ?? null,
      bookedServices: booked.length
        ? booked.map((b) => ({ position: b.position, serviceId: b.service_id, name: b.service_name }))
        : [{ position: 0, serviceId: row.service_id ?? null, name: serviceName ?? "Your service" }],
      visitType: row.visit_type === "walk_in" ? "walk_in" : "appointment",
    };
  });
}

/** One appointment of this client by id (deep links to visits outside the recent list). */
export async function getAppointmentForClient(
  supabase: SupabaseClient,
  clientId: string,
  id: string
): Promise<RecentAppointment | null> {
  return (await getRecentAppointments(supabase, clientId, 1, id))[0] ?? null;
}

export type MyReview = {
  id: string;
  appointmentId: string | null;
  rating: number;
  text: string | null;
  createdAt: string;
  editedAt: string | null;
  targetType: ReviewTarget;
  targetName: string;
  status: ReviewStatus;
  /** Signed URLs in position order. */
  photos: string[];
};

export async function getMyReviews(supabase: SupabaseClient, clientId: string): Promise<MyReview[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, appointment_id, service_position, rating, text, created_at, edited_at, target_type, status, staff:staff_members(full_name), branch:branches(name), service:branch_services(name), appointment:appointments(notes), review_photos(storage_path, position)"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) {
    logQueryError("getMyReviews", error);
    return [];
  }

  type Row = {
    id: string;
    appointment_id: string | null;
    service_position: number | null;
    rating: number;
    text: string | null;
    created_at: string;
    edited_at: string | null;
    target_type: ReviewTarget;
    status: ReviewStatus;
    staff: Rel<{ full_name: string }>;
    branch: Rel<{ name: string }>;
    service: Rel<{ name: string }>;
    appointment: Rel<{ notes: string | null }>;
    review_photos: { storage_path: string; position: number }[] | null;
  };

  const rows = (data as unknown as Row[]) ?? [];
  const urls = await signReviewPhotos(
    supabase,
    rows.flatMap((r) => orderedPhotoPaths(r.review_photos))
  );

  // Service parts whose branch service no longer resolves keep the name
  // that was booked (appointment_services.service_name).
  const unmatched = rows.filter((r) => r.target_type === "service" && !one(r.service) && r.appointment_id);
  const bookedNames = new Map<string, string>();
  if (unmatched.length > 0) {
    const { data: booked, error: bookedError } = await supabase
      .from("appointment_services")
      .select("appointment_id, position, service_name")
      .in("appointment_id", [...new Set(unmatched.map((r) => r.appointment_id as string))]);
    if (bookedError) logQueryError("getMyReviews booked names", bookedError);
    for (const b of (booked ?? []) as { appointment_id: string; position: number; service_name: string }[]) {
      bookedNames.set(`${b.appointment_id}:${b.position}`, b.service_name);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    appointmentId: row.appointment_id,
    rating: row.rating,
    text: row.text,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    photos: orderedPhotoPaths(row.review_photos).flatMap((p) => {
      const url = urls.get(p);
      return url ? [url] : [];
    }),
    targetType: row.target_type,
    status: row.status,
    targetName:
      row.target_type === "staff"
        ? one(row.staff)?.full_name ?? "Your therapist"
        : row.target_type === "branch"
          ? one(row.branch)?.name ?? "Blush Spa"
          : one(row.service)?.name ??
            bookedNames.get(`${row.appointment_id}:${row.service_position}`) ??
            one(row.appointment)?.notes ??
            "Service",
  }));
}

export async function getVisitedBranches(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("branch:branches(id, name)")
    .eq("client_id", clientId)
    .not("branch_id", "is", null)
    .order("scheduled_date", { ascending: false });

  if (error) console.error("getVisitedBranches failed:", error);

  type Row = { branch: Rel<{ id: string; name: string }> };
  const seen = new Set<string>();
  const result: { id: string; name: string }[] = [];

  for (const row of (data as unknown as Row[]) ?? []) {
    const branch = one(row.branch);
    if (!branch || seen.has(branch.id)) continue;
    seen.add(branch.id);
    result.push(branch);
  }

  return result;
}

export type ClientAppointmentDetail = {
  id: string;
  bookingCode: string | null;
  status: string;
  sessionStatus: string | null;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  serviceName: string | null;
  professionalName: string | null;
  branchName: string | null;
  branchPhone: string | null;
  rescheduleCount: number;
  originalScheduledDate: string | null;
  originalStartTime: string | null;
  history: { id: string; eventType: string; fromValue: string | null; toValue: string | null; createdAt: string }[];
  /** Readable by the client from 059; empty before it. */
  payments: { status: string; paymentType: string | null; amount: number; method: string }[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One appointment, only if it belongs to `clientId` — otherwise null,
 * so callers can't tell "doesn't exist" from "not yours". */
export async function getClientAppointment(
  supabase: SupabaseClient,
  clientId: string,
  appointmentId: string
): Promise<ClientAppointmentDetail | null> {
  if (!UUID_RE.test(appointmentId)) return null;

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, booking_code, status, session_status, scheduled_date, start_time, duration_minutes, notes, reschedule_count, original_scheduled_date, original_start_time, service:branch_services(name), professional:staff_members(full_name), branch:branches(name, phone)"
    )
    .eq("id", appointmentId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) console.error("getClientAppointment failed:", error);
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    booking_code: string | null;
    status: string;
    session_status: string | null;
    scheduled_date: string;
    start_time: string;
    duration_minutes: number;
    notes: string | null;
    reschedule_count: number | null;
    original_scheduled_date: string | null;
    original_start_time: string | null;
    service: Rel<{ name: string }>;
    professional: Rel<{ full_name: string }>;
    branch: Rel<{ name: string; phone: string | null }>;
  };

  const { data: historyRows, error: historyError } = await supabase
    .from("appointment_history")
    .select("id, event_type, from_value, to_value, created_at")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: true });
  if (historyError) console.error("getClientAppointment history failed:", historyError);

  const { data: paymentRows, error: paymentsError } = await supabase
    .from("payments")
    .select("status, payment_type, amount, method")
    .eq("appointment_id", appointmentId);
  if (paymentsError && !isNotMigratedError(paymentsError)) logQueryError("getClientAppointment payments", paymentsError);
  const payments = ((paymentRows ?? []) as { status: string; payment_type: string | null; amount: number; method: string }[]).map((p) => ({
    status: p.status,
    paymentType: p.payment_type,
    amount: Number(p.amount),
    method: p.method,
  }));

  const branch = one(row.branch);
  return {
    id: row.id,
    bookingCode: row.booking_code,
    status: row.status,
    sessionStatus: row.session_status,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    serviceName: one(row.service)?.name ?? row.notes ?? null,
    professionalName: one(row.professional)?.full_name ?? null,
    branchName: branch?.name ?? null,
    branchPhone: branch?.phone ?? null,
    rescheduleCount: row.reschedule_count ?? 0,
    originalScheduledDate: row.original_scheduled_date,
    originalStartTime: row.original_start_time,
    history: ((historyRows as { id: string; event_type: string; from_value: string | null; to_value: string | null; created_at: string }[]) ?? []).map(
      (h) => ({ id: h.id, eventType: h.event_type, fromValue: h.from_value, toValue: h.to_value, createdAt: h.created_at })
    ),
    payments,
  };
}
