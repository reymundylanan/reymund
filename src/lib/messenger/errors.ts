export type SendOutcome = { kind: "sent" } | { kind: "retry" | "fail" | "fail_opt_out"; error: string };

type GraphError = { message?: string; code?: number; error_subcode?: number };

// Graph Send API error codes. Confirm against current Meta docs if
// Meta changes them; this is the only place they live.
const RETRY_CODES = new Set([1200, 4, 17, 32, 613]);

export function classifyGraphResponse(status: number, body: unknown): SendOutcome {
  if (status >= 200 && status < 300) return { kind: "sent" };

  const err: GraphError = (body as { error?: GraphError } | null)?.error ?? {};
  const error = err.message ?? `HTTP ${status}`;
  const { code, error_subcode: sub } = err;

  if (code === 551 || (code === 200 && sub === 1545041) || (code === 100 && sub === 2018001)) {
    return { kind: "fail_opt_out", error };
  }
  if (status >= 500 || status === 429 || (code !== undefined && RETRY_CODES.has(code))) {
    return { kind: "retry", error };
  }
  return { kind: "fail", error };
}

export const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60];

// `attempts` already includes the attempt that just failed.
export function retryDelayMinutes(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1];
}
