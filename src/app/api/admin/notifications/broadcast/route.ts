import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

const BRAND_COLOR = "#C9A84A";

function buildEmailHtml(subject: string, message: string, linkUrl: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 22px; font-weight: 700; color: #2b1a16; font-style: italic;">Blush Spa &amp; Aesthetics</p>
      <h1 style="font-size: 18px; color: #2b1a16;">${subject}</h1>
      <p style="font-size: 14px; color: #2b1a16; line-height: 1.6; white-space: pre-wrap;">${message}</p>
      <a href="${linkUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: ${BRAND_COLOR}; color: white; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Book Now
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }

  const emails: string[] = [];
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

  if (emails.length === 0) {
    return NextResponse.json({ error: "No eligible recipients." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Email sending isn't set up yet — add RESEND_API_KEY to continue." },
      { status: 500 }
    );
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? "GlowSync <onboarding@resend.dev>";
  const origin = new URL(request.url).origin;
  const linkUrl = `${origin}/?intent=booking`;
  const html = buildEmailHtml(subject, message, linkUrl);

  let sentCount = 0;
  let lastError: string | null = null;
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

  await supabase.from("notification_broadcasts").insert({
    subject,
    message,
    link_path: "/?intent=booking",
    sent_by: auth.user.id,
    recipient_count: sentCount,
  });

  if (sentCount === 0) {
    return NextResponse.json(
      { error: lastError ?? "Failed to send — no emails went out.", sentCount, totalRecipients: emails.length },
      { status: 502 }
    );
  }

  return NextResponse.json({ sentCount, totalRecipients: emails.length });
}
