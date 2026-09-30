"use client";

import { useBooking } from "@/components/booking/BookingContext";

export default function ServiceBookButton({
  service,
}: {
  service: { name: string; duration: string; price: number };
}) {
  const { open } = useBooking();
  return (
    <button
      onClick={() => open({ name: service.name, duration: service.duration, price: service.price })}
      className="rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
    >
      Book Now
    </button>
  );
}
