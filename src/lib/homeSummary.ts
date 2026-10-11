/**
 * Facts for the home page, worked out from the live service list: how many
 * treatments each department offers, its categories and the lowest price.
 * A service listed at several branches (or once per variant) counts once.
 */
export type ServiceRow = { name: string; category: string | null; department: string | null; price: number | null };

export type DepartmentSummary = {
  department: string;
  treatments: number;
  /** Lowest listed price; null when every price depends on options (e.g. hair length). */
  fromPrice: number | null;
  categories: { name: string; count: number }[];
  /** A few treatment names (as written), for departments with one category. */
  examples: string[];
};

export function summarizeServices(rows: ServiceRow[]): DepartmentSummary[] {
  const depts = new Map<string, { names: Set<string>; labels: Map<string, string>; fromPrice: number | null; categories: Map<string, Set<string>> }>();
  for (const r of rows) {
    const dept = r.department?.trim();
    const name = r.name?.trim().toLowerCase();
    if (!dept || !name) continue;
    const d = depts.get(dept) ?? { names: new Set(), labels: new Map(), fromPrice: null, categories: new Map() };
    d.names.add(name);
    if (!d.labels.has(name)) d.labels.set(name, r.name.trim());
    const price = Number(r.price);
    if (Number.isFinite(price) && price > 0) d.fromPrice = d.fromPrice == null ? price : Math.min(d.fromPrice, price);
    const cat = r.category?.trim();
    if (cat) d.categories.set(cat, (d.categories.get(cat) ?? new Set()).add(name));
    depts.set(dept, d);
  }
  return [...depts.entries()].map(([department, d]) => ({
    department,
    treatments: d.names.size,
    fromPrice: d.fromPrice,
    categories: [...d.categories.entries()]
      .map(([name, names]) => ({ name, count: names.size }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    examples: [...d.labels.values()].sort((a, b) => a.localeCompare(b)).slice(0, 6),
  }));
}

/** "8:00 AM - 7:00 PM" → "8 AM – 7 PM" for compact cards. */
export function shortHours(hours: string | null): string | null {
  if (!hours) return null;
  return hours.replace(/:00\s*/g, " ").replace(/\s*[-–]\s*/, " – ").replace(/\s+/g, " ").trim();
}
