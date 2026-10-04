// "Book Now" on a service: find the same service at the branch the client
// picks and pre-add it to Selected Services. Pure so it can be tested.

export type PreselectTarget = { name: string; category?: string | null };

export type PreselectCandidate = {
  id: string;
  name: string;
  category: string;
  department: string;
  duration: string;
  price: number;
  hairPrices: { short: number; medium: number; long: number } | null;
  price41: number | null;
};

export type PreselectEntry = { id: string; name: string; category: string; department: string; duration: string; price: number };

export type PreselectResult =
  | { kind: "added"; entry: PreselectEntry; category: string }
  /** Hair services are priced by length: the client picks one. */
  | { kind: "choose_length"; service: PreselectCandidate; category: string }
  | { kind: "missing" };

// Package-priced categories show "Per Session" and a bundle; we pre-add Per Session.
const PACKAGE_CATEGORIES = ["Slimming Services", "Premium Treatments", "Cocktail Drips", "Laser Services"];

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function preselectService(target: PreselectTarget, services: PreselectCandidate[]): PreselectResult {
  const name = norm(target.name);
  const category = norm(target.category);
  const match =
    services.find((s) => norm(s.name) === name && (!category || norm(s.category) === category)) ??
    services.find((s) => norm(s.name) === name);
  if (!match) return { kind: "missing" };

  if (match.hairPrices) return { kind: "choose_length", service: match, category: match.category };

  const base = { category: match.category, department: match.department, duration: match.duration };
  if (match.price41 && PACKAGE_CATEGORIES.includes(match.category)) {
    return {
      kind: "added",
      category: match.category,
      entry: { ...base, id: `${match.id}·per-session`, name: `${match.name} · Per Session`, price: match.price },
    };
  }
  return { kind: "added", category: match.category, entry: { ...base, id: match.id, name: match.name, price: match.price } };
}
