"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
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
}: {
  selectedDate?: Date | null;
  selectedDates?: Date[];
  onSelect: (date: Date) => void;
  initialMonth?: Date;
}) {
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfMonth(initialMonth ?? selectedDate ?? selectedDates?.[0] ?? new Date())
  );

  function shiftMonth(delta: number) {
    setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  return (
    <div className="rounded-xl border border-ink/15 p-2.5">
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

      <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-ink/40">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-0.5 grid grid-cols-7 gap-0.5 text-center text-xs">
        {buildMonthGrid(calendarMonth).map((day, i) => {
          const cellDate = day
            ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)
            : null;
          const cellKey = cellDate ? toDateKey(cellDate) : null;
          const isSelected = cellKey && selectedDate ? cellKey === toDateKey(selectedDate) : false;
          const isInSelectedDates = cellKey && selectedDates ? selectedDates.some((d) => toDateKey(d) === cellKey) : false;
          return (
            <button
              key={i}
              disabled={!day}
              onClick={() => cellDate && onSelect(cellDate)}
              className={`aspect-square w-8 justify-self-center rounded-full ${
                !day
                  ? ""
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
