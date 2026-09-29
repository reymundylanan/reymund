import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessengerConfig, missingMessengerEnv, type MessengerConfig } from "@/lib/messenger/config";
import { safeEqual } from "@/lib/messenger/signature";
import { manilaScheduledAt, skipReason, type OutboxKind } from "@/lib/messenger/dispatchRules";
import { classifyGraphResponse, retryDelayMinutes, type SendOutcome } from "@/lib/messenger/errors";
import { buildAppointmentTemplateMessage, buildButtonMessage } from "@/lib/messenger/messages";
import type { AppointmentTemplateKind } from "@/lib/messenger/templates";
import { sendToGraph } from "@/lib/messenger/graph";

export const maxDuration = 60;

const BATCH_SIZE = 50;

type OutboxRow = {
  id: string;
  profile_id: string;
  kind: OutboxKind;
  appointment_id: string | null;
  update_type: "rescheduled" | "cancelled" | "no_show" | null;
  remind_for: string | null;
  custom_text: string | null;
  link_path: string;
  attempts: number;
};

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type AppointmentRow = {
  id: string;
  scheduled_date: string;
  start_time: string;
  status: string;
  session_status: string | null;
  notes: string | null;
  service: Rel<{ name: string }>;
  branch: Rel<{ name: string }>;
  client: Rel<{ full_name: string | null }>;
};

const APPOINTMENT_SELECT =
  "id, scheduled_date, start_time, status, session_status, notes, service:branch_services(name), branch:branches(name), client:profiles!appointments_client_id_fkey(full_name)";

type Result = "sent" | "skipped" | "failed" | "retried" | "released";

const TIME_BUDGET_MS = 45_000;

