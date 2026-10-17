import { describe, expect, it } from "vitest";
import { PROMO_FALLBACK_IMAGE, promoImage, promoPhotoUrl } from "./promoImage";

describe("promoImage", () => {
  it("matches the service type", () => {
    expect(promoImage({ title: "Full Bleach + Balayage + Botox Tx" })).toBe("/images/services/hair.jpeg");
    expect(promoImage({ title: "Nail with Different Colors" })).toBe("/images/services/nail.jpeg");
    expect(promoImage({ title: "Summer Deal", category: "Facial Services" })).toBe("/images/services/facial.jpeg");
    expect(promoImage({ title: "Hair Botox", category: "Hair Services" })).toBe("/images/services/hair.jpeg");
  });

  it("falls back to the clinic photo", () => {
    expect(promoImage({ title: "Grand Opening" })).toBe(PROMO_FALLBACK_IMAGE);
  });

  it("uses the uploaded photo first", () => {
    const src = promoImage({ title: "Full Bleach + Balayage", category: "Hair Services", imagePath: "promos/a b.jpg" });
    expect(src).toBe(promoPhotoUrl("promos/a b.jpg"));
    expect(src.endsWith("/storage/v1/object/public/service-media/promos/a%20b.jpg")).toBe(true);
  });
});
