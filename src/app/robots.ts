import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";

/** Search engines may read the public pages; staff portals, the client's own
 * pages and the API stay out of search results. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/frontdesk", "/my-glow", "/auth", "/api"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
