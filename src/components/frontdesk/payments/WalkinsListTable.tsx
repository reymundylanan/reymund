"use client";

import { useState } from "react";
import { ClipboardList, CreditCard, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateSessionStatus, cancelAppointment } from "@/lib/supabase/queries/appointments";
import {
  walkinProfessionalName,
  walkinServiceName,
  walkinPaymentStatus,
  walkinQuotedAmount,
  type WalkinRow,
} from "@/lib/supabase/queries/walkins";
import { SESSION_LABEL, WALKIN_STATUS_OPTIONS, type SessionStatus } from "@/lib/sessionStatus";
import { serviceTimingLabel, serviceTimingStyle, computeServiceTiming, useServiceTimingClock } from "@/lib/serviceTiming";
import EditWalkinModal from "@/components/frontdesk/payments/EditWalkinModal";
import WalkinPaymentModal from "@/components/frontdesk/payments/WalkinPaymentModal";

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

export default function WalkinsListTable({
  entries,
  onChanged,
}: {
  entries: WalkinRow[];
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<WalkinRow | null>(null);
  const [completingRow, setCompletingRow] = useState<WalkinRow | null>(null);
  const now = useServiceTimingClock();

  async function handleStatusChange(row: WalkinRow, next: string) {
    if (next === "cancel") {
      setCancellingId(row.id);
      return;
    }
    setError(null);
    setBusyId(row.id);
    const supabase = createClient();
    const result = await updateSessionStatus(supabase, row.id, next as SessionStatus);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    onChanged();
    if (next === "completed") setCompletingRow(row);
  }

  async function confirmCancel(row: WalkinRow) {
    setBusyId(row.id);
    const supabase = createClient();
    const result = await cancelAppointment(supabase, row.id);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCancellingId(null);
    onChanged();
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
          <ClipboardList className="h-4 w-4" />
        </span>
        Registered Today
      </h2>
      <p className="mt-1 text-xs text-ink/50">
        Walk-in clients registered so far today
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {entries.length === 0 ? (
        <p className="mt-6 py-8 text-center text-sm text-ink/40">
          No walk-ins registered yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map((row) => {
            const sessionStatus = (row.session_status ?? "waiting") as SessionStatus;
            const isCancelled = row.status === "cancelled";
            const serviceTiming =
              sessionStatus === "in_service" ? computeServiceTiming(row.service_started_at, row.duration_minutes, now) : null;
            const { paid, amount: paidAmount, paidAt } = walkinPaymentStatus(row);
            const quoted = walkinQuotedAmount(row);
            return (
              <div key={row.id} className={`rounded-xl border p-4 ${isCancelled ? "border-red-200 bg-red-50/40" : "border-ink/10"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{row.walkin_name}</p>
                    <p className="text-xs text-ink/40">{row.walkin_phone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCancelled ? (
                      <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600">Cancelled</span>
                    ) : (
                      <select
                        value={sessionStatus}
                        onChange={(e) => handleStatusChange(row, e.target.value)}
                        disabled={busyId === row.id}
                        className="rounded-full border border-ink/15 px-2.5 py-1 text-xs font-medium text-ink/70 outline-none focus:border-coral disabled:opacity-50"
                      >
                        {WALKIN_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{SESSION_LABEL[s]}</option>
                        ))}
                        <option value="cancel">Cancelled</option>
                      </select>
                    )}
                    {serviceTiming && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${serviceTimingStyle(serviceTiming)}`}>
                        {serviceTimingLabel(serviceTiming)}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        paid ? "bg-green-100 text-green-700" : "bg-red-50 text-red-600"
                      }`}
                    >
                      {paid ? `Paid ₱${paidAmount?.toLocaleString()}.00` : "Unpaid"}
                    </span>
                    {!isCancelled && sessionStatus === "in_service" && (
                      <button
                        onClick={() => handleStatusChange(row, "completed")}
                        disabled={busyId === row.id}
                        className="flex items-center gap-1.5 rounded-full bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        Finish Service
                      </button>
                    )}
                    {!isCancelled && sessionStatus === "completed" && !paid && (
                      <button
                        onClick={() => setCompletingRow(row)}
                        className="flex items-center gap-1.5 rounded-full bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700"
                      >
                        <CreditCard className="h-3.5 w-3.5" /> Collect Payment
                      </button>
                    )}
                    {!isCancelled && (
                      <button
                        onClick={() => setEditing(row)}
                        aria-label="Edit walk-in"
                        className="rounded-full p-1.5 text-ink/40 hover:bg-blush hover:text-ink"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/70">
                  <span>{walkinServiceName(row)}</span>
                  <span>with {walkinProfessionalName(row)}</span>
                  <span>{formatTime(row.start_time)}</span>
                  <span>{row.duration_minutes} mins</span>
                  {quoted != null && <span className="font-medium text-teal-600">₱{quoted.toLocaleString()}.00</span>}
                  {row.additional_charges > 0 && (
                    <span className="text-xs text-amber-700">
                      (incl. ₱{row.additional_charges.toLocaleString()}.00 add-on)
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-ink/40">
                  {row.arrival_time && <span>Arrived {formatClock(row.arrival_time)}</span>}
                  {row.service_started_at && <span>Started {formatClock(row.service_started_at)}</span>}
                  {row.completed_at && <span>Completed {formatClock(row.completed_at)}</span>}
                  {paidAt && <span>Paid {formatClock(paidAt)}</span>}
                </div>

                {cancellingId === row.id && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                    <p className="text-center text-xs font-medium text-red-700">Cancel this walk-in?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCancellingId(null)}
                        className="flex-1 rounded-full border border-ink/15 py-2 text-xs text-ink/60 hover:border-ink/30"
                      >
                        Keep
                      </button>
                      <button
                        onClick={() => confirmCancel(row)}
                        disabled={busyId === row.id}
                        className="flex-1 rounded-full bg-red-500 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        {busyId === row.id ? "Cancelling..." : "Yes, Cancel"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditWalkinModal
          walkin={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}

      {completingRow && (
        <WalkinPaymentModal
          walkin={completingRow}
          onClose={() => setCompletingRow(null)}
          onPaid={() => {
            setCompletingRow(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
