import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";

export type PointsEntry = {
  id: string;
  type: "opening_balance" | "review_reward" | "admin_adjustment";
  points: number;
  balanceAfter: number;
  createdAt: string;
  label: string;
};
export type MyRewards = { balance: number; lifetimeEarned: number; history: PointsEntry[]; hasMore: boolean };

export const REWARDS_PAGE_SIZE = 10;

export function describeEntry(type: string, note: string | null, serviceName: string | null): string {
  void note;
  if (type === "review_reward") return serviceName ? `Review — ${serviceName}` : "Review reward";
  if (type === "admin_adjustment") return "Review check (team)";
  if (type === "opening_balance") return "Starting balance";
  return "GlowPoints";
}

type Booked = { service_name: string; position: number };
type TransactionRow = {
  id: string;
  type: PointsEntry["type"];
  points: number;
  balance_after: number;
  note: string | null;
  created_at: string;
  appointment: { booked: Booked[] | null } | { booked: Booked[] | null }[] | null;
};

function firstServiceName(appointment: TransactionRow["appointment"]): string | null {
  const appt = Array.isArray(appointment) ? appointment[0] : appointment;
  const booked = [...(appt?.booked ?? [])].sort((a, b) => a.position - b.position);
  return booked[0]?.service_name ?? null;
}

/** One page of points history, newest first. Returns null when the read fails (e.g. before migration 052). */
export async function getPointsHistoryPage(
  supabase: SupabaseClient,
  clientId: string,
  offset: number
): Promise<{ history: PointsEntry[]; hasMore: boolean } | null> {
  const { data, error } = await supabase
    .from("points_transactions")
    .select(
      "id, type, points, balance_after, note, created_at, appointment:appointments(booked:appointment_services(service_name, position))"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + REWARDS_PAGE_SIZE);
  if (error) {
    logQueryError("getPointsHistoryPage", error);
    return null;
  }
  const rows = (data ?? []) as unknown as TransactionRow[];
  return {
    hasMore: rows.length > REWARDS_PAGE_SIZE,
    history: rows.slice(0, REWARDS_PAGE_SIZE).map((r) => ({
      id: r.id,
      type: r.type,
      points: r.points,
      balanceAfter: r.balance_after,
      createdAt: r.created_at,
      label: describeEntry(r.type, r.note, firstServiceName(r.appointment)),
    })),
  };
}

export async function getMyRewards(
  supabase: SupabaseClient,
  clientId: string,
  fallbackPoints: number,
  offset = 0
): Promise<MyRewards> {
  const fallback: MyRewards = { balance: fallbackPoints, lifetimeEarned: fallbackPoints, history: [], hasMore: false };

  const { data: rewards, error } = await supabase
    .from("client_rewards")
    .select("current_points, lifetime_earned")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) {
    logQueryError("getMyRewards client_rewards", error);
    return fallback;
  }

  const page = await getPointsHistoryPage(supabase, clientId, offset);
  if (!page) return fallback;

  return {
    balance: rewards?.current_points ?? fallbackPoints,
    lifetimeEarned: rewards?.lifetime_earned ?? fallbackPoints,
    history: page.history,
    hasMore: page.hasMore,
  };
}
