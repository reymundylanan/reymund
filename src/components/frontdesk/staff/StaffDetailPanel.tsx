"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, RadioTower, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ACTION_FN,
  ACTION_LABEL,
  STATUS_DOT,
  STATUS_LABEL,
  canRunAction,
  type AttendanceActionName,
  type DisplayStatus,
} from "./StaffStatusControls";
import { SERVICE_TIMING_LABEL, SERVICE_TIMING_STYLE, type ServiceTiming } from "@/lib/serviceTiming";

type StaffOption = { id: string; full_name: string; department: string | null; avatar_url: string | null };

const ALL_ACTIONS: AttendanceActionName[] = ["punch_in", "punch_out", "start_break", "end_break"];
const LEGEND_ORDER: DisplayStatus[] = ["available", "in_service", "on_break", "scheduled", "out", "day_off"];

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

function formatShiftTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

export default function StaffDetailPanel({
  staffList,
  selectedStaffId,
  onSelectStaff,
  status,
  serviceTiming,
  lastUpdated,
  shiftStart,
  shiftEnd,
  onSchedule,
  appointmentsUpcoming,
  walkinsToday,
  breaksToday,
  totalClientsToday,
  branchId,
  dateKey,
  editable,
  onChanged,
}: {
  staffList: StaffOption[];
  selectedStaffId: string | null;
  onSelectStaff: (id: string) => void;
  status: DisplayStatus;
  serviceTiming: ServiceTiming | null;
  lastUpdated: string | null;
  shiftStart: string;
  shiftEnd: string;
  onSchedule: boolean;
  appointmentsUpcoming: number;
  walkinsToday: number;
  breaksToday: number;
  totalClientsToday: number;
  branchId: string;
  dateKey: string;
  editable: boolean;
  onChanged: () => void;
}) {
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = staffList.find((s) => s.id === selectedStaffId) ?? null;

  async function run(action: AttendanceActionName) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: actionError } = await ACTION_FN[action](supabase, {
      staffMemberId: selected.id,
      branchId,
      dateKey,
    });
    setBusy(false);
    if (actionError) {
      setError(actionError);
      return;
    }
    onChanged();
  }

  return (
    <div className="w-full shrink-0 space-y-4 lg:w-80">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        {selected ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-sm font-bold text-coral-dark">
                  {selected.avatar_url ? (
                    <Image src={selected.avatar_url} alt={selected.full_name} fill className="object-cover" />
                  ) : (
                    selected.full_name.charAt(0)
                  )}
                </span>
                <div>
                  <p className="font-semibold text-ink">{selected.full_name}</p>
                  <p className="text-xs text-ink/50">{selected.department ?? ""}</p>
                </div>
              </div>
              <button
                onClick={() => setShowSwitcher((v) => !v)}
                aria-label="Switch staff"
                className="rounded-full p-1.5 text-ink/40 hover:bg-blush hover:text-ink"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showSwitcher ? "rotate-180" : ""}`} />
              </button>
            </div>

            {showSwitcher && (
              <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-ink/10 p-1.5">
                {staffList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      onSelectStaff(s.id);
                      setShowSwitcher(false);
                    }}
                    className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-sm ${
                      s.id === selected.id ? "bg-blush text-ink" : "text-ink/60 hover:bg-blush/60"
                    }`}
                  >
                    {s.full_name}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-xl bg-blush/50 p-3">
              <p className="text-xs font-medium text-ink/50">Current Status</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                {STATUS_LABEL[status]}
              </p>
              {serviceTiming && (
                <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${SERVICE_TIMING_STYLE[serviceTiming]}`}>
                  {SERVICE_TIMING_LABEL[serviceTiming]}
                </span>
              )}
              <p className="mt-0.5 text-[11px] text-ink/40">
                {lastUpdated ? `Last updated: ${formatClock(lastUpdated)}` : "No status recorded yet today"}
              </p>
            </div>

            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">Quick Actions</p>
              <div className="space-y-2">
                {ALL_ACTIONS.map((action) => {
                  const enabled = editable && canRunAction(status, action);
                  return (
                    <button
                      key={action}
                      onClick={() => enabled && run(action)}
                      disabled={busy || !enabled}
                      className={`w-full rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                        action === "punch_in"
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : action === "end_break"
                          ? "bg-purple-600 text-white hover:bg-purple-700"
                          : action === "start_break"
                          ? "border border-blue-200 text-blue-700 hover:border-blue-400"
                          : "border border-ink/15 text-ink/70 hover:border-ink/30"
                      }`}
                    >
                      {ACTION_LABEL[action]}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink/50">No staff selected.</p>
        )}
      </div>

      {selected && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Sparkles className="h-4 w-4 text-coral-dark" /> Today&apos;s Schedule
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                onSchedule ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              {onSchedule ? "On Schedule" : "Off Schedule"}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink/50">
            {formatShiftTime(shiftStart)} – {formatShiftTime(shiftEnd)}
          </p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-ink/50">Appointments</dt>
              <dd className="font-medium text-ink">{appointmentsUpcoming} upcoming</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-ink/50">Walk-Ins</dt>
              <dd className="font-medium text-ink">{walkinsToday}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-ink/50">Breaks</dt>
              <dd className="font-medium text-ink">{breaksToday}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-ink/50">Total Clients Today</dt>
              <dd className="font-medium text-ink">{totalClientsToday}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-ink">Status Legend</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink/60">
          {LEGEND_ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s]}`} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl bg-blush/60 p-4 text-xs text-ink/60">
        <RadioTower className="mt-0.5 h-4 w-4 shrink-0 text-coral-dark" />
        <p>All status changes sync in real time with Appointments and Walk-Ins.</p>
      </div>
    </div>
  );
}
