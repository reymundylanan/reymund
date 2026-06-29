"use client";

import { useState } from "react";

export default function SystemConfig() {
  const [maintenance, setMaintenance] = useState(false);
  const [publicVisible, setPublicVisible] = useState(true);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">System Configuration</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium uppercase text-ink/40">
            Default Delay (Minutes)
          </label>
          <p className="text-[11px] text-ink/40">Booking lead times</p>
          <input
            type="number"
            defaultValue={90}
            className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase text-ink/40">
            Low Stock Warning Level (%)
          </label>
          <p className="text-[11px] text-ink/40">Inventory thresholds</p>
          <input
            type="number"
            defaultValue={40}
            className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase text-ink/40">
            Critical Stock Level (%)
          </label>
          <input
            type="number"
            defaultValue={15}
            className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
          />
        </div>
      </div>

      <div className="mt-6 space-y-3 border-t border-ink/10 pt-4">
        <label className="flex items-center justify-between">
          <span>
            <span className="block text-sm font-medium text-ink">
              Maintenance Mode
            </span>
            <span className="block text-xs text-ink/50">
              Disable client bookings globally.
            </span>
          </span>
          <input
            type="checkbox"
            checked={maintenance}
            onChange={() => setMaintenance((v) => !v)}
            className="h-5 w-9 rounded-full"
          />
        </label>
        <label className="flex items-center justify-between">
          <span>
            <span className="block text-sm font-medium text-ink">
              Public Site Visibility
            </span>
            <span className="block text-xs text-ink/50">
              Control brand site indexed status.
            </span>
          </span>
          <input
            type="checkbox"
            checked={publicVisible}
            onChange={() => setPublicVisible((v) => !v)}
            className="h-5 w-9 rounded-full"
          />
        </label>
      </div>

      <button className="mt-5 w-full rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark">
        Save Configuration
      </button>
    </div>
  );
}
