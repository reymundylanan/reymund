import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessengerConfig, type MessengerConfig } from "@/lib/messenger/config";
import { safeEqual, verifySignature } from "@/lib/messenger/signature";
import { parseMessagingEvent, type MessagingEvent } from "@/lib/messenger/webhookEvents";
import { sendToGraph } from "@/lib/messenger/graph";
import { buildButtonMessage, buildTextMessage } from "@/lib/messenger/messages";

type WebhookBody = {
  object?: string;
  entry?: { messaging?: MessagingEvent[]; changes?: unknown[] }[];
};

// Meta's subscription handshake.
export async function GET(request: Request) {
  const config = getMessengerConfig();
  const params = new URL(request.url).searchParams;
  if (
    config &&
    params.get("hub.mode") === "subscribe" &&
    safeEqual(params.get("hub.verify_token") ?? "", config.verifyToken)
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const config = getMessengerConfig();
  if (!config) return new Response("Messenger not configured", { status: 503 });

  const raw = Buffer.from(await request.arrayBuffer());
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Always 200 after a valid signature: a non-200 makes Meta retry and
  // eventually disable the webhook.
  try {
    const body = JSON.parse(raw.toString("utf8")) as WebhookBody;
    const supabase = createAdminClient();
    for (const entry of body.entry ?? []) {
      if (entry.changes?.length) {
        console.info("Messenger webhook change:", JSON.stringify(entry.changes));
      }
      for (const event of entry.messaging ?? []) {
        try {
          await handleEvent(event, supabase, config);
        } catch (err) {
          console.error("Messenger webhook event failed:", err);
        }
      }
    }
  } catch (err) {
    console.error("Messenger webhook body invalid:", err);
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function reply(config: MessengerConfig, payload: unknown) {
  const res = await sendToGraph(config, payload);
  if (res.status >= 300) console.error("Messenger reply failed:", JSON.stringify(res.body));
}

async function handleEvent(event: MessagingEvent, supabase: SupabaseClient, config: MessengerConfig) {
  const action = parseMessagingEvent(event);
  if (action.type === "ignore") return;

  const now = new Date().toISOString();

  if (action.type === "link") {
    const { data: token, error: tokenError } = await supabase
      .from("messenger_link_tokens")
      .update({ used_at: now })
      .eq("token", action.ref)
      .is("used_at", null)
      .gt("expires_at", now)
      .select("profile_id")
      .maybeSingle();

    if (tokenError) throw tokenError;

    if (!token) {
      await reply(
        config,
        buildTextMessage(action.psid, "This link has expired — tap Connect Messenger in GlowSync again.")
      );
      return;
    }

    // A Messenger account belongs to one GlowSync client at a time.
    const { error: deleteError } = await supabase.from("messenger_subscriptions").delete().eq("psid", action.psid).neq("profile_id", token.profile_id);
    if (deleteError) throw deleteError;

    const { error } = await supabase.from("messenger_subscriptions").upsert(
      { profile_id: token.profile_id, psid: action.psid, linked_at: now, last_inbound_at: now, opted_out_at: null },
      { onConflict: "profile_id" }
    );
    if (error) throw error;

    await reply(
      config,
      buildButtonMessage(
        action.psid,
        "You're connected to GlowSync ✨ We'll send your appointment reminders and updates here.",
        "Open My Glow",
        `${config.siteUrl}/my-glow`,
        "RESPONSE"
      )
    );
    return;
  }

  const { data: updated, error: updateError } = await supabase
    .from("messenger_subscriptions")
    .update({ last_inbound_at: now })
    .eq("psid", action.psid)
    .select("profile_id");
  if (updateError) throw updateError;

  const isSubscribed = (updated?.length ?? 0) > 0;

  if (action.type === "stop" && isSubscribed) {
    const { error: stopError } = await supabase.from("messenger_subscriptions").update({ opted_out_at: now }).eq("psid", action.psid);
    if (stopError) throw stopError;

    await reply(
      config,
      buildTextMessage(action.psid, "You won't get GlowSync updates here anymore. Type START anytime to turn them back on.")
    );
  } else if (action.type === "start") {
    if (isSubscribed) {
      const { error: startError } = await supabase.from("messenger_subscriptions").update({ opted_out_at: null }).eq("psid", action.psid);
      if (startError) throw startError;

      await reply(config, buildTextMessage(action.psid, "You're back on! We'll send your GlowSync updates here."));
    } else {
      await reply(
        config,
        buildButtonMessage(
          action.psid,
          "To get GlowSync updates here, tap Connect Messenger on your My Glow page.",
          "Open My Glow",
          `${config.siteUrl}/my-glow`,
          "RESPONSE"
        )
      );
    }
  }
}
