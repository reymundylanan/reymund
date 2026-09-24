"use client";

import { ChevronLeft, ChevronRight, ChevronsRight, LayoutList, Plus } from "lucide-react";

export default function StaffScheduleHeader({
  date,
  onPrevDay,
  onNextDay,
  onToday,
  onAddBlock,
}: {
  date: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onAddBlock: () => void;
}) {
  const label = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Staff Schedule</h1>
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={onPrevDay}
              aria-label="Previous day"
              className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-coral-dark"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-base text-ink/60">{label}</p>
            <button
              onClick={onNextDay}
              aria-label="Next day"
              className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-coral-dark"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={onToday}
              aria-label="Jump to today"
              title="Jump to today"
              className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-coral-dark"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-coral">
            <LayoutList className="h-3.5 w-3.5" /> High Density View
          </button>
          <button className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-coral">
            Filter Staff
          </button>
          <button
            onClick={onAddBlock}
            className="flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-coral"
          >
            <Plus className="h-3.5 w-3.5" /> Add Block
          </button>
        </div>
      </div>
    </div>
  );
}
