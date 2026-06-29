"use client";

import { X } from "lucide-react";
import type { Appointment } from "@/lib/adminData";

const statusStyles: Record<Appointment["status"], string> = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  conflict: "bg-red-100 text-red-600",
};

function formatTime(startHour: number, duration: number) {
  const fmt = (h: number) => {
    const hour24 = Math.floor(h);
    const min = Math.round((h - hour24) * 60);
    const meridiem = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${min.toString().padStart(2, "0")} ${meridiem}`;
  };
  return `${fmt(startHour)} - ${fmt(startHour + duration)}`;
}

export default function BookingDetailsPanel({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
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
          <p className="text-xs font-semibold uppercase text-ink/40">
            Customer Information
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blush text-base font-semibold text-coral-dark">
              {appointment.customer
                .split(" ")
                .map((p) => p[0])
                .join("")}
            </span>
            <div>
              <p className="font-medium text-ink">{appointment.customer}</p>
              <p className="text-xs text-ink/50">
                Member since {appointment.memberSince}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-ink/10 pt-4">
          <p className="text-xs font-semibold uppercase text-ink/40">
            Appointment Info
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink/50">Service</span>
              <span className="font-medium text-ink">{appointment.service}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50">Specialist</span>
              <span className="font-medium text-ink">{appointment.specialist}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50">Time</span>
              <span className="font-medium text-ink">
                {formatTime(appointment.startHour, appointment.duration)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink/50">Booking ID</span>
              <span className="font-medium text-ink">{appointment.bookingId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink/50">Status</span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusStyles[appointment.status]}`}
              >
                {appointment.status}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-ink/10 pt-4">
          <button className="rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark">
            Approve Special Requests
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
