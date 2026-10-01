"use client";

import Image from "next/image";
import { AlertTriangle } from "lucide-react";
import { SESSION_LABEL, SESSION_STYLE } from "@/lib/sessionStatus";
import { serviceTimingLabel, serviceTimingStyle, computeServiceTiming, useServiceTimingClock } from "@/lib/serviceTiming";
import {
  clientInfo,
  appointmentStaffName,
  appointmentServiceName,
  formatTime,
  payNowPayment,
  type AppointmentRow,
} from "@/components/frontdesk/appointments/utils";
import { PAY_NOW_LABEL, PAY_NOW_STYLE } from "@/lib/payNow";

export type AvailabilityStatus = "available" | "busy" | "on_leave" | "day_off";

const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  available: "Available",
  busy: "Busy",
  on_leave: "On Leave",
  day_off: "Day Off",
};

const AVAILABILITY_STYLE: Record<AvailabilityStatus, string> = {
  available: "text-green-700",
  busy: "text-amber-700",
  on_leave: "text-red-600",
  day_off: "text-ink/40",
};

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

export default function AppointmentsListView({
  rows,
  conflictIds,
  staffAvailability,
  activeId,
  onSelect,
}: {
  rows: AppointmentRow[];
  conflictIds: Set<string>;
  staffAvailability: Record<string, AvailabilityStatus>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const now = useServiceTimingClock();

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <table className="w-full text-left text-base">
        <thead>
          <tr className="text-sm uppercase text-ink/40">
            <th className="py-3">Client</th>
            <th className="py-3">Service</th>
            <th className="py-3">Staff</th>
            <th className="py-3">Date</th>
            <th className="py-3">Time</th>
            <th className="py-3">Status</th>
            <th className="py-3">Session</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const sessionStatus = r.session_status;
            const availability = r.professional_id ? staffAvailability[r.professional_id] : undefined;
            const client = clientInfo(r.client);
            const staffPhoto = !Array.isArray(r.professional) ? r.professional?.avatar_url : null;
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={`cursor-pointer border-t border-ink/5 hover:bg-blush/30 ${
                  activeId === r.id ? "bg-blush/50" : ""
                }`}
              >
                <td className="py-4 font-medium text-ink">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-sm font-bold text-coral-dark">
                      {client.avatar_url ? (
                        <Image src={client.avatar_url} alt={client.full_name} fill className="object-cover" />
                      ) : (
                        client.full_name.charAt(0)
                      )}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        {conflictIds.has(r.id) && (
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Scheduling conflict" />
                        )}
                        {client.full_name.split(" ")[0]}
                      </div>
                      {r.booking_code && <p className="text-xs font-normal text-ink/30">#{r.booking_code}</p>}
                    </div>
                  </div>
                </td>
                <td className="py-4 text-ink/70">{appointmentServiceName(r)}</td>
                <td className="py-4 text-ink/70">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-xs font-bold text-coral-dark">
                      {staffPhoto ? (
                        <Image src={staffPhoto} alt={appointmentStaffName(r)} fill className="object-cover" />
                      ) : (
                        appointmentStaffName(r).charAt(0)
                      )}
                    </span>
                    <div>
                      <p>{appointmentStaffName(r)}</p>
                      {availability && (
                        <p className={`text-xs font-medium ${AVAILABILITY_STYLE[availability]}`}>
                          {AVAILABILITY_LABEL[availability]}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-4 text-ink/50">
                  {new Date(r.scheduled_date).toLocaleDateString()}
                </td>
                <td className="py-4 text-ink/50">{formatTime(r.start_time)}</td>
                <td className="py-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-sm font-medium capitalize ${
                      statusStyles[r.status] ?? "bg-ink/10 text-ink/50"
                    }`}
                  >
                    {r.status}
                  </span>
                  {(() => {
                    // Pay Now (059): show the GCash state right in the list.
                    const p = payNowPayment(r.payments);
                    if (!p) return null;
                    const state = p.status === "settled" ? "verified" : p.status === "pending" ? "submitted" : "not_received";
                    return (
                      <span className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAY_NOW_STYLE[state]}`}>
                        GCash · {PAY_NOW_LABEL[state]}
                      </span>
                    );
                  })()}
                </td>
                <td className="py-4">
                  {sessionStatus ? (
                    (() => {
                      const timing =
                        sessionStatus === "in_service"
                          ? computeServiceTiming(r.service_started_at, r.duration_minutes, now)
                          : null;
                      if (timing) {
                        return (
                          <span className={`rounded-full px-2.5 py-1 text-sm font-medium ${serviceTimingStyle(timing)}`}>
                            {serviceTimingLabel(timing)}
                          </span>
                        );
                      }
                      return (
                        <span className={`rounded-full px-2.5 py-1 text-sm font-medium ${SESSION_STYLE[sessionStatus]}`}>
                          {SESSION_LABEL[sessionStatus]}
                        </span>
                      );
                    })()
                  ) : (
                    <span className="text-sm text-ink/30">—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-ink/40">
                No appointments match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
