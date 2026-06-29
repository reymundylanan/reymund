"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import type { ClientUser } from "@/components/admin/users/types";

export default function ClientViewPanel({
  client,
  onClose,
  onDeleted,
}: {
  client: ClientUser;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: client.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to delete account.");
        setDeleting(false);
        return;
      }
      onDeleted?.();
      onClose();
    } catch {
      setError("Network error — could not reach the server.");
      setDeleting(false);
    }
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
            <p className="font-semibold text-ink">{client.fullName}</p>
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
          {confirmingDelete ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
              <p className="text-sm text-red-700">
                Delete {client.fullName}&apos;s account? This can&apos;t be
                undone.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center justify-center gap-2 rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Delete Account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
