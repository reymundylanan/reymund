import Image from "next/image";
import Link from "next/link";
import type { UpcomingAppointment } from "@/lib/supabase/queries/myGlow";
import { getServiceImage } from "@/lib/serviceImage";

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

function daysLeft(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
}

export default function UpcomingBookingCard({
  appointment,
}: {
  appointment: UpcomingAppointment | null;
}) {
  if (!appointment) {
    return (
      <div className="rounded-3xl border border-rose/60 bg-white p-5">
        <h3 className="text-lg font-semibold text-ink">My Upcoming Booking</h3>
        <p className="mt-4 text-sm text-ink/60">No upcoming bookings yet.</p>
        <Link
          href="/services"
          className="mt-3 inline-block rounded-full bg-coral px-5 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
        >
          Book Now
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-rose/60 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink">My Upcoming Booking</h3>
        <Link href="#services" className="text-sm font-medium text-coral-dark hover:underline">
          View All
        </Link>
      </div>

      <div className="mt-4 flex gap-4">
        <Image
          src={getServiceImage(appointment.serviceName)}
          alt={appointment.serviceName ?? "Service"}
          width={96}
          height={96}
          className="h-24 w-24 shrink-0 rounded-2xl object-cover"
        />
        <div className="flex-1">
          <p className="text-base font-semibold text-ink">
            {appointment.serviceName ?? "Appointment"}
          </p>
          {appointment.professionalName && (
            <p className="text-sm text-ink/60">with {appointment.professionalName}</p>
          )}
          <p className="mt-1 text-sm text-ink/60">
            {new Date(appointment.scheduledDate).toLocaleDateString()} &bull;{" "}
            {formatTime(appointment.startTime)}
          </p>
          {appointment.branchName && (
            <p className="text-sm text-ink/60">{appointment.branchName}</p>
          )}
          <p className="text-sm text-ink/60">{appointment.durationMinutes} mins</p>
        </div>
        <div className="shrink-0 rounded-2xl bg-blush px-4 py-3 text-center">
          <p className="text-2xl font-bold text-coral-dark">
            {daysLeft(appointment.scheduledDate)}
          </p>
          <p className="text-xs text-ink/60">Days left</p>
        </div>
      </div>
    </div>
  );
}
