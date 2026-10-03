import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeEqual } from "@/lib/messenger/signature";
import { buildEmail, buildPushPayload, isGonePushStatus, retryDelayMinutes, type NoticeForDelivery } from "@/lib/notifications/delivery";
import { getEmailSender, getPushSender } from "@/lib/notifications/senders";

// Called every minute by pg_cron (068 notify_ping_dispatcher) while email or
// push deliveries are due. Uses the same bearer secret as review evaluation.

export const maxDuration = 60;

const BATCH_SIZE = 40;
const TIME_BUDGET_MS = 45_000;

type DeliveryRow = {
  id: string;
  notification_id: string;
  channel: "email" | "push";
  attempts: number;
};

type NoticeRow = {
  id: string;
  client_id: string;
  kind: string;
  title: string;
  body: string;
  link_path: string;
  client: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

type Outcome = { kind: "sent" } | { kind: "skipped"; reason: string } | { kind: "retry"; error: string } | { kind: "fail"; error: string };

export async function POST(request: Request) {
  const expected = process.env.REVIEW_EVAL_SECRET;
  const provided = request.headers.get("authorization") ?? "";
  if (!expected || !safeEqual(provided, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() || new URL(request.url).origin;
  const sendEmail = getEmailSender();
  const sendPush = getPushSender();

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_notification_deliveries", { p_limit: BATCH_SIZE });
  if (error) {
    console.error("claim_notification_deliveries failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as DeliveryRow[]) ?? [];
  const tally = { claimed: rows.length, sent: 0, skipped: 0, retried: 0, failed: 0, released: 0 };
  const started = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (Date.now() - started > TIME_BUDGET_MS) {
      for (const rest of rows.slice(i)) {
        await supabase
          .from("notification_deliveries")
          .update({ status: "pending", attempts: rest.attempts - 1, claimed_at: null })
          .eq("id", rest.id);
        tally.released += 1;
      }
      break;
    }

    let outcome: Outcome;
    try {
      outcome = await deliver(row, supabase, siteUrl, sendEmail, sendPush);
    } catch (err) {
      console.error("Notification delivery failed:", row.id, err);
      outcome = { kind: "retry", error: String(err instanceof Error ? err.message : err).slice(0, 500) };
    }
    tally[await record(supabase, row, outcome)] += 1;
  }

  return NextResponse.json(tally);
}

async function deliver(
  row: DeliveryRow,
  supabase: SupabaseClient,
  siteUrl: string,
  sendEmail: ReturnType<typeof getEmailSender>,
  sendPush: ReturnType<typeof getPushSender>
): Promise<Outcome> {
  const { data, error } = await supabase
    .from("client_notifications")
    .select("id, client_id, kind, title, body, link_path, client:profiles!client_notifications_client_id_fkey(full_name, email)")
    .eq("id", row.notification_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { kind: "skipped", reason: "notice_missing" };

  const n = data as unknown as NoticeRow;
  const client = Array.isArray(n.client) ? n.client[0] ?? null : n.client;

  const { data: prefs, error: prefsError } = await supabase
    .from("notification_preferences")
    .select("email_enabled, push_enabled")
    .eq("profile_id", n.client_id)
    .maybeSingle();
  if (prefsError) throw prefsError;

  const notice: NoticeForDelivery = {
    kind: n.kind,
    title: n.title,
    body: n.body,
    linkPath: n.link_path,
    firstName: (client?.full_name ?? "").trim().split(/\s+/)[0] ?? "",
  };

  if (row.channel === "email") {
    if (prefs && !prefs.email_enabled) return { kind: "skipped", reason: "email_off" };
    if (!sendEmail) return { kind: "skipped", reason: "email_not_configured" };
    const to = client?.email?.trim();
    if (!to) return { kind: "skipped", reason: "no_email" };
    await sendEmail(to, buildEmail(notice, siteUrl));
    return { kind: "sent" };
  }

  if (prefs && !prefs.push_enabled) return { kind: "skipped", reason: "push_off" };
  if (!sendPush) return { kind: "skipped", reason: "push_not_configured" };

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", n.client_id);
  if (subsError) throw subsError;
  if (!subs || subs.length === 0) return { kind: "skipped", reason: "no_devices" };

  const payload = buildPushPayload(notice, n.id);
  let delivered = 0;
  let lastError = "";
  for (const sub of subs) {
    try {
      await sendPush(sub, payload);
      delivered += 1;
      await supabase.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", sub.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (isGonePushStatus(status)) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        lastError = `push ${status ?? "error"}: ${String(err instanceof Error ? err.message : err)}`.slice(0, 500);
      }
    }
  }
  if (delivered > 0) return { kind: "sent" };
  if (lastError) return { kind: "retry", error: lastError };
  return { kind: "skipped", reason: "devices_gone" };
}

async function record(supabase: SupabaseClient, row: DeliveryRow, outcome: Outcome): Promise<"sent" | "skipped" | "retried" | "failed"> {
  if (outcome.kind === "sent") {
    await supabase.from("notification_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
    return "sent";
  }
  if (outcome.kind === "skipped") {
    await supabase.from("notification_deliveries").update({ status: "skipped", skip_reason: outcome.reason }).eq("id", row.id);
    return "skipped";
  }
  if (outcome.kind === "retry") {
    const delay = retryDelayMinutes(row.attempts);
    if (delay !== null) {
      await supabase
        .from("notification_deliveries")
        .update({ status: "pending", next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString(), last_error: outcome.error })
        .eq("id", row.id);
      return "retried";
    }
  }
  await supabase.from("notification_deliveries").update({ status: "failed", last_error: outcome.error }).eq("id", row.id);
  return "failed";
}
