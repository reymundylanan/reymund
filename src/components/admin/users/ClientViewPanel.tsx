"use client";

import { useState } from "react";
import { ShieldOff, ShieldCheck, X } from "lucide-react";
import type { ClientUser } from "@/components/admin/users/types";

export default function ClientViewPanel({
  client,
  onClose,
  onRestricted,
}: {
  client: ClientUser;
  onClose: () => void;
  onRestricted?: (id: string, restricted: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRestricted, setIsRestricted] = useState(client.isRestricted ?? false);

  async function handleToggle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/restrict-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: client.id, restrict: !isRestricted }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        setLoading(false);
        return;
      }
      setIsRestricted(!isRestricted);
      onRestricted?.(client.id, !isRestricted);
      setConfirming(false);
    } catch {
      setError("Network error — could not reach the server.");
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Client Profile</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blush text-lg font-semibold text-coral-dark">
            {client.fullName.charAt(0)}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-ink">{client.fullName}</p>
              {isRestricted && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Restricted</span>
              )}
            </div>
            <p className="text-sm text-ink/50">{client.email}</p>
          </div>
        </div>

        <div className="mt-6 space-y-3 rounded-xl border border-ink/10 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ink/40">Account Type</span>
            <span className="text-ink/70">Customer</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/40">Sign-in Method</span>
            <span className="text-ink/70">Google / Facebook</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/40">Status</span>
            <span className={isRestricted ? "font-semibold text-red-600" : "text-green-600 font-semibold"}>
              {isRestricted ? "Restricted" : "Active"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink/40">Joined</span>
            <span className="text-ink/70">
              {new Date(client.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <p className="mt-4 text-xs text-ink/40">
          Customers register and sign in themselves via Google or Facebook —
          their profile details can&apos;t be edited from here.
        </p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 border-t border-ink/10 pt-4">
          {confirming ? (
            <div className={`rounded-xl border p-3 text-center ${isRestricted ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              <p className={`text-sm ${isRestricted ? "text-green-700" : "text-red-700"}`}>
                {isRestricted
                  ? `Remove restrictions from ${client.fullName}'s account?`
                  : `Restrict ${client.fullName}'s account? They won't be able to book.`}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30"
                >
                  Cancel
                </button>
                <button
                  onClick={handleToggle}
                  disabled={loading}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${isRestricted ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                >
                  {loading ? "Saving…" : isRestricted ? "Unrestrict" : "Confirm Restrict"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className={`flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${
                isRestricted
                  ? "border-green-200 text-green-600 hover:bg-green-50"
                  : "border-red-200 text-red-600 hover:bg-red-50"
              }`}
            >
              {isRestricted ? (
                <><ShieldCheck className="h-4 w-4" /> Unrestrict Account</>
              ) : (
                <><ShieldOff className="h-4 w-4" /> Restrict Account</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
