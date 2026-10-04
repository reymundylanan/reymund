"use client";

import { useBooking } from "@/components/booking/BookingContext";

export default function ServiceBookButton({
  service,
}: {
  service: { name: string; duration: string; price: number; category?: string | null };
}) {
  const { open } = useBooking();
  return (
    <button
      onClick={() => open({ name: service.name, duration: service.duration, price: service.price, preselect: true, category: service.category })}
      className="rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
    >
      Book Now
    </button>
  );
}
