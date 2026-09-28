"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import { RefreshCw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { getStaffShiftsForDate, removeStaffOff, toDateKey, type StaffOffRecord } from "@/lib/supabase/queries/staffShifts";
import { getLeaveRequestsForBranch } from "@/lib/supabase/queries/leaveRequests";
import {
  getUpcomingTransfersFromBranch,
  getUpcomingTransfersIntoBranch,
} from "@/lib/supabase/queries/branchTransferRequests";
import { getAppointmentBlocksForDate, type ScheduleBlock } from "@/lib/supabase/queries/scheduleTimeline";
import {
  getAttendanceForDate,
  getBreaksForAttendanceIds,
  isWithinShift,
  type AttendanceRow,
  type AttendanceBreak,
} from "@/lib/supabase/queries/staffAttendance";
import { serviceTimingLabel, serviceTimingStyle, computeServiceTiming, useServiceTimingClock } from "@/lib/serviceTiming";
import StaffDetailPanel from "./StaffDetailPanel";
import StaffStatusControls, { type DisplayStatus } from "./StaffStatusControls";

type StaffRow = { id: string; full_name: string; department: string | null; avatar_url: string | null; visiting?: boolean };
export type StaffStatusSummary = { id: string; full_name: string; department: string | null; status: DisplayStatus };

const RANGE_START = 9 * 60;
const RANGE_END = 20 * 60;
const CUTOFF = 13 * 60;
const SLOT_MIN = 30;
const SLOT_WIDTH = 72;
const SLOT_COUNT = (RANGE_END - RANGE_START) / SLOT_MIN;

