const CATEGORY_IMAGES: { keywords: string[]; image: string }[] = [
  { keywords: ["brow", "lash"], image: "/images/services/brows&lashes.jpeg" },
  { keywords: ["facial", "face"], image: "/images/services/facial.jpeg" },
  { keywords: ["hair"], image: "/images/services/hair.jpeg" },
  { keywords: ["laser"], image: "/images/services/laser.jpeg" },
  { keywords: ["slimming"], image: "/images/services/slimming.jpeg" },
  { keywords: ["liposuction", "non-surgical"], image: "/images/services/non-surgical-liposuction.jpeg" },
  { keywords: ["doctor"], image: "/images/services/doctorspro.jpeg" },
  { keywords: ["cocktail", "drip"], image: "/images/services/cocktaildrips.jpeg" },
  { keywords: ["nail", "foot", "pedicure", "manicure"], image: "/images/services/nail.jpeg" },
  { keywords: ["body", "wellness", "massage", "spa"], image: "/images/services/body&wellness.jpeg" },
];

const FALLBACK_IMAGE = "/images/services/services.png";

export function getServiceImage(serviceName: string | null | undefined): string {
  const name = (serviceName ?? "").toLowerCase();
  for (const { keywords, image } of CATEGORY_IMAGES) {
    if (keywords.some((k) => name.includes(k))) return image;
  }
  return FALLBACK_IMAGE;
}
