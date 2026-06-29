"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { adminBranches } from "@/lib/adminData";

type Branch = (typeof adminBranches)[number];

export default function BranchEditPanel({
  branch,
  onClose,
}: {
  branch: Branch;
  onClose: () => void;
}) {
  const [status, setStatus] = useState(branch.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Manage Branch</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Branch Name
            </label>
            <input
              defaultValue={branch.name}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Address
            </label>
            <input
              defaultValue={branch.address}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Branch Manager
            </label>
            <input
              defaultValue={branch.manager}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Operating Hours
            </label>
            <input
              defaultValue={branch.hours}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            >
              <option value="Active">Active</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-3 border-t border-ink/10 pt-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
          >
            Cancel
          </button>
          <button className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
