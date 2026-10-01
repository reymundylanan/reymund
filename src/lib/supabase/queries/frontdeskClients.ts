import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import { formatVisitDate } from "@/lib/clientDirectory";

export type FrontDeskClient = {
  id: string;
  name: string;
  vip: boolean;
  phone: string | null;
  email: string | null;
  gender: string | null;
  address: string | null;
  avatarUrl: string | null;
  branchName: string | null;
  memberSince: string;
  totalSpend: number;
  totalVisits: number;
  visitsThisYear: number;
  lastVisit: string | null; // YYYY-MM-DD
  /** False before migration 058: spend/visits then come from what this desk can see. */
  statsAvailable: boolean;
  loyaltyPoints: number;
  allergy: string | null;
  preferences: string | null;
  gdprConsented: boolean;
};

export type ClientServiceHistoryItem = {
  id: string;
  date: string;
  dateKey: string;
  completed: boolean;
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
  gender: string | null;
  address: string | null;
  avatar_url: string | null;
  loyalty_points: number;
  total_spend: number;
  allergy: string | null;
  preferences: string | null;
  gdpr_consented: boolean;
  created_at: string;
  branches: Rel<{ name: string }>;
};

type ClientStats = { totalSpend: number; totalVisits: number; visitsThisYear: number; lastVisit: string | null };

/** Lifetime spend and visits across all branches (058). Null when the
 * migration isn't applied yet or the call fails. */
export async function getClientVisitStats(supabase: SupabaseClient): Promise<Map<string, ClientStats> | null> {
  const { data, error } = await supabase.rpc("client_visit_stats");
  if (error) {
    if (!isNotMigratedError(error) && error.code !== "PGRST202") logQueryError("client_visit_stats", error);
    return null;
  }
  const map = new Map<string, ClientStats>();
  const rows = (data ?? []) as {
    client_id: string;
    total_spend: number | string | null;
    total_visits: number | null;
    visits_this_year: number | null;
    last_visit: string | null;
  }[];
  for (const r of rows) {
    map.set(r.client_id, {
      totalSpend: Number(r.total_spend ?? 0),
      totalVisits: r.total_visits ?? 0,
      visitsThisYear: r.visits_this_year ?? 0,
      lastVisit: r.last_visit,
    });
  }
  return map;
}

export async function getClients(supabase: SupabaseClient): Promise<FrontDeskClient[]> {
  const [{ data, error }, stats] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, vip, phone, email, gender, address, avatar_url, loyalty_points, total_spend, allergy, preferences, gdpr_consented, created_at, branches(name)"
      )
      .eq("role", "customer")
      .order("full_name", { ascending: true }),
    getClientVisitStats(supabase),
  ]);

  logQueryError("getClients", error);

  return ((data as unknown as RawClientRow[]) ?? []).map((row) => {
    const st = stats?.get(row.id);
    return {
      id: row.id,
      name: row.full_name,
      vip: row.vip,
      phone: row.phone,
      email: row.email,
      gender: row.gender,
      address: row.address,
      avatarUrl: row.avatar_url,
      branchName: one(row.branches)?.name ?? null,
      memberSince: new Date(row.created_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      }),
      totalSpend: st ? st.totalSpend : Number(row.total_spend ?? 0),
      totalVisits: st?.totalVisits ?? 0,
      visitsThisYear: st?.visitsThisYear ?? 0,
      lastVisit: st?.lastVisit ?? null,
      statsAvailable: stats !== null,
      loyaltyPoints: row.loyalty_points,
      allergy: row.allergy,
      preferences: row.preferences,
      gdprConsented: row.gdpr_consented,
    };
  });
}

type RawHistoryRow = {
  id: string;
  scheduled_date: string;
  status: string;
  session_status: string | null;
  notes: string | null;
  service: Rel<{ name: string }>;
  professional: Rel<{ full_name: string }>;
  payments: { amount: number; status: string }[] | null;
};

export async function getClientServiceHistory(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientServiceHistoryItem[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, scheduled_date, status, session_status, notes, service:branch_services(name), professional:staff_members(full_name), payments(amount, status)"
    )
    .eq("client_id", clientId)
    .order("scheduled_date", { ascending: false });

  if (error) console.error("getClientServiceHistory failed:", error);

  return ((data as unknown as RawHistoryRow[]) ?? []).map((row) => {
    const session = row.session_status ?? "";
    const completed =
      row.status !== "cancelled" && (row.status === "completed" || session === "completed" || session === "paid");
    const paid = (row.payments ?? []).find((p) => p.status === "settled") ?? row.payments?.[0];
    return {
      id: row.id,
      date: formatVisitDate(row.scheduled_date),
      dateKey: row.scheduled_date,
      completed,
      service: one(row.service)?.name ?? row.notes ?? "Appointment",
      therapist: one(row.professional)?.full_name ?? null,
      price: paid ? `₱${Number(paid.amount).toLocaleString()}` : "—",
      // Finished visits are recorded in session_status; show that.
      status: completed
        ? "completed"
        : session === "no_show"
          ? "no_show"
          : session === "in_service"
            ? "in_service"
            : row.status,
    };
  });
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
