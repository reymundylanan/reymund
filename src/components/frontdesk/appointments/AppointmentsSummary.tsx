"use client";

import { useState } from "react";
import StatDetailModal, { type StatDetailItem } from "@/components/frontdesk/StatDetailModal";
import { clientInfo, appointmentStaffName, appointmentServiceName, formatTime, type AppointmentRow } from "@/components/frontdesk/appointments/utils";
import { CalendarDays, CheckCheck, CircleCheck, CircleX, Hourglass, Sparkles, UserX } from "lucide-react";
import StatCard, { type StatTone } from "@/components/StatCard";

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

  const tiles: { key: TileKey; label: string; icon: typeof CalendarDays; tone: StatTone; note: string }[] = [
    { key: "total", label: "Total Today", icon: CalendarDays, tone: "dark", note: "All of today's visits" },
    { key: "confirmed", label: "Confirmed", icon: CircleCheck, tone: "good", note: "Ready for their visit" },
    { key: "waiting", label: "Waiting", icon: Hourglass, tone: "warn", note: "Arrived, not started" },
    { key: "inService", label: "In Service", icon: Sparkles, tone: "default", note: "Being served now" },
    { key: "completed", label: "Completed", icon: CheckCheck, tone: "default", note: "Finished today" },
    { key: "cancelled", label: "Cancelled", icon: CircleX, tone: "alert", note: "Called off" },
    { key: "noShow", label: "No-show", icon: UserX, tone: "alert", note: "Didn't arrive" },
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <StatCard
            key={t.key}
            icon={t.icon}
            label={t.label}
            value={summary[t.key]}
            note={t.note}
            tone={t.key === "cancelled" || t.key === "noShow" ? (summary[t.key] ? "alert" : "default") : t.tone}
            active={openTile === t.key}
            onClick={() => setOpenTile(t.key)}
          />
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
