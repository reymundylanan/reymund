import type { SupabaseClient } from "@supabase/supabase-js";

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
};

export type ServiceReview = { rating: number; text: string | null };

export type ReviewableProfessional = {
  professionalId: string;
  professionalName: string;
};

export type MyReview = {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  targetType: "professional" | "branch";
  targetName: string;
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
  limit = 10
): Promise<RecentAppointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, scheduled_date, start_time, status, session_status, branch_id, notes, service:branch_services(name), professional:staff_members(full_name)"
    )
    .eq("client_id", clientId)
    .order("scheduled_date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(limit);

  if (error) console.error("getRecentAppointments failed:", error);
  return ((data as unknown as RawAppointmentRow[]) ?? []).map((row) => ({
    id: row.id,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    status: row.status,
    sessionStatus: row.session_status ?? null,
    branchId: row.branch_id ?? null,
    serviceName: one(row.service)?.name ?? row.notes ?? null,
    professionalName: one(row.professional)?.full_name ?? null,
  }));
}

/** Reviews this client has already left on specific bookings, keyed by
 * appointment id — lets My Services show "your rating" instead of the
 * review form on anything already reviewed. */
export async function getServiceReviews(
  supabase: SupabaseClient,
  clientId: string
): Promise<Record<string, ServiceReview>> {
  const { data, error } = await supabase
    .from("reviews")
    .select("appointment_id, rating, text")
    .eq("client_id", clientId)
    .not("appointment_id", "is", null);

  if (error) {
    // Before migration 046 the column doesn't exist — treat as "nothing reviewed yet".
    console.warn("getServiceReviews unavailable:", error.message);
    return {};
  }
  const map: Record<string, ServiceReview> = {};
  for (const row of (data ?? []) as { appointment_id: string; rating: number; text: string | null }[]) {
    map[row.appointment_id] = { rating: row.rating, text: row.text };
  }
  return map;
}

export async function submitServiceReview(
  supabase: SupabaseClient,
  params: { clientId: string; appointmentId: string; branchId: string; rating: number; text: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("reviews").insert({
    client_id: params.clientId,
    appointment_id: params.appointmentId,
    branch_id: params.branchId,
    rating: params.rating,
    text: params.text.trim(),
  });
  if (error?.code === "23505") return { error: "You've already reviewed this service." };
  return { error: error?.message ?? null };
}

export async function getReviewableProfessionals(
  supabase: SupabaseClient,
  clientId: string
): Promise<ReviewableProfessional[]> {
  const { data: completed, error: completedError } = await supabase
    .from("appointments")
    .select("professional_id, professional:staff_members(full_name)")
    .eq("client_id", clientId)
    .eq("status", "completed")
    .not("professional_id", "is", null)
    .order("scheduled_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (completedError) console.error("getReviewableProfessionals (completed) failed:", completedError);

  const { data: reviewed, error: reviewedError } = await supabase
    .from("reviews")
    .select("professional_id")
    .eq("client_id", clientId)
    .not("professional_id", "is", null);

  if (reviewedError) console.error("getReviewableProfessionals (reviewed) failed:", reviewedError);

  const reviewedIds = new Set(
    (reviewed ?? []).map((r) => r.professional_id as string)
  );
  const seen = new Set<string>();
  const result: ReviewableProfessional[] = [];

  type CompletedRow = {
    professional_id: string | null;
    professional: Rel<{ full_name: string }>;
  };

  for (const row of (completed as unknown as CompletedRow[]) ?? []) {
    if (!row.professional_id) continue;
    if (reviewedIds.has(row.professional_id) || seen.has(row.professional_id)) continue;
    seen.add(row.professional_id);
    result.push({
      professionalId: row.professional_id,
      professionalName: one(row.professional)?.full_name ?? "Your therapist",
    });
  }

  return result;
}

export async function getMyReviews(
  supabase: SupabaseClient,
  clientId: string
): Promise<MyReview[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, rating, text, created_at, professional_id, branch_id, professional:professionals(name), branch:branches(name)"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) console.error("getMyReviews failed:", error);

  type ReviewRow = {
    id: string;
    rating: number;
    text: string | null;
    created_at: string;
    professional_id: string | null;
    branch_id: string | null;
    professional: Rel<{ name: string }>;
    branch: Rel<{ name: string }>;
  };

  return ((data as unknown as ReviewRow[]) ?? []).map((row) => {
    const isProfessional = !!row.professional_id;
    return {
      id: row.id,
      rating: row.rating,
      text: row.text,
      createdAt: row.created_at,
      targetType: isProfessional ? "professional" : "branch",
      targetName: isProfessional
        ? one(row.professional)?.name ?? "Therapist"
        : one(row.branch)?.name ?? "Blush Spa",
    };
  });
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

export async function submitReview(
  supabase: SupabaseClient,
  params: {
    clientId: string;
    professionalId?: string;
    branchId?: string;
    rating: number;
    text: string;
  }
): Promise<{ error: string | null }> {
  if (!params.professionalId && !params.branchId) {
    return { error: "Review must target a therapist or the spa." };
  }
  const { error } = await supabase.from("reviews").insert({
    client_id: params.clientId,
    professional_id: params.professionalId ?? null,
    branch_id: params.branchId ?? null,
    rating: params.rating,
    text: params.text,
  });
  return { error: error?.message ?? null };
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
  };
}
