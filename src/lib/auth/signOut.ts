import type { SupabaseClient } from "@supabase/supabase-js";

/** Clears the Supabase session stored on this device (cookies set by
 * @supabase/ssr, plus any localStorage copy). */
function clearLocalSession() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name?.startsWith("sb-")) {
      document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
    }
  }
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("sb-")) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable (private mode); cookies are what matter.
  }
}

/** Logs out even when Supabase can't be reached ("Failed to fetch"): the
 * session on this device is cleared either way, so the user is never
 * stuck logged in. Returns after the local session is gone. */
export async function signOutSafely(supabase: SupabaseClient): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn("Sign-out request failed; clearing this device's session:", error.message);
      clearLocalSession();
    }
  } catch (e) {
    console.warn("Sign-out request failed; clearing this device's session:", e);
    clearLocalSession();
  }
}
