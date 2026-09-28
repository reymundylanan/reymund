"use client";

import { useState } from "react";
import StatDetailModal, { type StatDetailItem } from "@/components/frontdesk/StatDetailModal";
import { clientInfo, appointmentStaffName, appointmentServiceName, formatTime, type AppointmentRow } from "@/components/frontdesk/appointments/utils";

export type AppointmentsSummaryCounts = {
  total: number;
  confirmed: number;
  waiting: number;
  inService: number;
  completed: number;
  cancelled: number;
  noShow: number;
};

type TileKey = keyof AppointmentsSummaryCounts;

const FILTERS: Record<TileKey, (r: AppointmentRow) => boolean> = {
  total: () => true,
  confirmed: (r) => r.status === "confirmed",
  waiting: (r) => r.session_status === "waiting",
  inService: (r) => r.session_status === "in_service",
  completed: (r) => r.session_status === "completed",
  cancelled: (r) => r.status === "cancelled",
  noShow: (r) => r.session_status === "no_show",
};

export default function AppointmentsSummary({
  summary,
  rows,
  onReschedule,
}: {
  summary: AppointmentsSummaryCounts;
  rows: AppointmentRow[];
  onReschedule: (appointmentId: string) => void;
}) {
  const [openTile, setOpenTile] = useState<TileKey | null>(null);

  const tiles: { key: TileKey; label: string; className: string }[] = [
    { key: "total", label: "Total Today", className: "text-ink" },
    { key: "confirmed", label: "Confirmed", className: "text-green-700" },
    { key: "waiting", label: "Waiting", className: "text-amber-700" },
    { key: "inService", label: "In Service", className: "text-blue-700" },
    { key: "completed", label: "Completed", className: "text-ink/60" },
    { key: "cancelled", label: "Cancelled", className: "text-red-600" },
    { key: "noShow", label: "No-show", className: "text-red-600" },
  ];

  const openTileLabel = tiles.find((t) => t.key === openTile)?.label ?? "";
  const items: StatDetailItem[] = openTile
    ? rows.filter(FILTERS[openTile]).map((r) => {
        const client = clientInfo(r.client);
        return {
          id: r.id,
          title: client.full_name,
          subtitle: `${appointmentServiceName(r)} · with ${appointmentStaffName(r)} · ${formatTime(r.start_time)}`,
          badge: r.session_status ?? r.status,
          badgeStyle: "bg-blush text-ink/60 capitalize",
          ...(openTile === "noShow"
            ? {
                actionLabel: "Reschedule",
                onAction: () => {
                  setOpenTile(null);
                  onReschedule(r.id);
                },
              }
            : {}),
        };
      })
    : [];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-white p-6 shadow-sm sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map((t) => (
          <button
            key={t.key}
            onClick={() => setOpenTile(t.key)}
            className="rounded-xl text-center transition hover:bg-blush/50"
          >
            <p className={`text-2xl font-semibold ${t.className}`}>{summary[t.key]}</p>
            <p className="mt-0.5 text-xs text-ink/50">{t.label}</p>
          </button>
        ))}
      </div>

      {openTile && (
        <StatDetailModal
          title={openTileLabel}
          items={items}
          emptyLabel={`No appointments in "${openTileLabel}" today.`}
          onClose={() => setOpenTile(null)}
        />
      )}
    </>
  );
}
