"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { StaffUser } from "@/components/admin/users/types";

const permissions = [
  "Approve Special Requests",
  "View Appointments",
  "Modify Staff Schedule",
  "Payments & Refunds",
  "User & Staff Access",
];

const roleLabels: Record<StaffUser["role"], string> = {
  admin: "Admin",
  front_desk: "Front Desk",
  specialist: "Specialist",
};

type Branch = { id: string; name: string };

export default function UserEditPanel({
  user,
  onClose,
  onDeleted,
  onUpdated,
}: {
  user: StaffUser;
  onClose: () => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
}) {
  const [granted, setGranted] = useState<Record<string, boolean>>({
    "View Appointments": true,
    "Payments & Refunds": true,
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(user.fullName);
  const [username, setUsername] = useState(user.username ?? "");
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<"admin" | "front_desk">(
    user.role === "admin" ? "admin" : "front_desk"
  );
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("branches")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        setBranches(data ?? []);
        const match = data?.find((b) => b.name === user.branchName);
        if (match) setBranchId(match.id);
      });
  }, [user.branchName]);

  const [resettingPassword, setResettingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function handleUpdateProfile() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          fullName,
          username,
          email,
          role,
          branchId: branchId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update profile.");
        setSaving(false);
        return;
      }
      setSaved(true);
      setSaving(false);
      onUpdated?.();
    } catch {
      setError("Network error — could not reach the server.");
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    setSavingPassword(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          newPassword,
          currentPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to reset password.");
        setSavingPassword(false);
        return;
      }
      setPasswordSaved(true);
      setSavingPassword(false);
    } catch {
      setError("Network error — could not reach the server.");
      setSavingPassword(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
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
      <div className="scrollbar-hidden max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">User Profile</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blush text-lg font-semibold text-coral-dark">
            {user.fullName.charAt(0)}
          </span>
          <div>
            <p className="font-semibold text-ink">{user.fullName}</p>
            <p className="text-sm text-ink/50">@{user.username ?? "—"}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Full Name
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            >
              <option value="front_desk">Front Desk</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Contact Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-ink/40">
              Primary Branch
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            >
              <option value="">No branch assigned</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>


        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {saved && (
          <p className="mt-4 text-sm text-green-700">Profile updated.</p>
        )}

        <div className="mt-6 flex flex-col gap-2 border-t border-ink/10 pt-4">
          <button
            onClick={handleUpdateProfile}
            disabled={saving || !fullName || !username || !email}
            className="flex items-center justify-center gap-2 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
          >
            <ShieldCheck className="h-4 w-4" />
            {saving ? "Saving..." : "Update Profile Details"}
          </button>
          {resettingPassword ? (
            passwordSaved ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
                <p className="text-sm text-green-700">Password updated.</p>
                <button
                  onClick={() => {
                    setResettingPassword(false);
                    setPasswordSaved(false);
                    setNewPassword("");
                    setCurrentPassword("");
                  }}
                  className="mt-3 w-full rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-ink/10 p-3">
                <div className="mb-3">
                  <label className="text-xs font-medium uppercase text-ink/40">
                    Your Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                  />
                  <p className="mt-1 text-xs text-ink/40">
                    Confirm it&apos;s you before changing{" "}
                    {user.fullName.split(" ")[0]}&apos;s password.
                  </p>
                </div>
                <label className="text-xs font-medium uppercase text-ink/40">
                  New Password
                </label>
                <input
                  type="password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                />
                <p className="mt-1 text-xs text-ink/40">Minimum 8 characters.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setResettingPassword(false);
                      setNewPassword("");
                      setCurrentPassword("");
                    }}
                    className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetPassword}
                    disabled={
                      savingPassword || newPassword.length < 8 || !currentPassword
                    }
                    className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                  >
                    {savingPassword ? "Saving..." : "Save Password"}
                  </button>
                </div>
              </div>
            )
          ) : (
            <button
              onClick={() => setResettingPassword(true)}
              className="flex items-center justify-center gap-2 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
            >
              <KeyRound className="h-4 w-4" /> Reset Password
            </button>
          )}

          {confirmingDelete ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
              <p className="text-sm text-red-700">
                Delete {user.fullName}&apos;s account? This can&apos;t be
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
