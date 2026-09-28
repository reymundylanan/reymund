"use client";

import { X } from "lucide-react";
import WalkinRegistrationPanel from "@/components/frontdesk/payments/WalkinRegistrationPanel";

export default function WalkinRegistrationModal({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-end bg-white px-3 pt-3">
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink/40 hover:bg-blush hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 pb-6 pt-1">
          <WalkinRegistrationPanel
            onRegistered={() => {
              onRegistered();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
