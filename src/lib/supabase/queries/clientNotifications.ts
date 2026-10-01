import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";

export type NotificationKind =
  | "confirmed"
  | "cancelled"
  | "review_request"
  | "review_reward"
  | "voucher_expired"
  | "voucher_cancelled"
  | "points_adjusted"
  | "no_show";

export type ClientNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  linkPath: string;
  readAt: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link_path: string;
  read_at: string | null;
  created_at: string;
};

export function toClientNotification(r: Row): ClientNotification {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    linkPath: r.link_path,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

/** Latest notifications for the signed-in client (RLS limits rows to their own). */
export async function listClientNotifications(
  supabase: SupabaseClient,
  clientId: string,
  limit = 20
): Promise<ClientNotification[]> {
  const { data, error } = await supabase
    .from("client_notifications")
    .select("id, kind, title, body, link_path, read_at, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logQueryError("listClientNotifications", error);
    return [];
  }
  return ((data ?? []) as Row[]).map(toClientNotification);
}

export async function markNotificationRead(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from("client_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) logQueryError("markNotificationRead", error);
}

export async function markAllNotificationsRead(supabase: SupabaseClient, clientId: string) {
  const { error } = await supabase
    .from("client_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .is("read_at", null);
  if (error) logQueryError("markAllNotificationsRead", error);
}
