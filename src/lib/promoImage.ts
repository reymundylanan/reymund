// Picks a photo for a promotion from its title / category / department, so
// promo cards get a matching picture without uploading one per promo.

const RULES: [RegExp, string][] = [
  [/lipo|non[-\s]?surgical/i, "/images/services/non-surgical-liposuction.jpeg"],
  [/slim|hifu|contour|body shap/i, "/images/services/slimming.jpeg"],
  [/drip|iv\b|gluta|cocktail/i, "/images/services/cocktaildrips.jpeg"],
  // Nails and brows before hair ("Nail with Different Colors"), hair before doctor.
  [/nail|mani|pedi|gel/i, "/images/services/nail.jpeg"],
  [/brow|lash/i, "/images/services/brows&lashes.jpeg"],
  // "Hair Botox" / "Botox Tx" hair promos are hair treatments.
  [/hair|bleach|balayage|color|keratin|rebond|brazilian|perm/i, "/images/services/hair.jpeg"],
  [/doctor|botox|filler|thread|prp/i, "/images/services/doctorspro.jpeg"],
  [/laser|ipl|rejuv/i, "/images/services/laser.jpeg"],
  [/facial|skin|peel|acne|whiten|glow/i, "/images/services/facial.jpeg"],
  [/massage|body|wellness|spa|wax|scrub/i, "/images/services/body&wellness.jpeg"],
  [/premium|signature/i, "/images/services/premium.jpeg"],
];

export const PROMO_FALLBACK_IMAGE = "/images/hero/clinic.jpeg";

export function promoImage(p: { title: string; category?: string | null; department?: string | null }): string {
  // Category / department are more reliable than the title, so check them first.
  for (const text of [p.category ?? "", p.department ?? "", p.title]) {
    if (!text) continue;
    for (const [re, src] of RULES) if (re.test(text)) return src;
  }
  return PROMO_FALLBACK_IMAGE;
}
