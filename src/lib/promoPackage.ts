// Promo packages (067): pure helpers for a promo and the existing services
// it includes — regular price, total duration, length prices and the
// promo's booking window. Pure so they can be unit-tested.

export type PackageService = {
  id: string;
  name: string;
  category: string;
  department: string;
  duration: string | null;
  price: number;
};

export type PromoPackage = {
  id: string;
  title: string;
  description: string | null;
  badge: string | null;
  branchId: string;
  branchName: string;
  department: string | null;
  category: string | null;
  price: number | null;
  priceMedium: number | null;
  priceLong: number | null;
  validFrom: string | null;
  validUntil: string | null;
  services: PackageService[];
};

export type PromoLength = "short" | "medium" | "long";

/** "90 mins", "1 hour", "2 hours" → minutes (60 when unknown), as the booking form reads them. */
export function durationMinutes(label: string | null | undefined): number {
  if (!label) return 60;
  const mins = label.match(/(\d+)\s*mins?/);
  const hours = label.match(/(\d+(?:\.\d+)?)\s*h(?:ou)?rs?/);
  if (mins && hours) return Math.round(Number(hours[1]) * 60) + Number(mins[1]);
  if (mins) return Number(mins[1]);
  if (hours) return Math.round(Number(hours[1]) * 60);
  return 60;
}

/** The whole package's time: every included service back to back (60 min if none listed). */
export function packageMinutes(p: Pick<PromoPackage, "services">): number {
  return p.services.length ? p.services.reduce((sum, s) => sum + durationMinutes(s.duration), 0) : 60;
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} minutes`;
  return `${h} hour${h !== 1 ? "s" : ""}${m ? ` ${m} minutes` : ""}`;
}

/** The included services at their normal prices (null when nothing is listed). */
export function regularPrice(p: Pick<PromoPackage, "services">): number | null {
  const total = p.services.reduce((sum, s) => sum + (s.price > 0 ? s.price : 0), 0);
  return total > 0 ? total : null;
}

/** Hair promos are priced by length; others have a single price. */
export function promoLengths(p: Pick<PromoPackage, "price" | "priceMedium" | "priceLong">): { length: PromoLength; price: number }[] {
  const out: { length: PromoLength; price: number }[] = [];
  if (p.priceMedium || p.priceLong) {
    if (p.price) out.push({ length: "short", price: p.price });
    if (p.priceMedium) out.push({ length: "medium", price: p.priceMedium });
    if (p.priceLong) out.push({ length: "long", price: p.priceLong });
  }
  return out;
}

export function promoPriceFor(p: Pick<PromoPackage, "price" | "priceMedium" | "priceLong">, length: PromoLength | null): number | null {
  if (length === "medium") return p.priceMedium;
  if (length === "long") return p.priceLong;
  return p.price;
}

/** Bookable on this date (YYYY-MM-DD): inside the promo's start / end dates. */
export function promoOpenOn(p: Pick<PromoPackage, "validFrom" | "validUntil">, dateKey: string): boolean {
  if (p.validFrom && dateKey < p.validFrom) return false;
  if (p.validUntil && dateKey > p.validUntil) return false;
  return true;
}

/** Departments the package needs. One professional can do it all only
 * when every service is in a single department. */
export function packageDepartments(p: Pick<PromoPackage, "services" | "department">): string[] {
  const depts = new Set(p.services.map((s) => s.department).filter(Boolean));
  if (depts.size === 0 && p.department) depts.add(p.department);
  return [...depts];
}

/** Booking notes, read across the app as "<what> with <who> — ₱<total>.00".
 * The promo title must not break that shape. */
export function promoNotes(title: string, professional: string, total: number): string {
  const safe = title.replace(/\s+with\s+/gi, " w/ ").replace(/₱/g, "P").trim();
  return `🎁 ${safe} with ${professional} — ₱${total.toLocaleString()}.00`;
}