export async function POST(request: Request) {
  const expected = process.env.MESSENGER_DISPATCH_SECRET;
  const provided = request.headers.get("authorization") ?? "";
  if (!expected || !safeEqual(provided, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getMessengerConfig();
  if (!config) {
    return NextResponse.json({ error: "Messenger not configured", missing: missingMessengerEnv() }, { status: 503 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_messenger_outbox", { p_limit: BATCH_SIZE });
  if (error) {
    console.error("claim_messenger_outbox failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as OutboxRow[]) ?? [];
  const tally = { claimed: rows.length, sent: 0, skipped: 0, failed: 0, retried: 0, released: 0 };
  const started = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (Date.now() - started > TIME_BUDGET_MS) {
      for (let j = i; j < rows.length; j++) {
        const releaseRow = rows[j];
        const { error: releaseError } = await supabase
          .from("messenger_outbox")
          .update({ status: "pending", attempts: releaseRow.attempts - 1, claimed_at: null })
          .eq("id", releaseRow.id);
        if (releaseError) {
          console.error("Messenger outbox: failed to release row", releaseRow.id, releaseError);
        }
        tally.released += 1;
      }
      break;
    }

    let result: Result;
    try {
      result = await processRow(row, supabase, config);
    } catch (err) {
      console.error("Messenger dispatch row failed:", row.id, err);
      result = await applyOutcome(supabase, row, { kind: "retry", error: String(err) });
    }
    tally[result] += 1;
  }

  await supabase
    .from("messenger_dispatch_runs")
    .update({ last_run_at: new Date().toISOString(), last_sent: tally.sent, last_failed: tally.failed })
    .eq("id", true);

  return NextResponse.json(tally);
}

async function processRow(row: OutboxRow, supabase: SupabaseClient, config: MessengerConfig): Promise<Result> {
  const { data: sub, error: subError } = await supabase
    .from("messenger_subscriptions")
    .select("psid, opted_out_at, last_inbound_at")
    .eq("profile_id", row.profile_id)
    .maybeSingle();

  if (subError) {
    throw subError;
  }

  let appt: AppointmentRow | null = null;
  if (row.appointment_id) {
    const { data, error: apptError } = await supabase.from("appointments").select(APPOINTMENT_SELECT).eq("id", row.appointment_id).maybeSingle();
    if (apptError) {
      throw apptError;
    }
    appt = data as unknown as AppointmentRow | null;
  }

  const reason = skipReason({
    kind: row.kind,
    subscription: sub ? { optedOutAt: sub.opted_out_at, lastInboundAt: sub.last_inbound_at } : null,
    appointment: appt
      ? { status: appt.status, sessionStatus: appt.session_status, scheduledAt: manilaScheduledAt(appt.scheduled_date, appt.start_time) }
      : null,
    remindFor: row.remind_for,
    now: new Date(),
  });

  if (reason || !sub) {
    const { error: skipError } = await supabase.from("messenger_outbox").update({ status: "skipped", skip_reason: reason ?? "not_subscribed" }).eq("id", row.id);
    if (skipError) {
      throw skipError;
    }
    return "skipped";
  }

  const kind = templateKind(row);
  if (appt && (row.kind === "reminder" || row.kind === "appointment_update") && kind === null) {
    return applyOutcome(supabase, row, { kind: "fail", error: "appointment_update without update_type" });
  }

  const payload =
    appt && (row.kind === "reminder" || row.kind === "appointment_update")
      ? buildAppointmentTemplateMessage(sub.psid, kind as AppointmentTemplateKind, {
          appointmentId: appt.id,
          firstName: (one(appt.client)?.full_name ?? "").split(" ")[0],
          serviceName: one(appt.service)?.name ?? appt.notes ?? "",
          branchName: one(appt.branch)?.name ?? "",
          scheduledDate: appt.scheduled_date,
          startTime: appt.start_time,
        })
      : buildButtonMessage(
          sub.psid,
          row.custom_text ?? "",
          row.kind === "promo" ? "View promo" : "Book now",
          `${config.siteUrl}${row.link_path}`,
          "UPDATE"
        );

  const res = await sendToGraph(config, payload);
  return applyOutcome(supabase, row, classifyGraphResponse(res.status, res.body));
}

function templateKind(row: OutboxRow): AppointmentTemplateKind | null {
  if (row.kind === "reminder") {
    return "reminder";
  }
  if (row.kind === "appointment_update" && row.update_type === null) {
    return null;
  }
  return row.update_type ?? "rescheduled";
}

async function applyOutcome(supabase: SupabaseClient, row: OutboxRow, outcome: SendOutcome): Promise<Result> {
  const now = new Date();

  if (outcome.kind === "sent") {
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from("messenger_outbox").update({ status: "sent", sent_at: now.toISOString(), last_error: null }).eq("id", row.id);
      if (!error) {
        return "sent";
      }
      lastError = error.message;
    }
    console.error("Messenger outbox: sent but could not mark row", row.id, lastError);
    return "sent";
  }

  if (outcome.kind === "retry") {
    const delay = retryDelayMinutes(row.attempts);
    if (delay !== null) {
      const { error } = await supabase
        .from("messenger_outbox")
        .update({
          status: "pending",
          next_attempt_at: new Date(now.getTime() + delay * 60_000).toISOString(),
          last_error: outcome.error,
        })
        .eq("id", row.id);
      if (error) {
        console.error("Messenger outbox: failed to set retry", row.id, error);
      }
      return "retried";
    }
  }

  const { error: failError } = await supabase.from("messenger_outbox").update({ status: "failed", last_error: outcome.error }).eq("id", row.id);
  if (failError) {
    console.error("Messenger outbox: failed to mark failed", row.id, failError);
  }
  if (outcome.kind === "fail_opt_out") {
    const { error: optOutError } = await supabase.from("messenger_subscriptions").update({ opted_out_at: now.toISOString() }).eq("profile_id", row.profile_id);
    if (optOutError) {
      console.error("Messenger subscriptions: failed to mark opted out", row.profile_id, optOutError);
    }
  }
  return "failed";
}
