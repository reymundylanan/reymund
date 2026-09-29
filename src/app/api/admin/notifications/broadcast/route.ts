import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessengerConfig } from "@/lib/messenger/config";

const BRAND_COLOR = "#C9A84A";

type Channel = "email" | "messenger";

function buildEmailHtml(subject: string, message: string, linkUrl: string, buttonLabel: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 22px; font-weight: 700; color: #2b1a16; font-style: italic;">Blush Spa &amp; Aesthetics</p>
      <h1 style="font-size: 18px; color: #2b1a16;">${subject}</h1>
      <p style="font-size: 14px; color: #2b1a16; line-height: 1.6; white-space: pre-wrap;">${message}</p>
      <a href="${linkUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: ${BRAND_COLOR}; color: white; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        ${buttonLabel}
      </a>
    </div>
  `;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const linkTarget = body?.linkTarget === "promo" ? "promo" : "booking";
  const promoId = typeof body?.promoId === "string" ? body.promoId : null;
  const channels: Channel[] = Array.isArray(body?.channels)
    ? (body.channels as unknown[]).filter((c): c is Channel => c === "email" || c === "messenger")
    : ["email"];

  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }
  if (channels.length === 0) {
    return NextResponse.json({ error: "Choose at least one channel." }, { status: 400 });
  }

  let linkPath = "/?intent=booking";
  if (linkTarget === "promo") {
    const today = new Date().toISOString().slice(0, 10);
    const { data: promo } = promoId
      ? await supabase
          .from("branch_promotions")
          .select("id")
          .eq("id", promoId)
          .eq("is_active", true)
          .or(`valid_until.is.null,valid_until.gte.${today}`)
          .maybeSingle()
      : { data: null };
    if (!promo) {
      return NextResponse.json({ error: "Choose an active promo to link to." }, { status: 400 });
    }
    linkPath = `/promos/${promo.id}`;
  }

  const wantsEmail = channels.includes("email");
  const wantsMessenger = channels.includes("messenger");

  const apiKey = process.env.RESEND_API_KEY;
  if (wantsEmail && !apiKey) {
    return NextResponse.json(
      { error: "Email sending isn't set up yet — add RESEND_API_KEY to continue." },
      { status: 500 }
    );
  }
  if (wantsMessenger && !getMessengerConfig()) {
    return NextResponse.json({ error: "Messenger isn't set up yet." }, { status: 400 });
  }

  const emails: string[] = [];
  if (wantsEmail) {
    const PAGE_SIZE = 1000;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data: page, error: recipientsError } = await supabase
        .from("profiles")
        .select("email")
        .eq("role", "customer")
        .not("email", "is", null)
        .range(offset, offset + PAGE_SIZE - 1);

      if (recipientsError) {
        return NextResponse.json({ error: recipientsError.message }, { status: 500 });
      }

      const rows = (page as { email: string }[]) ?? [];
      emails.push(...rows.map((r) => r.email));
      if (rows.length < PAGE_SIZE) break;
    }
  }

  const subscriberIds: string[] = [];
  if (wantsMessenger) {
    const admin = createAdminClient();
    const { data: subs, error: subsError } = await admin
      .from("messenger_subscriptions")
      .select("profile_id")
      .is("opted_out_at", null);
    if (subsError) {
      return NextResponse.json({ error: subsError.message }, { status: 500 });
    }
    subscriberIds.push(...((subs as { profile_id: string }[]) ?? []).map((s) => s.profile_id));
  }

  if (emails.length === 0 && subscriberIds.length === 0) {
    return NextResponse.json({ error: "No eligible recipients." }, { status: 400 });
  }

  const { data: broadcast, error: insertError } = await supabase
    .from("notification_broadcasts")
    .insert({
      subject,
      message,
      link_path: linkPath,
      channels,
      promo_id: linkTarget === "promo" ? promoId : null,
      sent_by: auth.user.id,
      recipient_count: 0,
    })
    .select("id")
    .single();

  if (insertError || !broadcast) {
    return NextResponse.json({ error: insertError?.message ?? "Couldn't save the broadcast." }, { status: 500 });
  }

  // Queue Messenger first so an email failure can't lose it.
  let messengerQueued = 0;
  let queueFailed = false;
  if (subscriberIds.length > 0) {
    const admin = createAdminClient();
    const { error: queueError } = await admin.from("messenger_outbox").insert(
      subscriberIds.map((profileId) => ({
        profile_id: profileId,
        kind: linkTarget === "promo" ? "promo" : "booking_invite",
        promo_id: linkTarget === "promo" ? promoId : null,
        broadcast_id: broadcast.id,
        custom_text: `${subject}\n\n${message}`,
        link_path: linkPath,
      }))
    );
    if (queueError) {
      console.error("Queueing Messenger broadcast failed:", queueError);
      queueFailed = true;
    } else {
      messengerQueued = subscriberIds.length;
    }
  }

  let sentCount = 0;
  let lastError: string | null = null;
  if (emails.length > 0) {
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM_EMAIL ?? "GlowSync <onboarding@resend.dev>";
    const origin = new URL(request.url).origin;
    const html = buildEmailHtml(subject, message, `${origin}${linkPath}`, linkTarget === "promo" ? "View Promo" : "Book Now");

    const CHUNK_SIZE = 100;
    for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
      const chunk = emails.slice(i, i + CHUNK_SIZE);
      const { data: batchResult, error: sendError } = await resend.batch.send(
        chunk.map((to) => ({ from, to, subject, html })),
        { batchValidation: "permissive" }
      );
      if (sendError) {
        console.error("Resend batch send failed:", sendError);
        lastError = sendError.message;
        continue;
      }
      sentCount += batchResult?.data?.length ?? 0;
      if (batchResult && "errors" in batchResult && batchResult.errors?.length) {
        console.error("Resend per-recipient failures:", batchResult.errors);
        lastError = batchResult.errors[0]?.message ?? lastError;
      }
    }

    await supabase.from("notification_broadcasts").update({ recipient_count: sentCount }).eq("id", broadcast.id);
  }

  const queueErrorMessage = "Messenger messages couldn't be queued.";
  const result = {
    sentCount,
    totalRecipients: emails.length,
    messengerQueued,
    broadcastId: broadcast.id,
    ...(queueFailed ? { messengerError: queueErrorMessage } : {}),
  };

  if ((emails.length > 0 || subscriberIds.length > 0) && sentCount === 0 && messengerQueued === 0) {
    return NextResponse.json(
      { error: lastError ?? (queueFailed ? queueErrorMessage : "Failed to send — nothing went out."), ...result },
      { status: 502 }
    );
  }

  return NextResponse.json(result);
}
