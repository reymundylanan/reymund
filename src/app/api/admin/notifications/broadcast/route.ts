import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessengerConfig } from "@/lib/messenger/config";
import { getEmailSender } from "@/lib/notifications/senders";
import { SPA_FOOTER } from "@/lib/notifications/delivery";

// Gmail sends one by one; leave room for a few hundred clients.
export const maxDuration = 60;

const BRAND_COLOR = "#C9A84A";

type Channel = "email" | "messenger";

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildEmailHtml(subject: string, message: string, linkUrl: string, buttonLabel: string, imageUrl: string | null, settingsUrl: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 22px; font-weight: 700; color: #2b1a16; font-style: italic;">Blush Spa &amp; Aesthetics</p>
      <h1 style="font-size: 18px; color: #2b1a16;">${escapeHtml(subject)}</h1>
      <p style="font-size: 14px; color: #2b1a16; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</p>
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" style="display: block; width: 100%; max-width: 480px; height: auto; margin-top: 16px; border-radius: 12px;" />` : ""}
      <a href="${linkUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: ${BRAND_COLOR}; color: white; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        ${buttonLabel}
      </a>
      <p style="font-size: 11px; color: #8a7b77; margin-top: 32px;">
        You're getting this because you have a GlowSync account at Blush Spa &amp; Aesthetics.
        <a href="${escapeHtml(settingsUrl)}" style="color: #8a7b77;">Turn off emails</a>.<br />
        ${escapeHtml(SPA_FOOTER)}
      </p>
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

  // Optional image (061): must be one uploaded to our broadcast-images bucket.
  const imagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/broadcast-images/`;
  const imageUrl = typeof body?.imageUrl === "string" && body.imageUrl.startsWith(imagePrefix) ? body.imageUrl : null;
  if (typeof body?.imageUrl === "string" && body.imageUrl && !imageUrl) {
    return NextResponse.json({ error: "Invalid image." }, { status: 400 });
  }

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

  // The spa Gmail (068) reaches every client; Resend is the fallback.
  const sendGmail = getEmailSender();
  const apiKey = process.env.RESEND_API_KEY;
  if (wantsEmail && !sendGmail && !apiKey) {
    return NextResponse.json(
      { error: "Email sending isn't set up yet — add GMAIL_USER and GMAIL_APP_PASSWORD to continue." },
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

    // Clients who turned email off in My Glow (068) don't get broadcasts.
    const { data: offRows, error: offError } = await createAdminClient()
      .from("notification_preferences")
      .select("profile:profiles(email)")
      .eq("email_enabled", false);
    if (offError) {
      console.error("Broadcast email preferences failed:", offError);
    } else {
      type OffRow = { profile: { email: string | null } | { email: string | null }[] | null };
      const off = new Set(
        ((offRows ?? []) as unknown as OffRow[])
          .map((r) => (Array.isArray(r.profile) ? r.profile[0]?.email : r.profile?.email)?.toLowerCase())
          .filter(Boolean)
      );
      for (let i = emails.length - 1; i >= 0; i--) if (off.has(emails[i].toLowerCase())) emails.splice(i, 1);
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

  const row: Record<string, unknown> = {
    subject,
    message,
    link_path: linkPath,
    channels,
    promo_id: linkTarget === "promo" ? promoId : null,
    sent_by: auth.user.id,
    recipient_count: 0,
  };
  let { data: broadcast, error: insertError } = await supabase
    .from("notification_broadcasts")
    .insert(imageUrl ? ({ ...row, image_url: imageUrl } as Record<string, unknown>) : row)
    .select("id")
    .single();
  // Before 061 there's no image_url column: still send, just don't store it.
  if (insertError && imageUrl && (insertError.code === "42703" || insertError.code === "PGRST204")) {
    ({ data: broadcast, error: insertError } = await supabase.from("notification_broadcasts").insert(row).select("id").single());
  }

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
  if (emails.length > 0 && sendGmail) {
    const origin = new URL(request.url).origin;
    const settingsUrl = `${origin}/my-glow/profile#notifications`;
    const html = buildEmailHtml(subject, message, `${origin}${linkPath}`, linkTarget === "promo" ? "View Promo" : "Book Now", imageUrl, settingsUrl);
    const text = `${subject}\n\n${message}\n\n${origin}${linkPath}\n\n—\n${SPA_FOOTER}\nTurn off emails: ${settingsUrl}`;
    // One email per client, so nobody sees the other addresses.
    for (const to of emails) {
      try {
        await sendGmail(to, { subject, text, html, unsubscribeUrl: settingsUrl });
        sentCount += 1;
      } catch (err) {
        console.error("Gmail broadcast send failed:", to, err);
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    await supabase.from("notification_broadcasts").update({ recipient_count: sentCount }).eq("id", broadcast.id);
  } else if (emails.length > 0 && apiKey) {
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM_EMAIL ?? "GlowSync <onboarding@resend.dev>";
    const origin = new URL(request.url).origin;
    const html = buildEmailHtml(subject, message, `${origin}${linkPath}`, linkTarget === "promo" ? "View Promo" : "Book Now", imageUrl, `${origin}/my-glow/profile#notifications`);

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
