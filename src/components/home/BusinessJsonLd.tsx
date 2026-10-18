import { createClient } from "@/lib/supabase/server";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { parseHours } from "@/lib/multiBranch/engine";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/siteUrl";

const pad = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Tells Google the spa is a local business with two branches (address,
 * phone, opening hours, map pin), for search and Maps results — and the
 * site's name, so results say "Blush Spa & Aesthetics" rather than the host. */
export default async function BusinessJsonLd() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("branches").select("name, address, phone, hours, status, lat, lng").order("name");
  if (error) logQueryError("BusinessJsonLd", error);
  const base = siteUrl();

  const branches = ((data ?? []) as { name: string; address: string | null; phone: string | null; hours: string | null; status: string | null; lat: number | null; lng: number | null }[])
    .filter((b) => (b.status ?? "active").toLowerCase() === "active")
    .map((b) => {
      const h = parseHours(b.hours);
      return {
        "@type": "DaySpa",
        name: `${SITE_NAME} — ${b.name}`,
        image: `${base}/images/hero/clinic.jpeg`,
        url: `${base}/branches`,
        ...(b.phone ? { telephone: b.phone } : {}),
        address: {
          "@type": "PostalAddress",
          streetAddress: b.address ?? b.name,
          addressLocality: "Pagadian City",
          addressRegion: "Zamboanga del Sur",
          addressCountry: "PH",
        },
        ...(b.lat != null && b.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng } } : {}),
        ...(h ? { openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: DAYS, opens: pad(h.open), closes: pad(h.close) }] } : {}),
        priceRange: "₱₱",
      };
    });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: SITE_NAME,
        alternateName: ["Blush Spa", "Blush Spa Pagadian", "GlowSync"],
        url: `${base}/`,
      },
      {
        "@type": "Organization",
        name: SITE_NAME,
        url: base,
        logo: `${base}/icon.png`,
        description: SITE_DESCRIPTION,
        subOrganization: branches,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Escape "<" so no text from the data can close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
    />
  );
}
