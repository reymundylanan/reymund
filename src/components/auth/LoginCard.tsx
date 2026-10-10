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
    </div>
  );
}
