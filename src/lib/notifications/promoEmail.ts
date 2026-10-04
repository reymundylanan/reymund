// "New promo" email for clients who opted in to exclusive offers (071).
// Pure, so it can be tested; the API route sends it.
import { SPA_FOOTER, escapeHtml } from "@/lib/notifications/delivery";

export type PromoForEmail = {
  id: string;
  title: string;
  description: string | null;
  badge: string | null;
  price: number | null;
  validUntil: string | null;
  branchNames: string[];
};

const BRAND = "#C9A84A";
const INK = "#2b1a16";

function untilLabel(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function buildPromoEmail(promo: PromoForEmail, siteUrl: string) {
  const base = siteUrl.replace(/\/+$/, "");
  const link = `${base}/promos/${promo.id}`;
  const settings = `${base}/my-glow/profile#notifications`;
  const where = promo.branchNames.length ? promo.branchNames.join(" & ") : "Blush Spa & Aesthetics";
  const price = promo.price != null && promo.price > 0 ? `₱${promo.price.toLocaleString("en-PH")}` : null;
  const until = promo.validUntil ? untilLabel(promo.validUntil) : null;

  const subject = `New at Blush Spa: ${promo.title}`;
  const lines = [
    promo.title,
    promo.description ?? "",
    price ? `Promo price: ${price}` : "",
    `Available at ${where}${until ? ` until ${until}` : ""}.`,
    `View the promo: ${link}`,
    "",
    "—",
    SPA_FOOTER,
    `You're getting this because you chose to receive exclusive offers. Turn off emails: ${settings}`,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
  const text = lines.join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: ${INK};">
      <p style="font-size: 22px; font-weight: 700; font-style: italic; margin: 0 0 16px;">Blush Spa &amp; Aesthetics</p>
      <p style="display: inline-block; margin: 0 0 8px; padding: 4px 10px; border-radius: 999px; background: #fbf1dc; color: #a8843a; font-size: 12px; font-weight: 700;">
        ${escapeHtml(promo.badge ?? "New Promo")}
      </p>
      <h1 style="font-size: 20px; margin: 0 0 8px;">${escapeHtml(promo.title)}</h1>
      ${promo.description ? `<p style="font-size: 14px; line-height: 1.6; margin: 0 0 12px; white-space: pre-wrap;">${escapeHtml(promo.description)}</p>` : ""}
      ${price ? `<p style="font-size: 18px; font-weight: 700; color: #a8843a; margin: 0 0 4px;">${escapeHtml(price)}</p>` : ""}
      <p style="font-size: 13px; color: #6f5a4c; margin: 0;">Available at ${escapeHtml(where)}${until ? ` until ${escapeHtml(until)}` : ""}.</p>
      <a href="${escapeHtml(link)}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: ${BRAND}; color: white; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        View Promo
      </a>
      <p style="font-size: 11px; color: #8a7b77; margin-top: 32px;">
        You're getting this because you chose to receive exclusive offers from GlowSync.
        <a href="${escapeHtml(settings)}" style="color: #8a7b77;">Turn off emails</a>.<br />
        ${escapeHtml(SPA_FOOTER)}
      </p>
    </div>
  `;
  return { subject, text, html, unsubscribeUrl: settings };
}

/** Promo rows saved for several branches become one email. */
export function groupPromos<T extends { id: string; title: string; branchName: string | null }>(rows: T[]): { first: T; branchNames: string[] }[] {
  const byTitle = new Map<string, T[]>();
  for (const r of rows) byTitle.set(r.title.trim().toLowerCase(), [...(byTitle.get(r.title.trim().toLowerCase()) ?? []), r]);
  return [...byTitle.values()].map((list) => ({
    first: list[0],
    branchNames: [...new Set(list.map((r) => r.branchName).filter((n): n is string => !!n))],
  }));
}
