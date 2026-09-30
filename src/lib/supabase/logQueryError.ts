// Logs a Supabase query error readably. PostgrestError objects print as
// "{}" in the browser/Next overlay, so log the message and code instead.
// A table/view/column that doesn't exist yet (a migration not applied) is
// expected during rollout: warn once per label instead of raising an error.

const NOT_MIGRATED_CODES = new Set(["PGRST205", "42P01", "42703", "PGRST204"]);
const warned = new Set<string>();

type QueryError = { message?: string; code?: string; details?: string | null; hint?: string | null };

export function isNotMigratedError(error: QueryError | null | undefined): boolean {
  return !!error?.code && NOT_MIGRATED_CODES.has(error.code);
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
  console.error(`${label} failed: ${error.message ?? "unknown error"}${error.code ? ` [${error.code}]` : ""}`);
}
