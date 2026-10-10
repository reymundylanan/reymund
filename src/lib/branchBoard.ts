/** Helpers for the admin Branch Board (kanban of branches). */

/** Column key for people without a branch. */
export const NO_BRANCH = "none";

export type BoardItem = { id: string; branchId: string | null };

/** Groups items into columns by branch (people without a branch go to NO_BRANCH). */
export function groupByColumn<T extends BoardItem>(items: T[], branchIds: string[]): Record<string, T[]> {
  const known = new Set(branchIds);
  const out: Record<string, T[]> = { [NO_BRANCH]: [] };
  for (const id of branchIds) out[id] = [];
  for (const item of items) {
    const key = item.branchId && known.has(item.branchId) ? item.branchId : NO_BRANCH;
    out[key].push(item);
  }
  return out;
}

/** "3 Massage · 2 Nails" — departments in a column, biggest first. */
export function departmentSummary(departments: (string | null | undefined)[], max = 3): string {
  const counts = new Map<string, number>();
  for (const d of departments) {
    const name = d?.trim() || "Other";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = sorted.slice(0, max).map(([name, n]) => `${n} ${name}`);
  if (sorted.length > max) shown.push(`+${sorted.length - max} more`);
  return shown.join(" · ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Date keys (YYYY-MM-DD) → "Oct 12–14, 20 · Nov 2": consecutive days collapse into ranges. */
export function formatDateRuns(dateKeys: string[]): string {
  const days = [...new Set(dateKeys)].sort().map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return { y, m, d, t: Date.UTC(y, m - 1, d) };
  });
  const runs: { from: (typeof days)[number]; to: (typeof days)[number] }[] = [];
  for (const day of days) {
    const last = runs[runs.length - 1];
    if (last && day.t - last.to.t === 86_400_000) last.to = day;
    else runs.push({ from: day, to: day });
  }
  const parts: string[] = [];
  let month = -1;
  for (const { from, to } of runs) {
    const sameMonth = from.m === to.m;
    const range = from.t === to.t ? `${from.d}` : sameMonth ? `${from.d}–${to.d}` : `${from.d}–${MONTHS[to.m - 1]} ${to.d}`;
    if (from.m === month) parts[parts.length - 1] += `, ${range}`;
    else parts.push(`${MONTHS[from.m - 1]} ${range}`);
    month = to.m;
  }
  return parts.join(" · ");
}
