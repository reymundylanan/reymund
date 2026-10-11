"use client";

import { useBooking } from "@/components/booking/BookingContext";
import { branchServiceCategories } from "@/lib/data";

export default function CtaBookButton() {
  const { open } = useBooking();
  return (
    <button
      onClick={() => open(branchServiceCategories[0].services[0])}
      className="rounded-full bg-gold px-6 py-3 text-sm font-semibold text-ink transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      Schedule Now
    </button>
  );
}
