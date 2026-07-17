"use client";

import { X } from "lucide-react";
import type { DbAppointment } from "@/components/admin/bookings/BookingsManager";

const statusStyles: Record<DbAppointment["status"], string> = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  conflict: "bg-red-100 text-red-600",
};

function parseService(notes: string | null) {
  if (!notes) return { service: "—", specialist: "—", amount: "—" };
  const withIdx = notes.indexOf(" with ");
  const dashIdx = notes.indexOf(" — ");
  const service = withIdx > -1 ? notes.slice(0, withIdx).trim() : notes;
  const specialist = withIdx > -1
    ? notes.slice(withIdx + 6, dashIdx > -1 ? dashIdx : undefined).trim()
    : "—";
  const amount = dashIdx > -1 ? notes.slice(dashIdx + 3).trim() : "—";
  return { service, specialist, amount };
}

function formatDateTime(date: string, time: string) {
  const d = new Date(`${date}T${time}`);
  return d.toLocaleString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function BookingDetailsPanel({
  appointment,
  onClose,
}: {
  appointment: DbAppointment;
  onClose: () => void;
}) {
  const { service, specialist, amount } = parseService(appointment.notes);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Booking Details</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase text-ink/40">Customer</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blush text-base font-semibold text-coral-dark">
              {appointment.client_name.split(" ").map((p) => p[0]).join("").slice(0, 2)}
            </span>
            <p className="font-medium text-ink">{appointment.client_name}</p>
          </div>
        </div>

        <div className="mt-6 border-t border-ink/10 pt-4">
          <p className="text-xs font-semibold uppercase text-ink/40">Appointment Info</p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink/50">Booking ID</span>
              <span className="font-medium text-ink">{appointment.booking_code}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50">Branch</span>
              <span className="font-medium text-ink">{appointment.branch_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50">Service</span>
              <span className="font-medium text-ink">{service}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50">Specialist</span>
              <span className="font-medium text-ink">{specialist}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50">Date / Time</span>
              <span className="font-medium text-ink text-right">
                {formatDateTime(appointment.scheduled_date, appointment.start_time)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50">Type</span>
              <span className="font-medium capitalize text-ink">{appointment.appointment_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50">Amount</span>
              <span className="font-medium text-ink">{amount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink/50">Status</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusStyles[appointment.status]}`}>
                {appointment.status}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-ink/10 pt-4">
          <button className="rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark">
            Confirm Booking
          </button>
          <button className="rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral">
            Payments &amp; Refunds
          </button>
          <button className="rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50">
            Reschedule / Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
