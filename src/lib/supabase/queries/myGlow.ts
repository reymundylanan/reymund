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
  serviceName: string | null;
  professionalName: string | null;
};

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

export type DefaultBranch = { id: string; name: string } | null;

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
  service: Rel<{ name: string }>;
  professional: Rel<{ name: string }>;
  branch: Rel<{ name: string }>;
};

export async function getUpcomingAppointment(
  supabase: SupabaseClient,
  clientId: string
): Promise<UpcomingAppointment | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, scheduled_date, start_time, duration_minutes, status, service:services(name), professional:professionals(name), branch:branches(name)"
    )
    .eq("client_id", clientId)
    .in("status", ["confirmed", "pending"])
    .gte("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as RawAppointmentRow;
  return {
    id: row.id,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    serviceName: one(row.service)?.name ?? null,
    professionalName: one(row.professional)?.name ?? null,
    branchName: one(row.branch)?.name ?? null,
  };
}

export async function getRecentAppointments(
  supabase: SupabaseClient,
  clientId: string,
  limit = 10
): Promise<RecentAppointment[]> {
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, scheduled_date, start_time, status, service:services(name), professional:professionals(name)"
    )
    .eq("client_id", clientId)
    .order("scheduled_date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(limit);

  return ((data as unknown as RawAppointmentRow[]) ?? []).map((row) => ({
    id: row.id,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    status: row.status,
    serviceName: one(row.service)?.name ?? null,
    professionalName: one(row.professional)?.name ?? null,
  }));
}

export async function getReviewableProfessionals(
  supabase: SupabaseClient,
  clientId: string
): Promise<ReviewableProfessional[]> {
  const { data: completed } = await supabase
    .from("appointments")
    .select("professional_id, professional:professionals(name)")
    .eq("client_id", clientId)
    .eq("status", "completed")
    .not("professional_id", "is", null);

  const { data: reviewed } = await supabase
    .from("reviews")
    .select("professional_id")
    .eq("client_id", clientId)
    .not("professional_id", "is", null);

  const reviewedIds = new Set(
    (reviewed ?? []).map((r) => r.professional_id as string)
  );
  const seen = new Set<string>();
  const result: ReviewableProfessional[] = [];

  type CompletedRow = {
    professional_id: string | null;
    professional: Rel<{ name: string }>;
  };

  for (const row of (completed as unknown as CompletedRow[]) ?? []) {
    if (!row.professional_id) continue;
    if (reviewedIds.has(row.professional_id) || seen.has(row.professional_id)) continue;
    seen.add(row.professional_id);
    result.push({
      professionalId: row.professional_id,
      professionalName: one(row.professional)?.name ?? "Your therapist",
    });
  }

  return result;
}

export async function getMyReviews(
  supabase: SupabaseClient,
  clientId: string
): Promise<MyReview[]> {
  const { data } = await supabase
    .from("reviews")
    .select(
      "id, rating, text, created_at, professional_id, branch_id, professional:professionals(name), branch:branches(name)"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

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

export async function getDefaultBranch(
  supabase: SupabaseClient,
  clientId: string
): Promise<DefaultBranch> {
  const { data } = await supabase
    .from("appointments")
    .select("branch:branches(id, name)")
    .eq("client_id", clientId)
    .not("branch_id", "is", null)
    .order("scheduled_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const branch = one(
    (data as { branch: Rel<{ id: string; name: string }> } | null)?.branch ?? null
  );
  return branch ? { id: branch.id, name: branch.name } : null;
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
