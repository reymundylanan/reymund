"use client";

import { useState } from "react";
import { CalendarOff, FileText, Shuffle } from "lucide-react";
import ManageLeaveRequestsModal from "@/components/frontdesk/staff/ManageLeaveRequestsModal";
import BranchTransferRequestModal from "@/components/frontdesk/staff/BranchTransferRequestModal";

const actions = [
  { label: "Manage Leave Requests", icon: CalendarOff },
  { label: "Assign Branch Shifts", icon: Shuffle },
  { label: "View Staff Records", icon: FileText },
];

export default function QuickActions() {
  const [showLeaveRequests, setShowLeaveRequests] = useState(false);
  const [showBranchTransfer, setShowBranchTransfer] = useState(false);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Quick Actions</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => {
                if (action.label === "Manage Leave Requests") setShowLeaveRequests(true);
                if (action.label === "Assign Branch Shifts") setShowBranchTransfer(true);
              }}
              className="flex items-center gap-3 rounded-xl border border-ink/10 p-4 hover:border-coral hover:bg-blush"
            >
              <Icon className="h-5 w-5 text-coral-dark" />
              <span className="text-sm font-medium text-ink/70">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>

      {showLeaveRequests && (
        <ManageLeaveRequestsModal onClose={() => setShowLeaveRequests(false)} />
      )}
      {showBranchTransfer && (
        <BranchTransferRequestModal onClose={() => setShowBranchTransfer(false)} />
      )}
    </div>
  );
}
