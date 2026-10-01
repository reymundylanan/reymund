// Admin Dashboard helpers (pure): Manila day keys, % change, donut segments.

/** YYYY-MM-DD in Asia/Manila for a Date. */
export function manilaKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The last `days` Manila day keys ending today, oldest first. */
export function lastDays(todayKey: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDaysKey(todayKey, i - (days - 1)));
}

export function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "+12% vs. yesterday" style change; null when there's no base to compare. */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type DonutSegment = { label: string; value: number; color: string; dash: number; offset: number; pct: number };

/** SVG stroke-dasharray segments for a donut of circumference `c`. */
export function donutSegments(parts: { label: string; value: number; color: string }[], c: number): DonutSegment[] {
  const total = parts.reduce((s, p) => s + p.value, 0);
  let offset = 0;
  return parts.map((p) => {
    const dash = total ? (p.value / total) * c : 0;
    const seg = { ...p, dash, offset, pct: total ? Math.round((p.value / total) * 100) : 0 };
    offset += dash;
    return seg;
  });
}

export function pesoShort(n: number): string {
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

/** Nice round top value for a bar chart axis. */
export function niceMax(n: number): number {
  if (n <= 0) return 1000;
  const mag = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= n) ?? 10;
  return step * mag;
}
