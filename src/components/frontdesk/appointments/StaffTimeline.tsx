import { appointmentTimeline } from "@/lib/frontdeskData";
import type { TherapistTimeline } from "@/lib/frontdeskData";

const START_HOUR = 9;
const END_HOUR = 20.5;
const COL_WIDTH = 64;

const blockStyles: Record<TherapistTimeline["blocks"][number]["type"], string> = {
  normal: "border-l-4 border-coral bg-blush text-ink",
  break: "border-l-4 border-ink/30 bg-ink/5 text-ink/50",
  conflict: "border-l-4 border-red-500 bg-red-50 text-red-700",
};

const slots: number[] = [];
for (let h = START_HOUR; h <= END_HOUR; h += 0.5) slots.push(h);

function formatHour(h: number) {
  const hour24 = Math.floor(h);
  const min = h % 1 === 0 ? "00" : "30";
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${min}`;
}

export default function StaffTimeline() {
  const gridWidth = (slots.length - 1) * COL_WIDTH;

  return (
    <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow-sm">
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
        {appointmentTimeline.map((row) => (
          <div key={row.id} className="flex items-center">
            <div className="w-32 shrink-0 text-sm font-medium text-ink/70">
              {row.therapist}
            </div>
            <div
              className="relative h-12 border-t border-ink/5"
              style={{ width: gridWidth }}
            >
              {row.blocks.map((block, i) => {
                const left = (block.start - START_HOUR) * COL_WIDTH * 2;
                const width = block.duration * COL_WIDTH * 2;
                return (
                  <div
                    key={i}
                    style={{ left, width }}
                    className={`absolute top-1 h-10 truncate rounded-md px-2 py-1 text-xs font-medium ${blockStyles[block.type]}`}
                  >
                    {block.title}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
