/**
 * fetch for the Supabase clients that tries a read again when the connection
 * drops ("fetch failed": DNS hiccup, connect timeout, reset). Only GET/HEAD
 * are retried, so a save is never sent twice; real HTTP errors (4xx/5xx) are
 * returned as they are.
 */
export function retryingFetch(baseFetch: typeof fetch = fetch, { retries = 2, delayMs = 300 } = {}): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const canRetry = method === "GET" || method === "HEAD";
    for (let attempt = 0; ; attempt++) {
      try {
        return await baseFetch(input, init);
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        if (!canRetry || aborted || attempt >= retries) throw e;
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  };
}
