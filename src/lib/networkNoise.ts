/**
 * When the internet drops for a moment, Supabase's login library (auth-js)
 * logs the raw browser error ("TypeError: Failed to fetch") with console.error
 * while it refreshes the session — and retries on its own. In development
 * Next.js turns every console.error into a red overlay, so a blip looks like a
 * crash. This turns those connection drops into one short warning a minute;
 * every other error is logged exactly as before.
 */

const NETWORK_MESSAGES = /^(failed to fetch|fetch failed|load failed|networkerror when attempting to fetch resource\.?|network request failed)$/i;

/** True for "couldn't reach the server" errors (not for real errors). */
export function isNetworkDrop(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const err = value as { name?: unknown; message?: unknown };
  const message = typeof err.message === "string" ? err.message.trim() : "";
  const name = typeof err.name === "string" ? err.name : "";
  if (!NETWORK_MESSAGES.test(message)) return false;
  return name === "TypeError" || name === "AuthRetryableFetchError" || name === "FetchError";
}

let installed = false;

/** Installs the filter once in the browser. */
export function quietNetworkDrops(windowMs = 60_000) {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = console.error.bind(console);
  let lastWarned = 0;
  console.error = (...args: unknown[]) => {
    // Only a lone network error (as auth-js logs it); anything else passes through.
    if (args.length === 1 && isNetworkDrop(args[0])) {
      if (Date.now() - lastWarned > windowMs) {
        lastWarned = Date.now();
        console.warn("GlowSync couldn't reach the server for a moment (check the internet connection). It retries on its own.");
      }
      return;
    }
    original(...args);
  };
}
