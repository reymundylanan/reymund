"use client";

import { signOutSafely } from "@/lib/auth/signOut";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, LogIn, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordLoginConsent } from "@/lib/auth/consent";

export default function StaffLoginForm({
  onSuccess,
  canProceed = () => true,
  offers = false,
  onForgot,
}: {
  onSuccess?: () => void;
  /** Optional check before logging in. */
  canProceed?: () => boolean;
  /** "Exclusive offers" opt-in from LoginModal. */
  offers?: boolean;
  /** Shows the "Forgot password?" link (in LoginModal). */
  onForgot?: () => void;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canProceed()) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data: email, error: lookupError } = await supabase.rpc(
      "get_email_for_username",
      { p_username: username }
    );

    if (lookupError || !email) {
      setError("Invalid username or password.");
      setLoading(false);
      return;
    }

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      setError("Invalid username or password.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile) {
      setError("No staff account found for this login.");
      await signOutSafely(supabase);
      setLoading(false);
      return;
    }

    await recordLoginConsent(supabase, offers);
    onSuccess?.();

    if (profile.role === "admin") {
      router.push("/admin");
    } else if (profile.role === "front_desk") {
      router.push("/frontdesk");
    } else {
      router.push("/");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="staff-username" className="text-sm font-medium text-ink/80">Username</label>
        <div className="relative mt-1.5">
          <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
          <input
            id="staff-username"
            type="text"
            required
            autoComplete="username"
            placeholder="Your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-xl border border-[#e8dcc0] bg-white py-3 pl-10 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-coral focus:ring-2 focus:ring-coral/15 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white] [&:-webkit-autofill]:[-webkit-text-fill-color:#2b1a10] pr-4"
          />
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="staff-password" className="text-sm font-medium text-ink/80">Password</label>
          {onForgot && (
            <button type="button" onClick={onForgot} className="text-xs font-semibold text-coral-dark hover:underline">
              Forgot password?
            </button>
          )}
        </div>
        <div className="relative mt-1.5">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
          <input
            id="staff-password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[#e8dcc0] bg-white py-3 pl-10 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-coral focus:ring-2 focus:ring-coral/15 [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_white] [&:-webkit-autofill]:[-webkit-text-fill-color:#2b1a10] pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-ink/40 hover:bg-cream hover:text-ink"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-coral py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(168,132,58,0.9)] transition hover:bg-coral-dark disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
        {loading ? "Signing in..." : "Log in"}
      </button>
    </form>
  );
}
