// Which branch an Admin is viewing on the Front Desk screens (Admins have
// no branch of their own). Kept in a cookie so the server-rendered
// dashboard and the client pages agree; changes are broadcast in-page.

export const ADMIN_BRANCH_COOKIE = "gs_admin_branch";
export const ADMIN_BRANCH_EVENT = "gs-admin-branch";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readAdminBranchCookie(cookieHeader: string): string | null {
  const match = cookieHeader.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${ADMIN_BRANCH_COOKIE}=`));
  const value = match ? decodeURIComponent(match.slice(ADMIN_BRANCH_COOKIE.length + 1)) : "";
  return UUID_RE.test(value) ? value : null;
}

export function setAdminBranch(branchId: string) {
  if (!UUID_RE.test(branchId)) return;
  document.cookie = `${ADMIN_BRANCH_COOKIE}=${encodeURIComponent(branchId)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  window.dispatchEvent(new CustomEvent(ADMIN_BRANCH_EVENT, { detail: branchId }));
}

/** The branch to show: a valid choice, else the profile's own, else the first. */
export function pickBranch(branchIds: string[], chosen: string | null, own: string | null): string | null {
  if (chosen && branchIds.includes(chosen)) return chosen;
  if (own && branchIds.includes(own)) return own;
  return branchIds[0] ?? null;
}
