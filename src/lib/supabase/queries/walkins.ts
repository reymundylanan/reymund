import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionStatus } from "@/lib/sessionStatus";
import { isProfessionalFreeNow } from "@/lib/supabase/queries/availability";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import type { ClientMatch } from "@/lib/walkinLinking";

export type { SessionStatus };

export type WalkinRow = {
  id: string;
  walkin_name: string | null;
  walkin_phone: string | null;
  professional_id: string | null;
  service_id: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  additional_charges: number;
  status: string;
  session_status: SessionStatus | null;
  arrival_time: string | null;
  service_started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  staff_notes: string | null;
  professional: { full_name: string } | { full_name: string }[] | null;
  service: { name: string } | { name: string }[] | null;
  payments: { status: string; amount: number; method: string; reference_no: string | null; created_at: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const WALKIN_SELECT =
  "id, walkin_name, walkin_phone, professional_id, service_id, scheduled_date, start_time, duration_minutes, additional_charges, status, session_status, arrival_time, service_started_at, completed_at, notes, staff_notes, professional:staff_members(full_name), service:branch_services(name), payments(status, amount, method, reference_no, created_at)";

export async function createWalkinAppointment(
  supabase: SupabaseClient,
  input: {
    branchId: string;
    professionalId: string;
    serviceId: string;
    scheduledDate: string;
    startTime: string;
    durationMinutes: number;
    walkinName: string;
    walkinPhone: string;
    notes: string;
  }
): Promise<{ id: string | null; error: string | null }> {
  const row = {
      branch_id: input.branchId,
      client_id: null,
      professional_id: input.professionalId,
      service_id: input.serviceId,
      appointment_type: "solo",
      scheduled_date: input.scheduledDate,
      start_time: input.startTime,
      duration_minutes: input.durationMinutes,
      status: "confirmed",
      session_status: "in_service",
      arrival_time: new Date().toISOString(),
      service_started_at: new Date().toISOString(),
      walkin_name: input.walkinName,
      walkin_phone: input.walkinPhone,
      notes: input.notes,
  };
  const insert = (values: Record<string, unknown>) =>
    supabase.from("appointments").insert(values).select("id").single();

  let { data, error } = await insert({ ...row, visit_type: "walk_in" });
  if (error && isNotMigratedError(error)) {
    // Before migration 054 there is no visit_type column.
    ({ data, error } = await insert(row));
  }

  if (error || !data) {
    return { id: null, error: error?.message ?? "Failed to register walk-in." };
  }
  return { id: (data as { id: string }).id, error: null };
}

type SearchRow = {
  id: string;
  full_name: string;
  email_masked: string | null;
  phone_last4: string | null;
  provider: string;
  avatar_url: string | null;
  member_since: string;
};

export type ClientSearchResult =
  | { status: "ok"; matches: ClientMatch[] }
  | { status: "unavailable" }
  | { status: "error" };

/** Existing client accounts by name (or phone), masked for Front Desk. */
export async function searchClientAccounts(supabase: SupabaseClient, query: string): Promise<ClientSearchResult> {
  const { data, error } = await supabase.rpc("search_client_accounts", { p_query: query });
  if (error) {
    logQueryError("searchClientAccounts", error);
    return isNotMigratedError(error) ? { status: "unavailable" } : { status: "error" };
  }
  return {
    status: "ok",
    matches: ((data as SearchRow[] | null) ?? []).map((r) => ({
      id: r.id,
      fullName: r.full_name,
      emailMasked: r.email_masked,
      phoneLast4: r.phone_last4,
      provider: r.provider === "facebook" || r.provider === "google" ? r.provider : "email",
      avatarUrl: r.avatar_url,
      memberSince: r.member_since,
    })),
  };
}

/** Links a just-registered walk-in to a client account (audited in SQL). */
export async function linkWalkinClient(
  supabase: SupabaseClient,
  appointmentId: string,
  clientId: string
): Promise<string | null> {
  const { error } = await supabase.rpc("link_walkin_client", {
    p_appointment_id: appointmentId,
    p_client_id: clientId,
  });
  if (!error) return null;
  logQueryError("linkWalkinClient", error);
  return "The walk-in was checked in, but linking the client account failed. Ask Admin to link it.";
}

export async function updateWalkinAppointment(
  supabase: SupabaseClient,
  input: {
    appointmentId: string;
    professionalId: string;
    serviceId: string;
    serviceName: string;
    servicePrice: number;
    startTime: string;
    durationMinutes: number;
    walkinName: string;
    walkinPhone: string;
    additionalCharges: number;
    scheduledDate: string;
  }
): Promise<{ error: string | null }> {
  const stillFree = await isProfessionalFreeNow(supabase, {
    professionalId: input.professionalId,
    scheduledDate: input.scheduledDate,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    excludeAppointmentId: input.appointmentId,
  });
  if (!stillFree) {
    return { error: "That therapist is already booked at that time. Pick another slot or therapist." };
  }

  const { data: staffRow } = await supabase
    .from("staff_members")
    .select("full_name")
    .eq("id", input.professionalId)
    .single();
  const therapistName = (staffRow as { full_name: string } | null)?.full_name ?? "therapist";
  const total = input.servicePrice + input.additionalCharges;
  const notes = `${input.serviceName} with ${therapistName} — ₱${total.toLocaleString()}.00`;

  const { error } = await supabase
    .from("appointments")
    .update({
      professional_id: input.professionalId,
      service_id: input.serviceId,
      start_time: input.startTime,
      duration_minutes: input.durationMinutes,
      walkin_name: input.walkinName,
      walkin_phone: input.walkinPhone,
      additional_charges: input.additionalCharges,
      notes,
    })
    .eq("id", input.appointmentId);

  return { error: error?.message ?? null };
}

export async function getTodaysWalkins(
  supabase: SupabaseClient,
  branchId: string,
  todayKey: string
): Promise<WalkinRow[]> {
  const base = () =>
    supabase.from("appointments").select(WALKIN_SELECT).eq("branch_id", branchId).eq("scheduled_date", todayKey);
  // Walk-ins linked to a client account have a client_id, so visit_type
  // (migration 054) decides; before 054, walk-ins are the rows without one.
  let { data, error } = await base()
    .eq("visit_type", "walk_in")
    .neq("status", "cancelled")
    .order("start_time", { ascending: false });
  if (error && isNotMigratedError(error)) {
    ({ data, error } = await base()
      .is("client_id", null)
      .neq("status", "cancelled")
      .order("start_time", { ascending: false }));
  }

  if (error) {
    console.error("getTodaysWalkins failed:", error);
    return [];
  }
  return (data as unknown as WalkinRow[]) ?? [];
}

export async function updateWalkinNotes(
  supabase: SupabaseClient,
  appointmentId: string,
  notes: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("appointments")
    .update({ staff_notes: notes })
    .eq("id", appointmentId);
  return { error: error?.message ?? null };
}

export function walkinProfessionalName(row: WalkinRow): string {
  return one(row.professional)?.full_name ?? "Unassigned";
}

export function walkinServiceName(row: WalkinRow): string {
  return one(row.service)?.name ?? row.notes ?? "—";
}

export function walkinPaymentStatus(row: WalkinRow): { paid: boolean; amount: number | null; paidAt: string | null } {
  const settled = (row.payments ?? []).find((p) => p.status === "settled");
  return { paid: !!settled, amount: settled?.amount ?? null, paidAt: settled?.created_at ?? null };
}

/** Quoted price at registration time, parsed out of the notes text
 * ("Foot Spa with Ms. Ann — ₱500.00") since the base price isn't stored
 * as its own column — same convention already used elsewhere in the
 * app. This already includes additional_charges, since notes gets
 * regenerated on edit to reflect the new total. */
export function walkinQuotedAmount(row: WalkinRow): number | null {
  const match = row.notes?.match(/₱([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}
