// Decides which promo the side ad shows to a client. Pure so it can be
// unit-tested; the component feeds it active promos plus the client's
// booking history and the promos they closed this session.

export type PromoCandidate = {
  id: string;
  branchId: string;
  title: string;
  department: string | null;
  category: string | null;
  validUntil: string | null;
};

export type ClientHistory = {
  branchIds: string[];
  departments: string[];
  bookedCategories: string[];
};

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Best promo first. Dismissed promos are dropped; promos for a category
 * the client already booked go last (shown only if nothing else is left);
 * otherwise visited branch, then a department they've used, then the
 * soonest end date, then title. */
export function rankPromos<T extends PromoCandidate>(promos: T[], history: ClientHistory, dismissed: Set<string>): T[] {
  const branches = new Set(history.branchIds);
  const departments = new Set(history.departments.map(norm));
  const booked = new Set(history.bookedCategories.map(norm));

  const score = (p: T) => ({
    alreadyBooked: p.category !== null && booked.has(norm(p.category)) ? 1 : 0,
    visited: branches.has(p.branchId) ? 0 : 1,
    department: p.department !== null && departments.has(norm(p.department)) ? 0 : 1,
  });

  return promos
    .filter((p) => !dismissed.has(p.id))
    .sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      if (sa.alreadyBooked !== sb.alreadyBooked) return sa.alreadyBooked - sb.alreadyBooked;
      if (sa.visited !== sb.visited) return sa.visited - sb.visited;
      if (sa.department !== sb.department) return sa.department - sb.department;
      if (a.validUntil !== b.validUntil) {
        if (!a.validUntil) return 1;
        if (!b.validUntil) return -1;
        return a.validUntil.localeCompare(b.validUntil);
      }
      return a.title.localeCompare(b.title);
    });
}

const DISMISSED_KEY = "glowsync.dismissedPromos";

/** Promo ids the client closed in this browser session. Storage can be
 * unavailable (private mode, blocked site data) — then nothing is remembered. */
export function readDismissedPromos(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function rememberDismissedPromo(id: string) {
  try {
    const ids = readDismissedPromos();
    ids.add(id);
    window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable — the ad stays closed for this page only.
  }
}
