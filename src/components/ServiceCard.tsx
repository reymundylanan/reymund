"use client";

import Image from "next/image";
import { Clock, Star } from "lucide-react";
import { useBooking } from "@/components/booking/BookingContext";

type ServiceCardProps = {
  badge: string;
  name: string;
  rating: number;
  description: string;
  duration: string;
  next: string;
  singlePrice: number;
  packPrice: number;
  image: string;
};

export default function ServiceCard({
  badge,
  name,
  rating,
  description,
  duration,
  next,
  singlePrice,
  packPrice,
  image,
}: ServiceCardProps) {
  const { open } = useBooking();

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="relative h-40 overflow-hidden">
        <Image
          src={image}
          alt={name}
          fill
          className="object-cover object-center"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white">
          {badge}
        </span>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-ink">
          <Star className="h-3 w-3 fill-gold text-gold" />
          {rating}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="font-semibold text-ink">{name}</h3>
        <p className="line-clamp-2 text-sm text-ink/60">{description}</p>
        <div className="flex items-center gap-1 text-xs text-ink/50">
          <Clock className="h-3.5 w-3.5" />
          {duration} &middot; Next: {next}
        </div>

        <div className="mt-auto space-y-2 border-t border-ink/10 pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink/60">
              1 Session{" "}
              <span className="font-semibold text-gold">
                ₱{singlePrice.toLocaleString()}
              </span>
            </span>
            <button
              onClick={() => open({ name, duration, price: singlePrice })}
              className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral-dark"
            >
              Book Now
            </button>
          </div>
          <div className="text-sm text-ink/60">
            5 Session{" "}
            <span className="font-semibold text-gold">
              ₱{packPrice.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
