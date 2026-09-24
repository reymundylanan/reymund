"use client";

import { Calendar, Check, Clock, ChevronLeft, ChevronRight, ChevronsRight, X } from "lucide-react";
import {
  parseService,
  toDateKey,
  toMinutes,
  type AppointmentRow,
} from "@/components/frontdesk/appointments/utils";
import type { StaffRow } from "@/components/frontdesk/appointments/AppointmentsManager";

const START_HOUR = 9;
const END_HOUR = 20.5;
const COL_WIDTH = 64;

const slots: number[] = [];
for (let h = START_HOUR; h <= END_HOUR; h += 0.5) slots.push(h);

function formatHour(h: number) {
  const hour24 = Math.floor(h);
  const min = h % 1 === 0 ? "00" : "30";
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${min}`;
}

const STATUS_ICON: Record<string, typeof Check> = {
  confirmed: Check,
  checked_in: Check,
  in_service: Check,
  completed: Check,
  pending: Clock,
  cancelled: X,
  no_show: X,
};

const STATUS_BLOCK_STYLE: Record<string, string> = {
  pending: "border-l-4 border-amber-400 bg-amber-50 text-amber-800",
  cancelled: "border-l-4 border-ink/25 bg-ink/5 text-ink/40 line-through",
  no_show: "border-l-4 border-ink/25 bg-ink/5 text-ink/40 line-through",
};

const DEFAULT_BLOCK_STYLE = "border-l-4 border-coral bg-blush text-ink";
const CONFLICT_BLOCK_STYLE = "border-l-4 border-red-500 bg-red-50 text-red-700";

export default function StaffTimeline({
  staff,
  rows,
  conflictIds,
  selectedDate,
  onPrevDay,
  onNextDay,
  onToday,
  onSelect,
}: {
  staff: StaffRow[];
  rows: AppointmentRow[];
  conflictIds: Set<string>;
  selectedDate: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onSelect: (id: string) => void;
}) {
  const gridWidth = (slots.length - 1) * COL_WIDTH;
  const dateKey = toDateKey(selectedDate);
  const dayRows = rows.filter((r) => r.scheduled_date === dateKey);

  const byStaff = new Map<string, AppointmentRow[]>();
  let unmatchedCount = 0;
  for (const r of dayRows) {
    const { specialist } = parseService(r.notes);
    const match = staff.find((s) => s.full_name.toLowerCase() === specialist.toLowerCase());
    if (match) {
      byStaff.set(match.id, [...(byStaff.get(match.id) ?? []), r]);
    } else {
      unmatchedCount++;
    }
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-center gap-3">
        <button
          onClick={onPrevDay}
          aria-label="Previous day"
          className="rounded-full p-1.5 text-ink/40 hover:bg-blush hover:text-coral-dark"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="flex items-center gap-2 text-base font-semibold text-ink">
          <Calendar className="h-4 w-4 text-coral-dark" />
          {selectedDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        <button
          onClick={onNextDay}
          aria-label="Next day"
          className="rounded-full p-1.5 text-ink/40 hover:bg-blush hover:text-coral-dark"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <button
          onClick={onToday}
          aria-label="Jump to today"
          title="Jump to today"
          className="rounded-full p-1.5 text-ink/40 hover:bg-blush hover:text-coral-dark"
        >
          <ChevronsRight className="h-5 w-5" />
        </button>
      </div>

      {staff.length === 0 ? (
        <p className="text-sm text-ink/50">No staff assigned to this branch yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex">
            <div className="w-32 shrink-0" />
            <div className="flex" style={{ width: gridWidth }}>
              {slots.slice(0, -1).map((h) => (
                <div
                  key={h}
                  style={{ width: COL_WIDTH }}
                  className="shrink-0 border-l border-ink/5 py-2 text-center text-[11px] text-ink/40"
                >
                  {formatHour(h)}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-1 space-y-1">
            {staff.map((member) => {
              const blocks = byStaff.get(member.id) ?? [];
              return (
                <div key={member.id} className="flex items-center">
                  <div className="w-32 shrink-0 text-sm font-medium text-ink/70">
                    {member.full_name}
                  </div>
                  <div className="relative h-12 border-t border-ink/5" style={{ width: gridWidth }}>
                    {blocks.map((r) => {
                      const { service } = parseService(r.notes);
                      const startHour = toMinutes(r.start_time) / 60;
                      const left = (startHour - START_HOUR) * COL_WIDTH * 2;
                      const width = (r.duration_minutes / 60) * COL_WIDTH * 2;
                      const isConflict = conflictIds.has(r.id);
                      const StatusIcon = STATUS_ICON[r.status];
                      const blockStyle = isConflict
                        ? CONFLICT_BLOCK_STYLE
                        : (STATUS_BLOCK_STYLE[r.status] ?? DEFAULT_BLOCK_STYLE);
                      return (
                        <button
                          key={r.id}
                          onClick={() => onSelect(r.id)}
                          style={{ left, width }}
                          className={`absolute top-1 flex h-10 items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-medium ${blockStyle}`}
                        >
                          {StatusIcon && <StatusIcon className="h-3 w-3 shrink-0" />}
                          <span className="truncate">{service}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {unmatchedCount > 0 && (
        <p className="mt-3 text-xs text-ink/40">
          {unmatchedCount} appointment{unmatchedCount === 1 ? "" : "s"} without a specific therapist assigned
          {unmatchedCount === 1 ? " isn't" : " aren't"} shown here — check the List view.
        </p>
      )}
    </div>
  );
}
