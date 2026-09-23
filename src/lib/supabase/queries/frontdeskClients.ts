import type { SupabaseClient } from "@supabase/supabase-js";

export type FrontDeskClient = {
  id: string;
  name: string;
  vip: boolean;
  phone: string | null;
  email: string | null;
  branchName: string | null;
  memberSince: string;
  totalSpend: number;
  loyaltyPoints: number;
  allergy: string | null;
  preferences: string | null;
  gdprConsented: boolean;
};

export type ClientServiceHistoryItem = {
  id: string;
  date: string;
  service: string;
  therapist: string | null;
  price: string;
  status: string;
};

type Rel<T> = T | T[] | null;

function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type RawClientRow = {
  id: string;
  full_name: string;
  vip: boolean;
  phone: string | null;
  email: string | null;
  loyalty_points: number;
  total_spend: number;
  allergy: string | null;
  preferences: string | null;
  gdpr_consented: boolean;
  created_at: string;
  branches: Rel<{ name: string }>;
};

export async function getClients(supabase: SupabaseClient): Promise<FrontDeskClient[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, vip, phone, email, loyalty_points, total_spend, allergy, preferences, gdpr_consented, created_at, branches(name)"
    )
    .eq("role", "customer")
    .order("full_name", { ascending: true });

  if (error) console.error("getClients failed:", error);

  return ((data as unknown as RawClientRow[]) ?? []).map((row) => ({
    id: row.id,
    name: row.full_name,
    vip: row.vip,
    phone: row.phone,
    email: row.email,
    branchName: one(row.branches)?.name ?? null,
    memberSince: new Date(row.created_at).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    }),
    totalSpend: row.total_spend,
    loyaltyPoints: row.loyalty_points,
    allergy: row.allergy,
    preferences: row.preferences,
    gdprConsented: row.gdpr_consented,
  }));
}

type RawHistoryRow = {
  id: string;
  scheduled_date: string;
  status: string;
  notes: string | null;
  service: Rel<{ name: string }>;
  professional: Rel<{ name: string }>;
  payments: { amount: number }[] | null;
};

export async function getClientServiceHistory(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientServiceHistoryItem[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, scheduled_date, status, notes, service:services(name), professional:professionals(name), payments(amount)"
    )
    .eq("client_id", clientId)
    .order("scheduled_date", { ascending: false });

  if (error) console.error("getClientServiceHistory failed:", error);

  return ((data as unknown as RawHistoryRow[]) ?? []).map((row) => ({
    id: row.id,
    date: new Date(row.scheduled_date).toLocaleDateString(),
    service: one(row.service)?.name ?? row.notes ?? "Appointment",
    therapist: one(row.professional)?.name ?? null,
    price: row.payments?.[0] ? `₱${row.payments[0].amount.toLocaleString()}` : "—",
    status: row.status,
  }));
}

export async function setClientVip(
  supabase: SupabaseClient,
  clientId: string,
  isVip: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("set_client_vip", {
    target_id: clientId,
    is_vip: isVip,
  });
  return { error: error?.message ?? null };
}
