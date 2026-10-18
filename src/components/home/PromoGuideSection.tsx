"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useBooking } from "@/components/booking/BookingContext";
import GlowGuide from "@/components/services/GlowGuide";
import { promoCardFacts, type GuideFacts, type GuidePromoCard } from "@/lib/glowGuide";

/** Home → Active Promotions: the GlowSync mascot introduces each promo card,
 * like on the service cards. Cards carry data-guide-id={promo.id}. */
export default function PromoGuideSection({ promos, heading, children }: { promos: GuidePromoCard[]; heading: ReactNode; children: ReactNode }) {
  const sectionRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const { openPromo } = useBooking();
  const items = useMemo(() => promos.map((p) => promoCardFacts(p, promos)), [promos]);

  async function book(item: GuideFacts) {
    // "unavailable": the promo can't be booked any more — show its page instead.
    if ((await openPromo(item.id)) === "unavailable") router.push(`/promos/${item.id}`);
  }

  return (
    <section ref={sectionRef} id="promotions" className="relative mx-auto max-w-7xl scroll-mt-28 px-6 py-20">
      {heading}
      {items.length > 0 && (
        <GlowGuide
          containerRef={sectionRef}
          items={items}
          onBook={book}
          onDetails={(item) => router.push(`/promos/${item.id}`)}
          greetingText="Looking for a great deal? Let me show you our promos!"
        />
      )}
      {children}
    </section>
  );
}
