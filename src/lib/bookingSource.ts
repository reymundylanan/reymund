// How a booking came in (085). Website bookings are made by the client;
// the Front Desk records the others when it books for someone.

export const BOOKING_SOURCES = [
  { value: "phone", label: "Phone call" },
  { value: "facebook", label: "Facebook / Messenger" },
  { value: "in_person", label: "In person" },
  { value: "other", label: "Other" },
] as const;

export type BookingSource = (typeof BOOKING_SOURCES)[number]["value"] | "website";

const LABEL: Record<string, string> = { website: "Website", ...Object.fromEntries(BOOKING_SOURCES.map((s) => [s.value, s.label])) };

export function bookingSourceLabel(source: string | null | undefined): string | null {
  return source ? (LABEL[source] ?? source) : null;
}
