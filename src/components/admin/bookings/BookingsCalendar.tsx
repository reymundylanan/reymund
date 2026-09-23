"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import type { DbAppointment } from "@/components/admin/bookings/BookingsManager";

const START_HOUR = 8;
const END_HOUR = 20;
const SLOT_MINUTES = 30;
const ROW_HEIGHT = 24; // px per 30-min slot — matches the actual booking flow's 30-min increments
const PIXELS_PER_HOUR = ROW_HEIGHT * (60 / SLOT_MINUTES);

const statusStyles: Record<string, string> = {
  confirmed: "border-l-4 border-coral bg-blush",
  checked_in: "border-l-4 border-coral bg-blush",
  in_service: "border-l-4 border-coral bg-blush",
  completed: "border-l-4 border-coral bg-blush",
  pending: "border-l-4 border-amber-400 bg-amber-50",
  conflict: "border-l-4 border-red-500 bg-red-50",
  no_show: "border-l-4 border-red-500 bg-red-50",
  cancelled: "border-l-4 border-red-500 bg-red-50",
};

const timeSlots = Array.from(
  { length: ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES + 1 },
  (_, i) => START_HOUR * 60 + i * SLOT_MINUTES
);

function formatSlot(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const meridiem = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

function getWeekDates(weekOffset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay() + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getWeekLabel(weekDates: Date[]): string {
  const start = weekDates[0];
  const end = weekDates[weekDates.length - 1];
  const startMonth = start.toLocaleDateString("en-US", { month: "long" });
  const endMonth = end.toLocaleDateString("en-US", { month: "long" });

  if (start.getFullYear() !== end.getFullYear()) {
    return `${startMonth} ${start.getFullYear()} – ${endMonth} ${end.getFullYear()}`;
  }
  if (startMonth !== endMonth) {
    return `${startMonth} – ${endMonth} ${start.getFullYear()}`;
  }
  return `${startMonth} ${start.getFullYear()}`;
}

export default function BookingsCalendar({
  appointments,
  onSelect,
}: {
  appointments: DbAppointment[];
  onSelect: (a: DbAppointment) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = getWeekDates(weekOffset);
  const gridHeight = (END_HOUR - START_HOUR) * PIXELS_PER_HOUR;

  return (
    <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-center gap-4">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          aria-label="Previous week"
          className="rounded-full p-2.5 text-ink/50 hover:bg-blush hover:text-coral-dark"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <p className="text-lg font-semibold text-ink">{getWeekLabel(weekDates)}</p>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          aria-label="Next week"
          className="rounded-full p-2.5 text-ink/50 hover:bg-blush hover:text-coral-dark"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
        <button
          onClick={() => setWeekOffset(0)}
          aria-label="Jump to this week"
          title="Jump to this week"
          className="rounded-full p-2.5 text-ink/50 hover:bg-blush hover:text-coral-dark"
        >
          <ChevronsRight className="h-6 w-6" />
        </button>
      </div>

      <div className="grid grid-cols-[64px_repeat(7,1fr)] gap-px">
        <div />
        {weekDates.map((d) => (
          <div
            key={d.toISOString()}
            className="px-2 py-2 text-center text-sm font-medium text-ink/70"
          >
            {d.toLocaleDateString("en-US", { weekday: "short" })} {d.getDate()}
          </div>
        ))}
      </div>

      <div
        className="relative grid grid-cols-[64px_repeat(7,1fr)] gap-px"
        style={{ height: gridHeight }}
      >
        <div>
          {timeSlots.slice(0, -1).map((slot) => (
            <div
              key={slot}
              style={{ height: ROW_HEIGHT }}
              className={`pr-2 text-right text-[11px] text-ink/40 ${
                slot % 60 === 0 ? "border-t border-ink/10" : "border-t border-ink/5"
              }`}
            >
              {slot % 60 === 0 ? formatSlot(slot) : ""}
            </div>
          ))}
        </div>

        {weekDates.map((date) => {
          const dateKey = toDateKey(date);
          const dayAppointments = appointments.filter((a) => a.scheduled_date === dateKey);
          return (
            <div key={dateKey} className="relative border-l border-ink/5">
              {timeSlots.slice(0, -1).map((slot) => (
                <div
                  key={slot}
                  style={{ height: ROW_HEIGHT }}
                  className={slot % 60 === 0 ? "border-t border-ink/10" : "border-t border-ink/5"}
                />
              ))}

              {dayAppointments.map((a) => {
                const [h, m] = a.start_time.split(":").map(Number);
                const startHour = h + m / 60;
                const duration = a.duration_minutes / 60;
                const top = Math.max(0, (startHour - START_HOUR) * PIXELS_PER_HOUR);
                const height = Math.max(20, duration * PIXELS_PER_HOUR);
                return (
                  <button
                    key={a.id}
                    onClick={() => onSelect(a)}
                    style={{ top, height }}
                    className={`absolute left-1 right-1 overflow-hidden rounded-md p-1.5 text-left text-[11px] leading-tight ${
                      statusStyles[a.status] ?? "border-l-4 border-ink/20 bg-ink/5"
                    }`}
                  >
                    <p className="truncate font-semibold text-ink">{a.notes ?? "Appointment"}</p>
                    <p className="truncate text-ink/60">{a.client_name}</p>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