function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesLabel(min: number) {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const meridiem = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

function offBlockSpan(period: StaffOffRecord["period"]): [number, number] {
  if (period === "full_day") return [RANGE_START, RANGE_END];
  if (period === "morning") return [RANGE_START, Math.min(CUTOFF, RANGE_END)];
  return [Math.max(CUTOFF, RANGE_START), RANGE_END];
}

const PERIOD_LABEL: Record<StaffOffRecord["period"], string> = {
  full_day: "Off (Whole Day)",
  morning: "Off (Morning)",
  afternoon: "Off (Afternoon)",
};

function formatDateRange(sortedDateKeys: string[]) {
  const fmt = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  if (sortedDateKeys.length === 1) return fmt(sortedDateKeys[0]);
  return `${fmt(sortedDateKeys[0])} – ${fmt(sortedDateKeys[sortedDateKeys.length - 1])}`;
}

function positionStyle(startMin: number, durationMin: number) {
  const clippedStart = Math.max(startMin, RANGE_START);
  const clippedEnd = Math.min(startMin + durationMin, RANGE_END);
  const left = ((clippedStart - RANGE_START) / SLOT_MIN) * SLOT_WIDTH;
  const width = Math.max(((clippedEnd - clippedStart) / SLOT_MIN) * SLOT_WIDTH, 8);
  return { left, width };
}

const GRID_LINES_STYLE: CSSProperties = {
  backgroundImage:
    `repeating-linear-gradient(to right, rgba(17,24,39,0.08) 0, rgba(17,24,39,0.08) 1px, transparent 1px, transparent ${SLOT_WIDTH}px), ` +
    `repeating-linear-gradient(to right, rgba(17,24,39,0.16) 0, rgba(17,24,39,0.16) 1px, transparent 1px, transparent ${SLOT_WIDTH * 2}px)`,
};

export default function StaffScheduleTimeline({
  selectedDate,
  search,
  departmentFilter,
  refreshKey,
  onChanged,
  onStats,
}: {
  selectedDate: Date;
  search: string;
  departmentFilter: string;
  refreshKey: number;
  onChanged: () => void;
  onStats?: (stats: {
    capacityPercent: number | null;
    departments: string[];
    onDuty: StaffStatusSummary[];
    onBreak: StaffStatusSummary[];
    absent: StaffStatusSummary[];
  }) => void;
}) {
  const { profile } = useStaffProfile();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [offRecords, setOffRecords] = useState<StaffOffRecord[]>([]);
  const [leaveRangeByStaff, setLeaveRangeByStaff] = useState<Record<string, string>>({});
  const [transferRangeByStaff, setTransferRangeByStaff] = useState<Record<string, string>>({});
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [breaks, setBreaks] = useState<AttendanceBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string; label: string; source: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const now = useServiceTimingClock();

  useEffect(() => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const supabase = createClient();
    const dateKey = toDateKey(selectedDate);
    Promise.all([
      supabase
        .from("staff_members")
        .select("id, full_name, department, avatar_url")
        .eq("branch_id", profile.branchId)
        .order("full_name"),
      getStaffShiftsForDate(supabase, profile.branchId, dateKey),
      getLeaveRequestsForBranch(supabase, profile.branchId),
      getUpcomingTransfersFromBranch(supabase, profile.branchId),
      getUpcomingTransfersIntoBranch(supabase, profile.branchId),
      getAppointmentBlocksForDate(supabase, profile.branchId, dateKey),
      getAttendanceForDate(supabase, profile.branchId, dateKey),
    ]).then(async ([staffRes, records, leaveRequests, transfers, transfersIn, appointmentBlocks, attendanceRows]) => {
      if (cancelled) return;
      const homeStaff = (staffRes.data as StaffRow[]) ?? [];
      const homeIds = new Set(homeStaff.map((s) => s.id));
      const guests: StaffRow[] = transfersIn
        .filter((t) => t.dates.includes(dateKey) && !homeIds.has(t.staff_member_id))
        .map((t) => ({ id: t.staff_member_id, full_name: t.full_name, department: t.department, avatar_url: null, visiting: true }));
      const allStaff = [...homeStaff, ...guests];
      setStaff(allStaff);
      setOffRecords(records);
      setBlocks(appointmentBlocks);
      setAttendance(attendanceRows);
      setSelectedStaffId((prev) => (prev && allStaff.some((s) => s.id === prev) ? prev : allStaff[0]?.id ?? null));

      const breakRows = await getBreaksForAttendanceIds(supabase, attendanceRows.map((r) => r.id));
      if (cancelled) return;
      setBreaks(breakRows);

      const rangeMap: Record<string, string> = {};
      for (const lr of leaveRequests) {
        if (lr.status !== "approved" || !lr.dates.includes(dateKey)) continue;
        const sorted = [...lr.dates].sort();
        rangeMap[lr.staff_member_id] = `On leave: ${formatDateRange(sorted)}`;
      }
      setLeaveRangeByStaff(rangeMap);

      const transferMap: Record<string, string> = {};
      for (const t of transfers) {
        if (!t.dates.includes(dateKey)) continue;
        const sorted = [...t.dates].sort();
        transferMap[t.staff_member_id] = `Transferred to ${t.target_branch_name}: ${formatDateRange(sorted)}`;
      }
      setTransferRangeByStaff(transferMap);

      setLastFetchedAt(new Date());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.branchId, selectedDate, refreshKey]);

  useEffect(() => {
    if (!profile?.branchId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`staff-attendance-${profile.branchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "staff_attendance", filter: `branch_id=eq.${profile.branchId}` },
        () => onChanged()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_attendance_breaks" }, () => onChanged())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.branchId, onChanged]);

  useEffect(() => {
    if (!onStats || staff.length === 0) return;
    const offCount = staff.filter((s) => offRecords.some((r) => r.staff_member_id === s.id)).length;
    const capacityPercent = Math.round(((staff.length - offCount) / staff.length) * 100);
    const departments = Array.from(new Set(staff.map((s) => s.department).filter((d): d is string => !!d))).sort();

    const onDuty: StaffStatusSummary[] = [];
    const onBreak: StaffStatusSummary[] = [];
    const absent: StaffStatusSummary[] = [];
    for (const member of staff) {
      const hasOffRecord = offRecords.some((r) => r.staff_member_id === member.id);
      const status: DisplayStatus = hasOffRecord
        ? "day_off"
        : attendance.find((a) => a.staff_member_id === member.id)?.status ?? "scheduled";
      const entry: StaffStatusSummary = { id: member.id, full_name: member.full_name, department: member.department, status };
      if (status === "available" || status === "in_service") onDuty.push(entry);
      else if (status === "on_break") onBreak.push(entry);
      else if (status === "out" || status === "day_off") absent.push(entry);
    }

    onStats({ capacityPercent, departments, onDuty, onBreak, absent });
  }, [staff, offRecords, attendance, onStats]);

  async function confirmRemove() {
    if (!pendingRemove) return;
    setRemoving(true);
    setRemoveError(null);
    const supabase = createClient();
    const { error } = await removeStaffOff(supabase, pendingRemove.id);
    setRemoving(false);
    if (error) {
      setRemoveError(error);
      return;
    }
    setPendingRemove(null);
    onChanged();
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-ink/50">Loading staff schedule...</p>
      </div>
    );
  }

  const filteredStaff = staff.filter(
    (member) =>
      member.full_name.toLowerCase().includes(search.trim().toLowerCase()) &&
      (!departmentFilter || member.department === departmentFilter)
  );
  const isToday = toDateKey(selectedDate) === toDateKey(new Date());
  const dateKey = toDateKey(selectedDate);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  function statusFor(memberId: string): DisplayStatus {
    const hasOffRecord = offRecords.some((r) => r.staff_member_id === memberId);
    if (hasOffRecord) return "day_off";
    return attendance.find((a) => a.staff_member_id === memberId)?.status ?? "scheduled";
  }

  const selectedMember = staff.find((s) => s.id === selectedStaffId) ?? null;
  const selectedAttendance = selectedMember ? attendance.find((a) => a.staff_member_id === selectedMember.id) ?? null : null;
  const selectedBlocks = selectedMember ? blocks.filter((b) => b.professional_id === selectedMember.id) : [];
  const selectedBreaks = selectedAttendance ? breaks.filter((b) => b.attendance_id === selectedAttendance.id) : [];
  const selectedActiveBlock = selectedBlocks.find((b) => b.sessionStatus === "in_service");
  const selectedTiming = selectedActiveBlock
    ? computeServiceTiming(selectedActiveBlock.serviceStartedAt, selectedActiveBlock.duration_minutes, now)
    : null;

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 rounded-2xl bg-white p-6 shadow-sm">
          {staff.length === 0 ? (
            <p className="text-sm text-ink/50">No staff assigned to this branch yet.</p>
          ) : filteredStaff.length === 0 ? (
            <p className="text-sm text-ink/50">No staff match &quot;{search}&quot;.</p>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ width: 220 + SLOT_COUNT * SLOT_WIDTH + 190 }}>
                <div className="flex border-b border-ink/10 pb-2">
                  <div className="w-[220px] shrink-0 text-[11px] font-medium uppercase tracking-wide text-ink/40">
                    Therapists
                  </div>
                  <div className="relative flex" style={{ width: SLOT_COUNT * SLOT_WIDTH, ...GRID_LINES_STYLE }}>
                    {Array.from({ length: SLOT_COUNT }).map((_, i) => (
                      <div key={i} style={{ width: SLOT_WIDTH }} className="shrink-0 text-[11px] text-ink/40">
                        {minutesLabel(RANGE_START + i * SLOT_MIN)}
                      </div>
                    ))}
                  </div>
                  <div className="w-[190px] shrink-0 text-right text-[11px] font-medium uppercase tracking-wide text-ink/40">
                    Status
                  </div>
                </div>

                <div className="divide-y divide-ink/5">
                  {filteredStaff.map((member) => {
                    const offRecord = offRecords.find((r) => r.staff_member_id === member.id);
                    const memberAttendance = attendance.find((a) => a.staff_member_id === member.id);
                    const memberBlocks = blocks.filter((b) => b.professional_id === member.id);
                    const memberBreaks = memberAttendance ? breaks.filter((b) => b.attendance_id === memberAttendance.id) : [];
                    const offSpan = offRecord ? offBlockSpan(offRecord.period) : null;
                    const isSelected = member.id === selectedStaffId;
                    const activeBlock = memberBlocks.find((b) => b.sessionStatus === "in_service");
                    const timing = activeBlock ? computeServiceTiming(activeBlock.serviceStartedAt, activeBlock.duration_minutes, now) : null;

                    return (
                      <div
                        key={member.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedStaffId(member.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setSelectedStaffId(member.id);
                        }}
                        className={`flex w-full cursor-pointer items-center py-4 text-left ${isSelected ? "bg-blush/40" : ""}`}
                      >
                        <div className="flex w-[220px] shrink-0 items-center gap-3 pr-3">
                          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-sm font-bold text-coral-dark">
                            {member.avatar_url ? (
                              <Image src={member.avatar_url} alt={member.full_name} fill className="object-cover" />
                            ) : (
                              member.full_name.charAt(0)
                            )}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-ink">{member.full_name}</p>
                            <p className="text-xs text-ink/50">
                              {member.department ?? ""}
                              {member.visiting && <span className="text-blue-600"> · Visiting</span>}
                            </p>
                          </div>
                        </div>

                        <div className="relative" style={{ width: SLOT_COUNT * SLOT_WIDTH, height: 56, ...GRID_LINES_STYLE }}>
                          {offRecord && offSpan && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingRemove({
                                  id: offRecord.id,
                                  name: member.full_name,
                                  label:
                                    offRecord.source === "leave"
                                      ? leaveRangeByStaff[member.id] ?? "On leave"
                                      : offRecord.source === "transfer"
                                      ? transferRangeByStaff[member.id] ?? "Transferred"
                                      : PERIOD_LABEL[offRecord.period],
                                  source: offRecord.source,
                                });
                              }}
                              style={positionStyle(offSpan[0], offSpan[1] - offSpan[0])}
                              className={`absolute top-0 flex h-full items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-medium ${
                                offRecord.source === "leave"
                                  ? "bg-amber-50 text-amber-700"
                                  : offRecord.source === "transfer"
                                  ? "bg-blue-50 text-blue-700"
                                  : "bg-red-50 text-red-600"
                              }`}
                            >
                              {offRecord.source === "leave"
                                ? leaveRangeByStaff[member.id] ?? "On leave"
                                : offRecord.source === "transfer"
                                ? transferRangeByStaff[member.id] ?? "Transferred"
                                : PERIOD_LABEL[offRecord.period]}
                              <X className="h-3 w-3" />
                            </span>
                          )}

                          {!offRecord &&
                            memberBlocks.map((block) => {
                              const startMin = timeToMinutes(block.start_time);
                              if (startMin + block.duration_minutes <= RANGE_START || startMin >= RANGE_END) return null;
                              const blockTiming =
                                block.sessionStatus === "in_service"
                                  ? computeServiceTiming(block.serviceStartedAt, block.duration_minutes, now)
                                  : null;
                              const tone =
                                blockTiming?.kind === "overdue"
                                  ? "border-red-300 bg-red-50"
                                  : blockTiming?.kind === "time_reached"
                                  ? "border-amber-300 bg-amber-50"
                                  : "border-teal-200 bg-teal-50";
                              const textTone =
                                blockTiming?.kind === "overdue"
                                  ? "text-red-700"
                                  : blockTiming?.kind === "time_reached"
                                  ? "text-amber-700"
                                  : "text-teal-700";
                              return (
                                <div
                                  key={block.id}
                                  style={positionStyle(startMin, block.duration_minutes)}
                                  className={`absolute top-0 flex h-full flex-col justify-center overflow-hidden rounded-lg border px-2 py-1 ${tone}`}
                                  title={
                                    blockTiming
                                      ? `${serviceTimingLabel(blockTiming)} — ${block.label} (${block.subLabel})`
                                      : `${block.label} — ${block.subLabel}`
                                  }
                                >
                                  <p className={`truncate text-[11px] font-semibold uppercase ${textTone}`}>
                                    {blockTiming ? serviceTimingLabel(blockTiming) : block.label}
                                  </p>
                                  <p className={`truncate text-[10px] ${textTone}`}>
                                    {minutesLabel(startMin)} – {minutesLabel(startMin + block.duration_minutes)}
                                  </p>
                                  <p className={`truncate text-[11px] ${textTone}`}>{block.subLabel}</p>
                                </div>
                              );
                            })}

                          {!offRecord &&
                            memberBreaks.map((brk) => {
                              const start = new Date(brk.break_start);
                              const startMin = start.getHours() * 60 + start.getMinutes();
                              const endMin = brk.break_end
                                ? (() => {
                                    const end = new Date(brk.break_end!);
                                    return end.getHours() * 60 + end.getMinutes();
                                  })()
                                : nowMin;
                              const duration = Math.max(endMin - startMin, 15);
                              if (startMin + duration <= RANGE_START || startMin >= RANGE_END) return null;
                              return (
                                <div
                                  key={brk.id}
                                  style={positionStyle(startMin, duration)}
                                  className="absolute top-0 flex h-full flex-col justify-center overflow-hidden rounded-lg border border-purple-200 bg-purple-50 px-2 py-1"
                                >
                                  <p className="truncate text-[11px] font-semibold uppercase text-purple-700">Break</p>
                                  <p className="truncate text-[10px] text-purple-600">
                                    {minutesLabel(startMin)} – {brk.break_end ? minutesLabel(endMin) : "ongoing"}
                                  </p>
                                </div>
                              );
                            })}
                        </div>

                        <div className="w-[190px] shrink-0 space-y-1" onClick={(e) => e.stopPropagation()}>
                          {timing && (
                            <span className={`block w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${serviceTimingStyle(timing)}`}>
                              {serviceTimingLabel(timing)}
                            </span>
                          )}
                          {isToday && (
                            <StaffStatusControls
                              status={statusFor(member.id)}
                              staffMemberId={member.id}
                              branchId={profile!.branchId!}
                              dateKey={dateKey}
                              editable={!offRecord}
                              onChanged={onChanged}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <StaffDetailPanel
          staffList={staff}
          selectedStaffId={selectedStaffId}
          onSelectStaff={setSelectedStaffId}
          status={selectedMember ? statusFor(selectedMember.id) : "scheduled"}
          serviceTiming={selectedTiming}
          lastUpdated={selectedAttendance?.updated_at ?? null}
          shiftStart={selectedAttendance?.shift_start ?? "09:00:00"}
          shiftEnd={selectedAttendance?.shift_end ?? "18:00:00"}
          onSchedule={selectedAttendance ? isWithinShift(selectedAttendance, now) : false}
          appointmentsUpcoming={selectedBlocks.filter((b) => !b.isWalkIn && timeToMinutes(b.start_time) >= nowMin).length}
          walkinsToday={selectedBlocks.filter((b) => b.isWalkIn).length}
          breaksToday={selectedBreaks.length}
          totalClientsToday={selectedBlocks.length}
          branchId={profile?.branchId ?? ""}
          dateKey={dateKey}
          editable={isToday && !!selectedMember && !offRecords.some((r) => r.staff_member_id === selectedMember.id)}
          onChanged={onChanged}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-blush/60 p-4 text-xs text-ink/60">
        <p>
          <span className="font-semibold text-ink">Booking Restrictions:</span> Bookings are blocked for staff who are
          Out, On Break, Day Off, or currently In Service.
        </p>
        <button onClick={onChanged} className="flex items-center gap-1.5 text-ink/50 hover:text-ink">
          <RefreshCw className="h-3.5 w-3.5" />
          {lastFetchedAt ? `Last updated: ${lastFetchedAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}` : "Refresh"}
        </button>
      </div>

      {pendingRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h2 className="font-semibold text-ink">Remove this block?</h2>
            <p className="mt-2 text-sm text-ink/60">
              <span className="font-medium text-ink">{pendingRemove.name}</span> is currently marked{" "}
              <span className="font-medium text-red-600">{pendingRemove.label}</span> for this date. Removing
              it puts them back on duty and customers will be able to book them again.
            </p>

            {pendingRemove.source === "transfer" && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                This block exists because {pendingRemove.name} is transferred to another branch on this
                date. Removing it makes them bookable here again <span className="font-semibold">while
                they may still be bookable at the other branch too</span> — check with admin before
                removing this one.
              </p>
            )}

            {removeError && <p className="mt-2 text-xs text-red-600">{removeError}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setPendingRemove(null);
                  setRemoveError(null);
                }}
                disabled={removing}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                disabled={removing}
                className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {removing ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
