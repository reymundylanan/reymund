"use client";

import { useState } from "react";
import { FacebookCircleIcon, GoogleIcon } from "@/components/icons/SocialIcons";
import { createClient } from "@/lib/supabase/client";

/** Google / Facebook login. `canProceed` can gate it on a check first
 * (optional). */
export default function LoginCard({
  canProceed = () => true,
  offers = false,
}: {
  canProceed?: () => boolean;
  offers?: boolean;
}) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "facebook" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: "google" | "facebook") {
    if (!canProceed()) return;
    setError(null);
    setLoadingProvider(provider);

    const supabase = createClient();
    const nextUrl = `${window.location.pathname}${window.location.search}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // The callback saves Terms acceptance and the offers choice (066).
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}&consent=1${offers ? "&offers=1" : ""}`,
        // Always show Google's account chooser (with "Use another account"),
        // so the account open in Chrome is never used without asking.
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });

    if (error) {
      setError(error.message);
      setLoadingProvider(null);
    }
    // On success, the browser is redirected away to the provider — no further
    // client-side state update needed here.
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => handleOAuth("google")}
        disabled={loadingProvider !== null}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-[#e8dcc0] bg-white py-3 text-sm font-semibold text-ink shadow-[0_6px_18px_-14px_rgba(90,60,20,0.6)] transition hover:-translate-y-0.5 hover:border-coral/60 hover:bg-[#fffaf0] disabled:translate-y-0 disabled:opacity-50"
      >
        <GoogleIcon className="h-5 w-5" />
        {loadingProvider === "google" ? "Redirecting..." : "Continue with Google"}
      </button>
      <p className="-mt-2 px-2 text-center text-[11px] leading-snug text-ink/50">
        You&apos;ll pick which Google account to use. Not yours? Choose <b className="font-semibold">Use another account</b> — no need to sign out of Chrome.
      </p>

      <button
        type="button"
        onClick={() => handleOAuth("facebook")}
        disabled={loadingProvider !== null}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-[#e8dcc0] bg-white py-3 text-sm font-semibold text-ink shadow-[0_6px_18px_-14px_rgba(90,60,20,0.6)] transition hover:-translate-y-0.5 hover:border-coral/60 hover:bg-[#fffaf0] disabled:translate-y-0 disabled:opacity-50"
      >
        <FacebookCircleIcon className="h-5 w-5" />
        {loadingProvider === "facebook" ? "Redirecting..." : "Continue with Facebook"}
      </button>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
    </div>
  );
}
