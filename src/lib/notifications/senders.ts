import nodemailer from "nodemailer";
import webpush from "web-push";

// Server-only. Each sender is null when its env vars aren't set, so the
// dispatcher skips that channel instead of failing.

export function getEmailSender() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  return async (to: string, mail: { subject: string; text: string; html: string; unsubscribeUrl?: string }) => {
    const { unsubscribeUrl, ...content } = mail;
    await transport.sendMail({
      from: `"Blush Spa & Aesthetics" <${user}>`,
      replyTo: user,
      to,
      ...content,
      // Gmail shows an "Unsubscribe" link for this, and trusts senders that offer one.
      list: { unsubscribe: unsubscribeUrl ? [`mailto:${user}?subject=Unsubscribe`, unsubscribeUrl] : `mailto:${user}?subject=Unsubscribe` },
    });
  };
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export function getPushSender() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = process.env.GMAIL_USER?.trim() ? `mailto:${process.env.GMAIL_USER.trim()}` : "https://glowsync-phi.vercel.app";
  return async (target: PushTarget, payload: string) => {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      { TTL: 60 * 60 * 24, vapidDetails: { subject, publicKey, privateKey } }
    );
  };
}
