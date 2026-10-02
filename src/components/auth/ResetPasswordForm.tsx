"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MIN_LENGTH = 8;

/** Opened from the password-reset email (already signed in by the link). */
export default function ResetPasswordForm() {
  const [status, setStatus] = useState<"checking" | "ready" | "expired" | "done">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setStatus(data.user ? "ready" : "expired"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setSaving(true);
    setError(null);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(/different from the old/i.test(updateError.message) ? "Choose a password different from your old one." : updateError.message);
      return;
    }
    setStatus("done");
  }

  if (status === "checking") return <p className="py-10 text-center text-sm text-ink/50">Checking your reset link…</p>;

  if (status === "expired") {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold text-ink">This link has expired</h1>
        <p className="text-sm text-ink/60">Reset links work once and only for a short time. Open Login, tap “Forgot password?” and request a new one.</p>
        <Link href="/?login=1" className="inline-block rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark">
          Go to Login
        </Link>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[#2e7d32]" />
        <h1 className="text-xl font-semibold text-ink">Password updated</h1>
        <p className="text-sm text-ink/60">You&apos;re signed in. Use your new password next time you log in.</p>
        <Link href="/" className="inline-block rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark">
          Continue
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-champagne/50 text-coral-dark">
          <KeyRound className="h-6 w-6" />
        </span>
        <h1 className="mt-3 text-xl font-semibold text-ink">Set a new password</h1>
        <p className="mt-1 text-sm text-ink/60">At least {MIN_LENGTH} characters.</p>
      </div>
      {(["New password", "Confirm new password"] as const).map((label, i) => (
        <div key={label}>
          <label htmlFor={`reset-${i}`} className="text-sm font-medium text-ink">
            {label}
          </label>
          <div className="relative mt-1.5">
            <input
              id={`reset-${i}`}
              type={show ? "text" : "password"}
              required
              autoComplete="new-password"
              value={i === 0 ? password : confirm}
              onChange={(e) => (i === 0 ? setPassword(e.target.value) : setConfirm(e.target.value))}
              className="w-full rounded-lg border border-ink/15 px-4 py-2.5 pr-10 text-sm outline-none focus:border-coral"
            />
            {i === 0 && (
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-full bg-coral py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-coral-dark disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save New Password"}
      </button>
    </form>
  );
}
