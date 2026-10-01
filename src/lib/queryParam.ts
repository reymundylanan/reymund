/** Reads a URL query parameter in the browser (null on the server). Used
 * after mount for dashboard deep links like /frontdesk/walk-ins?id=…,
 * so pages don't need a Suspense boundary for useSearchParams. */
export function readQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
