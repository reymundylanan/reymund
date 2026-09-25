"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isBeforeToday(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function buildMonthGrid(monthDate: Date) {
  const first = startOfMonth(monthDate);
  const daysInMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0
  ).getDate();
  const leading = first.getDay();
  const cells: (number | null)[] = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

export default function MonthCalendar({
  selectedDate,
  selectedDates,
  onSelect,
  initialMonth,
  disablePast = true,
}: {
  selectedDate?: Date | null;
  selectedDates?: Date[];
  onSelect: (date: Date) => void;
  initialMonth?: Date;
  disablePast?: boolean;
}) {
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfMonth(initialMonth ?? selectedDate ?? selectedDates?.[0] ?? new Date())
  );

  function shiftMonth(delta: number) {
    setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  return (
    <div className="w-full rounded-xl border border-ink/15 bg-white p-3.5 shadow-lg">
      <div className="flex items-center justify-between">
        <button
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-coral-dark"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-ink">
          {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
        <button
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-coral-dark"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink/40">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center text-sm">
        {buildMonthGrid(calendarMonth).map((day, i) => {
          const cellDate = day
            ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)
            : null;
          const cellKey = cellDate ? toDateKey(cellDate) : null;
          const isPast = disablePast && cellDate ? isBeforeToday(cellDate) : false;
          const isSelected = cellKey && selectedDate ? cellKey === toDateKey(selectedDate) : false;
          const isInSelectedDates = cellKey && selectedDates ? selectedDates.some((d) => toDateKey(d) === cellKey) : false;
          return (
            <button
              key={i}
              disabled={!day || isPast}
              onClick={() => cellDate && !isPast && onSelect(cellDate)}
              className={`aspect-square w-9 justify-self-center rounded-full ${
                !day
                  ? ""
                  : isPast
                    ? "text-ink/20 cursor-not-allowed"
                    : isSelected || isInSelectedDates
                      ? "bg-coral text-white"
                      : "hover:bg-blush"
              }`}
            >
              {day ?? ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
