"use client";

import { useState } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Username / password accounts: email a password-reset link to the
 * address on the account. The answer is the same whether or not the
 * account exists, so it can't be used to discover usernames. */
export default function ForgotPasswordForm({ initial = "", onBack }: { initial?: string; onBack: () => void }) {
  const [value, setValue] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const entry = value.trim();
    if (!entry) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();

    let email: string | null = entry.includes("@") ? entry : null;
    if (!email) {
      const { data } = await supabase.rpc("get_email_for_username", { p_username: entry });
      email = typeof data === "string" && data ? data : null;
    }

    if (email) {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        // The link signs them in through the callback, then opens the new-password page.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`,
      });
      if (resetError && (resetError.status === 429 || /rate limit/i.test(resetError.message))) {
        setError("Too many reset requests. Please wait a few minutes and try again.");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-champagne/50 text-coral-dark">
          <MailCheck className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-semibold text-ink">Check your email</h2>
        <p className="text-sm text-ink/60">
          If an account matches <span className="font-medium text-ink">{value.trim()}</span>, we&apos;ve sent a link to reset its password.
          The link works once and expires after a short time.
        </p>
        <p className="text-xs text-ink/45">Don&apos;t see it? Check your spam folder, or ask the front desk for help.</p>
        <button type="button" onClick={onBack} className="w-full rounded-full border border-champagne py-2.5 text-sm font-semibold text-ink/70 hover:border-coral">
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-ink/55 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to Login
      </button>
      <div>
        <h2 className="text-lg font-semibold text-ink">Forgot your password?</h2>
        <p className="mt-1 text-sm text-ink/60">Enter your username or email and we&apos;ll email you a link to set a new password.</p>
      </div>
      <div>
        <label htmlFor="forgot-entry" className="text-sm font-medium text-ink">
          Username or email
        </label>
        <input
          id="forgot-entry"
          type="text"
          required
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm outline-none focus:border-coral"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="w-full rounded-full bg-coral py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-coral-dark disabled:opacity-50"
      >
        {loading ? "Sending…" : "Send Reset Link"}
      </button>
      <p className="text-center text-xs text-ink/45">Signed up with Google or Facebook? No password needed — just use those buttons.</p>
    </form>
  );
}
