import { appointments, weekDays } from "@/lib/adminData";
import type { Appointment } from "@/lib/adminData";

const START_HOUR = 8;
const END_HOUR = 20;
const ROW_HEIGHT = 48;

const statusStyles: Record<Appointment["status"], string> = {
  confirmed: "border-l-4 border-coral bg-blush",
  pending: "border-l-4 border-amber-400 bg-amber-50",
  conflict: "border-l-4 border-red-500 bg-red-50",
};

const hours = Array.from(
  { length: END_HOUR - START_HOUR + 1 },
  (_, i) => START_HOUR + i
);

function formatHour(h: number) {
  const meridiem = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12.toString().padStart(2, "0")} ${meridiem}`;
}

export default function BookingsCalendar({
  onSelect,
}: {
  onSelect: (a: Appointment) => void;
}) {
  const gridHeight = (END_HOUR - START_HOUR) * ROW_HEIGHT;

  return (
    <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-sm">
      <div className="grid grid-cols-[64px_repeat(7,1fr)] gap-px">
        <div />
        {weekDays.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-sm font-medium text-ink/70">
            {d}
          </div>
        ))}
      </div>

      <div className="relative grid grid-cols-[64px_repeat(7,1fr)] gap-px" style={{ height: gridHeight }}>
        <div>
          {hours.slice(0, -1).map((h) => (
            <div
              key={h}
              style={{ height: ROW_HEIGHT }}
              className="border-t border-ink/5 pr-2 text-right text-xs text-ink/40"
            >
              {formatHour(h)}
            </div>
          ))}
        </div>

        {weekDays.map((_, dayIndex) => (
          <div key={dayIndex} className="relative border-l border-ink/5">
            {hours.slice(0, -1).map((h) => (
              <div key={h} style={{ height: ROW_HEIGHT }} className="border-t border-ink/5" />
            ))}

            {appointments
              .filter((a) => a.day === dayIndex)
              .map((a) => {
                const top = (a.startHour - START_HOUR) * ROW_HEIGHT;
                const height = a.duration * ROW_HEIGHT;
                return (
                  <button
                    key={a.id}
                    onClick={() => onSelect(a)}
                    style={{ top, height }}
                    className={`absolute left-1 right-1 rounded-md p-1.5 text-left text-[11px] leading-tight ${statusStyles[a.status]}`}
                  >
                    <p className="font-semibold text-ink">{a.service}</p>
                    <p className="text-ink/60">{a.specialist}</p>
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
