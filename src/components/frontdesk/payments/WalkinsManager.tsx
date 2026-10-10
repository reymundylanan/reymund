"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import WalkinTransfersPanel from "@/components/frontdesk/payments/WalkinTransfersPanel";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { readQueryParam } from "@/lib/queryParam";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import {
  getTodaysWalkins,
  walkinProfessionalName,
  walkinServiceName,
  type WalkinRow,
} from "@/lib/supabase/queries/walkins";
import { updateSessionStatus, cancelAppointment } from "@/lib/supabase/queries/appointments";
import { computeServiceTiming, useSecondClock } from "@/lib/serviceTiming";
import { walkinStatusKey, type WalkinStatusKey } from "@/components/frontdesk/payments/walkinStatus";
import type { SessionStatus } from "@/lib/sessionStatus";
import WalkinsTopBar from "@/components/frontdesk/payments/WalkinsTopBar";
import WalkinsFilterBar from "@/components/frontdesk/payments/WalkinsFilterBar";
import WalkinsListTable from "@/components/frontdesk/payments/WalkinsListTable";
import WalkinDetailPanel from "@/components/frontdesk/payments/WalkinDetailPanel";
import WalkinStatusGuide from "@/components/frontdesk/payments/WalkinStatusGuide";
import WalkinRegistrationModal from "@/components/frontdesk/payments/WalkinRegistrationModal";
import EditWalkinModal from "@/components/frontdesk/payments/EditWalkinModal";
import WalkinPaymentModal from "@/components/frontdesk/payments/WalkinPaymentModal";

export default function WalkinsManager() {
  const { profile } = useStaffProfile();
  const now = useSecondClock();
  const [entries, setEntries] = useState<WalkinRow[]>([]);
  const [dateKey, setDateKey] = useState(() => toDateKey(new Date()));
  // Dashboard deep link: /frontdesk/walk-ins?id=… (entries load after mount).
  const [selectedId, setSelectedId] = useState<string | null>(() => readQueryParam("id"));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<WalkinStatusKey | "all">("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");

  const [showRegistration, setShowRegistration] = useState(false);
  // Bumped when a walk-in is registered or transferred, to refresh the transfers list.
  const [transfersKey, setTransfersKey] = useState(0);
  const [editingRow, setEditingRow] = useState<WalkinRow | null>(null);
  const [cancellingRow, setCancellingRow] = useState<WalkinRow | null>(null);
  const [payingRow, setPayingRow] = useState<WalkinRow | null>(null);

  const refresh = useCallback(() => {
    if (!profile?.branchId) return;
    const supabase = createClient();
    getTodaysWalkins(supabase, profile.branchId, dateKey).then(setEntries);
  }, [profile?.branchId, dateKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const serviceOptions = useMemo(
    () => Array.from(new Set(entries.map((r) => walkinServiceName(r)))).sort(),
    [entries]
  );
  const staffOptions = useMemo(
    () => Array.from(new Set(entries.map((r) => walkinProfessionalName(r)))).sort(),
    [entries]
  );

  const stats = useMemo(() => {
    const active = entries.filter((r) => r.status !== "cancelled");
    return {
      total: active.length,
      inService: active.filter((r) => (r.session_status ?? "in_service") === "in_service").length,
      overdue: active.filter(
        (r) =>
          r.session_status === "in_service" &&
          computeServiceTiming(r.service_started_at, r.duration_minutes, now)?.kind === "overdue"
      ).length,
      completed: active.filter((r) => ["completed", "paid"].includes(r.session_status ?? "")).length,
    };
  }, [entries, now]);

  const filteredEntries = useMemo(() => {
    return entries.filter((row) => {
      if (serviceFilter !== "all" && walkinServiceName(row) !== serviceFilter) return false;
      if (staffFilter !== "all" && walkinProfessionalName(row) !== staffFilter) return false;
      if (statusFilter !== "all") {
        const sessionStatus = (row.session_status ?? "in_service") as SessionStatus;
        const timing = sessionStatus === "in_service" ? computeServiceTiming(row.service_started_at, row.duration_minutes, now) : null;
        const key = row.status === "cancelled" ? "other" : walkinStatusKey(sessionStatus, timing);
        if (key !== statusFilter) return false;
      }
      return true;
    });
  }, [entries, serviceFilter, staffFilter, statusFilter, now]);

  const selectedWalkin = entries.find((r) => r.id === selectedId) ?? null;

  async function handleStatusChange(row: WalkinRow, next: SessionStatus) {
    setError(null);
    setBusyId(row.id);
    const supabase = createClient();
    const result = await updateSessionStatus(supabase, row.id, next);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    refresh();
    if (next === "completed") setPayingRow(row);
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
    setCancellingRow(null);
    refresh();
  }

  return (
    <div className="space-y-4">
      <WalkinsTopBar stats={stats} onAddWalkin={() => setShowRegistration(true)} />

      <WalkinsFilterBar
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        serviceFilter={serviceFilter}
        onServiceFilterChange={setServiceFilter}
        serviceOptions={serviceOptions}
        staffFilter={staffFilter}
        onStaffFilterChange={setStaffFilter}
        staffOptions={staffOptions}
        dateKey={dateKey}
        onDateChange={setDateKey}
        onRefresh={refresh}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <WalkinsListTable
          entries={filteredEntries}
          selectedId={selectedId}
          onSelect={setSelectedId}
          now={now}
          busyId={busyId}
          onStart={(row) => handleStatusChange(row, "in_service")}
          onFinish={(row) => handleStatusChange(row, "completed")}
          onEdit={setEditingRow}
          onCancelRequest={setCancellingRow}
          onViewReceipt={setPayingRow}
        />
        <WalkinDetailPanel
          walkin={selectedWalkin}
          now={now}
          busy={busyId === selectedWalkin?.id}
          onClose={() => setSelectedId(null)}
          onStart={(row) => handleStatusChange(row, "in_service")}
          onFinish={(row) => handleStatusChange(row, "completed")}
          onNotesSaved={refresh}
        />
      </div>

      <WalkinTransfersPanel refreshKey={transfersKey} />

      <WalkinStatusGuide />

      {showRegistration && (
        <WalkinRegistrationModal
          onClose={() => setShowRegistration(false)}
          onRegistered={() => {
            refresh();
            setTransfersKey((k) => k + 1);
          }}
        />
      )}

      {editingRow && (
        <EditWalkinModal
          walkin={editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={() => {
            setEditingRow(null);
            refresh();
          }}
        />
      )}

      {payingRow && (
        <WalkinPaymentModal
          walkin={payingRow}
          onClose={() => setPayingRow(null)}
          onPaid={() => {
            setPayingRow(null);
            refresh();
          }}
        />
      )}

      {cancellingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5">
            <p className="text-center text-sm font-medium text-red-700">Cancel this walk-in?</p>
            <p className="mt-1 text-center text-xs text-ink/50">{cancellingRow.walkin_name}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setCancellingRow(null)}
                className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60 hover:border-ink/30"
              >
                Keep
              </button>
              <button
                onClick={() => confirmCancel(cancellingRow)}
                disabled={busyId === cancellingRow.id}
                className="flex-1 rounded-full bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {busyId === cancellingRow.id ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
