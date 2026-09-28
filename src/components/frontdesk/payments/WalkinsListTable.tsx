"use client";

import { useState } from "react";
import { CheckCircle2, MoreVertical, PlayCircle, Receipt } from "lucide-react";
import {
  walkinProfessionalName,
  walkinServiceName,
  walkinPaymentStatus,
  type WalkinRow,
} from "@/lib/supabase/queries/walkins";
import type { SessionStatus } from "@/lib/sessionStatus";
import { computeServiceTiming, formatElapsedClock } from "@/lib/serviceTiming";
import { walkinStatusKey, walkinStatusLabel, walkinStatusStyle } from "@/components/frontdesk/payments/walkinStatus";

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

export default function WalkinsListTable({
  entries,
  selectedId,
  onSelect,
  now,
  busyId,
  onStart,
  onFinish,
  onEdit,
  onCancelRequest,
  onViewReceipt,
}: {
  entries: WalkinRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: Date;
  busyId: string | null;
  onStart: (row: WalkinRow) => void;
  onFinish: (row: WalkinRow) => void;
  onEdit: (row: WalkinRow) => void;
  onCancelRequest: (row: WalkinRow) => void;
  onViewReceipt: (row: WalkinRow) => void;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      {entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink/40">No walk-ins match these filters.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((row) => {
            const sessionStatus = (row.session_status ?? "in_service") as SessionStatus;
            const isCancelled = row.status === "cancelled";
            const timing =
              sessionStatus === "in_service" ? computeServiceTiming(row.service_started_at, row.duration_minutes, now) : null;
            const statusKey = isCancelled ? "other" : walkinStatusKey(sessionStatus, timing);
            const { paid } = walkinPaymentStatus(row);
            const isSelected = row.id === selectedId;
            const elapsedMs = row.service_started_at ? now.getTime() - new Date(row.service_started_at).getTime() : 0;

            return (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(row.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(row.id);
                }}
                className={`flex cursor-pointer flex-wrap items-center gap-3 rounded-xl border p-3 transition ${
                  isSelected ? "border-blue-300 bg-blue-50/50" : isCancelled ? "border-red-200 bg-red-50/40" : "border-ink/10 hover:border-ink/20"
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-sm font-bold text-coral-dark">
                  {row.walkin_name?.charAt(0).toUpperCase() ?? "?"}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-ink">{row.walkin_name}</p>
                    <span className="rounded-full bg-pink-50 px-1.5 py-0.5 text-[10px] font-semibold text-pink-600">Walk-In</span>
                  </div>
                  <p className="truncate text-xs text-ink/50">
                    {walkinServiceName(row)} · {row.duration_minutes} min · {walkinProfessionalName(row)}
                  </p>
                </div>

                {isCancelled ? (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600">Cancelled</span>
                ) : (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${walkinStatusStyle(statusKey)}`}>
                      {walkinStatusLabel(statusKey)}
                    </span>
                    <span className="text-[11px] text-ink/40">
                      {sessionStatus === "in_service" && row.service_started_at
                        ? formatElapsedClock(elapsedMs)
                        : row.arrival_time
                        ? `Checked in ${formatClock(row.arrival_time)}`
                        : ""}
                    </span>
                  </div>
                )}

                {!isCancelled && (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {(sessionStatus === "waiting" || sessionStatus === "ready" || sessionStatus === "arrived" || sessionStatus === "late_arrival") && (
                      <button
                        onClick={() => onStart(row)}
                        disabled={busyId === row.id}
                        className="flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        <PlayCircle className="h-3.5 w-3.5" /> Start Service
                      </button>
                    )}
                    {sessionStatus === "in_service" && (
                      <button
                        onClick={() => onFinish(row)}
                        disabled={busyId === row.id}
                        className="flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Finish Service
                      </button>
                    )}
                    {(sessionStatus === "completed" || sessionStatus === "paid") && (
                      <button
                        onClick={() => onViewReceipt(row)}
                        className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-ink/30"
                      >
                        <Receipt className="h-3.5 w-3.5" /> {paid ? "View Receipt" : "Collect Payment"}
                      </button>
                    )}

                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId((id) => (id === row.id ? null : row.id))}
                        aria-label="More actions"
                        className="rounded-full p-1.5 text-ink/40 hover:bg-blush hover:text-ink"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {openMenuId === row.id && (
                        <div className="absolute right-0 z-10 mt-1 w-32 rounded-xl border border-ink/10 bg-white py-1 shadow-lg">
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              onEdit(row);
                            }}
                            className="block w-full px-3 py-1.5 text-left text-xs text-ink/70 hover:bg-blush"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              onCancelRequest(row);
                            }}
                            className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
