import { LayoutList, Plus, Upload } from "lucide-react";

export default function StaffScheduleHeader() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Staff Schedule</h1>
          <p className="text-sm text-ink/50">
            Today&apos;s Schedule &bull; Thursday, Oct 24, 2024
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            <LayoutList className="h-4 w-4" /> High Density View
          </button>
          <button className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            Filter Staff
          </button>
          <button className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            <Plus className="h-4 w-4" /> Add Block
          </button>
          <button className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
            <Upload className="h-4 w-4" /> Publish to GlowSync
          </button>
        </div>
      </div>
    </div>
  );
}
