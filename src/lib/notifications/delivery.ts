// Turns a bell notice (client_notifications row) into an email and a push
// payload. Pure — the dispatcher (/api/notifications/dispatch) sends them.

export type DeliveryChannel = "email" | "push";

export type NoticeForDelivery = {
  kind: string;
  title: string;
  body: string;
  linkPath: string;
  firstName: string;
};

const BRAND_COLOR = "#C9A84A";
const INK = "#2b1a16";

/** Real sender details in every email's footer (spam filters look for them). */
export const SPA_FOOTER = "Blush Spa & Aesthetics · 3rd Floor, One Cecilia Center, Pagadian City, Zamboanga del Sur";

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function absoluteLink(siteUrl: string, linkPath: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const path = linkPath.startsWith("/") ? linkPath : `/${linkPath}`;
  return `${base}${path}`;
}

export function buttonLabel(kind: string): string {
  if (kind === "review_request") return "Rate your visit";
  if (kind === "no_show" || kind === "cancelled") return "View booking";
  return "View appointment";
}

export function buildEmail(notice: NoticeForDelivery, siteUrl: string) {
  const link = absoluteLink(siteUrl, notice.linkPath);
  const greeting = notice.firstName.trim() ? `Hi ${notice.firstName.trim()},` : "Hi,";
  const settings = absoluteLink(siteUrl, "/my-glow/profile#notifications");
  const subject = `${notice.title} — Blush Spa & Aesthetics`;
  const text = `${greeting}\n\n${notice.body}\n\n${buttonLabel(notice.kind)}: ${link}\n\n—\n${SPA_FOOTER}\nTo stop these emails, go to ${settings}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: ${INK};">
      <p style="font-size: 22px; font-weight: 700; font-style: italic; margin: 0 0 16px;">Blush Spa &amp; Aesthetics</p>
      <h1 style="font-size: 18px; margin: 0 0 12px;">${escapeHtml(notice.title)}</h1>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 8px;">${escapeHtml(greeting)}</p>
      <p style="font-size: 14px; line-height: 1.6; margin: 0;">${escapeHtml(notice.body)}</p>
      <a href="${escapeHtml(link)}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: ${BRAND_COLOR}; color: white; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        ${escapeHtml(buttonLabel(notice.kind))}
      </a>
      <p style="font-size: 11px; color: #8a7b77; margin-top: 32px;">
        You're getting this because you have a GlowSync account.
        <a href="${escapeHtml(settings)}" style="color: #8a7b77;">Turn off email notices</a>.<br />
        ${escapeHtml(SPA_FOOTER)}
      </p>
    </div>
  `;
  return { subject, text, html, unsubscribeUrl: settings };
}

export function buildPushPayload(notice: NoticeForDelivery, id: string): string {
  return JSON.stringify({ title: notice.title, body: notice.body, url: notice.linkPath, tag: id });
}

/** web-push: 404/410 mean the browser dropped the subscription. */
export function isGonePushStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

const RETRY_MINUTES = [1, 5, 15, 60];

export function retryDelayMinutes(attempts: number): number | null {
  return attempts <= RETRY_MINUTES.length ? RETRY_MINUTES[attempts - 1] ?? null : null;
}
