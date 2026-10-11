/**
 * Bookings save a one-line summary in `notes`:
 *   "Bikini, AirLashes with Ms. Mary — ₱2,500.00"
 *   "Hair Rebond (Short) with Sir John — ₱2,500.00 · Walk-in transfer from One Cecilia Center"
 * Split it into its parts so lists can show the services, staff and price in
 * their own columns instead of repeating everything in one long line.
 */
export type BookingNoteParts = { services: string | null; staff: string | null; price: number | null };

export function parseBookingNotes(notes: string | null | undefined): BookingNoteParts {
  const text = (notes ?? "").trim();
  if (!text) return { services: null, staff: null, price: null };
  const priceMatch = text.match(/₱\s?([\d,]+(?:\.\d+)?)/);
  const price = priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : null;
  const head = text.split(/\s+—\s+/)[0];
  const withAt = head.lastIndexOf(" with ");
  return {
    services: (withAt > 0 ? head.slice(0, withAt) : head).trim() || null,
    staff: withAt > 0 ? head.slice(withAt + 6).trim() || null : null,
    price: price != null && Number.isFinite(price) ? price : null,
  };
}
