import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationBroadcast = {
  id: string;
  subject: string;
  message: string;
  link_path: string;
  recipient_count: number;
  created_at: string;
  sent_by_name: string;
  channels: string[];
};

type Rel<T> = T | T[] | null;

function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function getEligibleRecipientCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "customer")
    .not("email", "is", null);

  if (error) {
    console.error("getEligibleRecipientCount failed:", error);
    return 0;
  }
  return count ?? 0;
}

type Row = {
  id: string;
  subject: string;
  message: string;
  link_path: string;
  recipient_count: number;
  created_at: string;
  channels: string[] | null;
  sent_by: Rel<{ full_name: string }>;
};

export async function getBroadcastHistory(supabase: SupabaseClient): Promise<NotificationBroadcast[]> {
  const { data, error } = await supabase
    .from("notification_broadcasts")
    .select("id, subject, message, link_path, recipient_count, created_at, channels, sent_by:profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("getBroadcastHistory failed:", error);
    return [];
  }

  return ((data as unknown as Row[]) ?? []).map((row) => ({
    id: row.id,
    subject: row.subject,
    message: row.message,
    link_path: row.link_path,
    recipient_count: row.recipient_count,
    created_at: row.created_at,
    sent_by_name: one(row.sent_by)?.full_name ?? "Unknown",
    channels: row.channels ?? ["email"],
  }));
}

export type PromoOption = { id: string; label: string };

export async function getActivePromoOptions(supabase: SupabaseClient): Promise<PromoOption[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("branch_promotions")
    .select("id, title, branch:branches(name)")
    .eq("is_active", true)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getActivePromoOptions failed:", error);
    return [];
  }
  return ((data as unknown as { id: string; title: string; branch: Rel<{ name: string }> }[]) ?? []).map((p) => ({
    id: p.id,
    label: one(p.branch)?.name ? `${p.title} — ${one(p.branch)!.name}` : p.title,
  }));
}
