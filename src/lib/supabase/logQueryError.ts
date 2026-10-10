// Logs a Supabase query error readably. PostgrestError objects print as
// "{}" in the browser/Next overlay, so log the message and code instead.
// A table/view/column that doesn't exist yet (a migration not applied) is
// expected during rollout: warn once per label instead of raising an error.
// Likewise a dropped connection to Supabase ("fetch failed", timeouts) isn't a
// query bug: warn once per outage instead of an error for every query.

const NOT_MIGRATED_CODES = new Set(["PGRST205", "PGRST200", "42P01", "42703", "PGRST204", "PGRST202"]);
const warned = new Set<string>();
let lastNetworkWarn = 0;

type QueryError = { message?: string; code?: string; details?: string | null; hint?: string | null };

export function isNotMigratedError(error: QueryError | null | undefined): boolean {
  return !!error?.code && NOT_MIGRATED_CODES.has(error.code);
}

/** The request never reached Supabase (offline, DNS, connect timeout). */
export function isNetworkError(error: QueryError | null | undefined): boolean {
  return /fetch failed|failed to fetch|networkerror|network request failed|timeout|ECONN|ENOTFOUND|EAI_AGAIN/i.test(
    `${error?.message ?? ""} ${error?.details ?? ""}`
  );
}

export function logQueryError(label: string, error: QueryError | null | undefined) {
  if (!error) return;
  if (isNotMigratedError(error)) {
    if (!warned.has(label)) {
      warned.add(label);
      console.warn(`${label}: database not set up yet (apply the pending migration). ${error.message ?? ""}`);
    }
    return;
  }
  if (isNetworkError(error)) {
    if (Date.now() - lastNetworkWarn > 60_000) {
      lastNetworkWarn = Date.now();
      console.warn(`Couldn't reach the database (${label}): ${error.message ?? "network error"} — check the internet connection.`);
    }
    return;
  }
  console.error(`${label} failed: ${error.message ?? "unknown error"}${error.code ? ` [${error.code}]` : ""}`);
}
