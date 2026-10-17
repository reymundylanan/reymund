/** The public address of the website, for search engines and share links.
 *  NEXT_PUBLIC_SITE_URL when it's set to a real address; on Vercel, the
 *  project's production domain (Vercel provides it at build time);
 *  otherwise localhost while developing. No trailing slash. */
export function siteUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (configured && !/localhost|127\.0\.0\.1/.test(configured)) return configured.replace(/\/+$/, "");
  const vercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return configured.replace(/\/+$/, "") || "http://localhost:3000";
}

export const SITE_NAME = "Blush Spa & Aesthetics";
export const SITE_DESCRIPTION =
  "Blush Spa & Aesthetics in Pagadian City — facials, hair, nails, lashes and brows, laser, slimming, IV drips and doctor's aesthetic procedures at One Cecilia Center and Robinsons Pagadian. Book online with GlowSync.";
