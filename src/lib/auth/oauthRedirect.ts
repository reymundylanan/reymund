import { safeNext } from "@/lib/safeNext";

/** Where to land after a Google / Facebook login. A link that carries an
 * intent (finish a booking, open a notification) goes back there; otherwise
 * clients go to their dashboard and staff to their portal. */
export function postLoginPath(role: string | null | undefined, next: string | null | undefined): string {
  const target = safeNext(next);
  if (/[?&](intent|login)=/.test(target)) return target;
  if (role === "admin") return "/admin";
  if (role === "front_desk") return "/frontdesk";
  if (!role || role === "customer") return "/my-glow";
  return "/";
}

export type AuthError = "cancelled" | "failed";

/** Back to the page the login started from (keeping any booking intent),
 * with a reason the login window shows. */
export function authErrorPath(next: string | null | undefined, providerError: string | null | undefined): string {
  const reason: AuthError = providerError === "access_denied" ? "cancelled" : "failed";
  const url = new URL(safeNext(next), "http://x");
  url.searchParams.set("auth_error", reason);
  return `${url.pathname}${url.search}`;
}

export const AUTH_ERROR_TEXT: Record<AuthError, string> = {
  cancelled: "Sign-in was cancelled — you're still logged out. Choose an account to continue, or log in another way.",
  failed: "We couldn't sign you in with that account. Please try again.",
};
