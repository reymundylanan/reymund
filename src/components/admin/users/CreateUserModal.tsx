"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import PasswordStrengthMeter, { PasswordMatchHint } from "@/components/auth/PasswordStrengthMeter";
import { meetsPasswordPolicy, passwordPolicyError } from "@/lib/passwordStrength";
import { createClient } from "@/lib/supabase/client";

type Branch = { id: string; name: string };

export default function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"admin" | "front_desk">("front_desk");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("branches")
      .select("id, name")
      .order("name")
      .then(({ data }) => setBranches(data ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const policy = passwordPolicyError(password);
    if (policy) return setError(policy);
    if (password !== confirmPassword) return setError("The two passwords don't match.");
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          username,
          email,
          password,
          role,
          branchId: branchId || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create user.");
      } else {
        setResult({ email: data.email });
        onCreated?.();
      }
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="scrollbar-hidden max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Add New User</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-xl bg-green-50 p-4 text-sm text-green-700">
              Account created. They can log in with the username and password
              you set.
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="text-xs font-medium uppercase text-ink/40">
                Full Name
              </label>
              <input
                required
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
                required
                pattern="[a-z0-9_.]+"
                title="Lowercase letters, numbers, dots, and underscores only."
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
              />
              <p className="mt-1 text-xs text-ink/40">
                This is what they&apos;ll log in with.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase text-ink/40">
                Contact Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
              />
            </div>
            <div>
              <label htmlFor="new-user-password" className="text-xs font-medium uppercase text-ink/40">
                Password
              </label>
              <div className="relative mt-1">
                <input
                  id="new-user-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-ink/15 px-3 py-2 pr-10 text-sm outline-none focus:border-coral"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrengthMeter password={password} />
            </div>
            <div>
              <label htmlFor="new-user-confirm" className="text-xs font-medium uppercase text-ink/40">
                Confirm Password
              </label>
              <div className="relative mt-1">
                <input
                  id="new-user-confirm"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-ink/15 px-3 py-2 pr-10 text-sm outline-none focus:border-coral"
                />
              </div>
              <PasswordMatchHint password={password} confirm={confirmPassword} />
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
                Branch
              </label>
              <select
                required
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
              >
                <option value="" disabled>
                  Select a branch
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !meetsPasswordPolicy(password) || password !== confirmPassword}
                className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
              >
                {submitting ? "Creating..." : "Create Account"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
