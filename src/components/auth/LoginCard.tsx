"use client";

import { useState } from "react";
import Link from "next/link";
import { FacebookCircleIcon, GoogleIcon } from "@/components/icons/SocialIcons";
import { createClient } from "@/lib/supabase/client";

export default function LoginCard() {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "facebook" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: "google" | "facebook") {
    setError(null);
    setLoadingProvider(provider);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
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
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => handleOAuth("google")}
        disabled={loadingProvider !== null}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-ink/15 py-3 text-sm font-medium text-ink hover:bg-blush disabled:opacity-50"
      >
        <GoogleIcon className="h-5 w-5" />
        {loadingProvider === "google" ? "Redirecting..." : "Continue with Google"}
      </button>

      <button
        type="button"
        onClick={() => handleOAuth("facebook")}
        disabled={loadingProvider !== null}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-ink/15 py-3 text-sm font-medium text-ink hover:bg-blush disabled:opacity-50"
      >
        <FacebookCircleIcon className="h-5 w-5" />
        {loadingProvider === "facebook" ? "Redirecting..." : "Continue with Facebook"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2 pt-2 text-xs text-ink/60">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 rounded border-ink/20" />
          I agree to the{" "}
          <Link href="/terms" className="text-coral-dark">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-coral-dark">
            Privacy Policy
          </Link>
          .
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 rounded border-ink/20" />
          I&apos;d like to receive exclusive offers and beauty trends from
          GlowSync.
        </label>
      </div>
    </div>
  );
}
