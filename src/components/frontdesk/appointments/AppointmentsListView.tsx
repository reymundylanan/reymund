"use client";

import { AlertTriangle, MoreHorizontal } from "lucide-react";
import { clientInfo, formatTime, type AppointmentRow } from "@/components/frontdesk/appointments/utils";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  checked_in: "bg-blue-100 text-blue-700",
  in_service: "bg-blue-100 text-blue-700",
  completed: "bg-ink/10 text-ink/50",
  no_show: "bg-red-100 text-red-600",
  conflict: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

export default function AppointmentsListView({
  rows,
  conflictIds,
  onSelect,
}: {
  rows: AppointmentRow[];
  conflictIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <table className="w-full text-left text-base">
        <thead>
          <tr className="text-sm uppercase text-ink/40">
            <th className="py-3">Client</th>
            <th className="py-3">Service / Note</th>
            <th className="py-3">Date</th>
            <th className="py-3">Time</th>
            <th className="py-3">Type</th>
            <th className="py-3">Status</th>
            <th className="py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-ink/5">
              <td className="py-4 font-medium text-ink">
                <div className="flex items-center gap-1.5">
                  {conflictIds.has(r.id) && (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Scheduling conflict" />
                  )}
                  {clientInfo(r.client).full_name}
                </div>
              </td>
              <td className="py-4 text-ink/70">{r.notes ?? "—"}</td>
              <td className="py-4 text-ink/50">
                {new Date(r.scheduled_date).toLocaleDateString()}
              </td>
              <td className="py-4 text-ink/50">{formatTime(r.start_time)}</td>
              <td className="py-4 text-ink/50 capitalize">{r.appointment_type}</td>
              <td className="py-4">
                <span
                  className={`rounded-full px-2.5 py-1 text-sm font-medium capitalize ${
                    statusStyles[r.status] ?? "bg-ink/10 text-ink/50"
                  }`}
                >
                  {r.status.replace("_", " ")}
                </span>
              </td>
              <td className="py-3">
                <button
                  onClick={() => onSelect(r.id)}
                  className="rounded-full p-2 text-ink/40 hover:bg-blush hover:text-ink"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-ink/40">
                No appointments for this branch yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
