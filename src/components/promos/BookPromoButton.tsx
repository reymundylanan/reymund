"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { useBooking } from "@/components/booking/BookingContext";

/** Opens the promo package booking (its services, price and branches come
 * with it). If the promo can't be booked any more, falls back to `fallbackHref`. */
export default function BookPromoButton({
  promoId,
  fallbackHref,
  disabled = false,
  className = "",
  label = "Book Promo",
}: {
  promoId: string;
  fallbackHref: string;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const { openPromo } = useBooking();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function book() {
    setBusy(true);
    const result = await openPromo(promoId);
    setBusy(false);
    // "login": the login window is showing; booking resumes after sign-in.
    if (result === "unavailable") router.push(fallbackHref);
  }

  return (
    <button type="button" onClick={book} disabled={disabled || busy} className={className}>
      <Gift className="h-4 w-4" />
      {busy ? "Opening…" : label}
    </button>
  );
}
