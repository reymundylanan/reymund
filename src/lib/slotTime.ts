// Booking time slots are labels like "9:30 AM" on a calendar day built in
// the browser's local time. These helpers decide whether a slot has
// already started, so the booking form can disable it.

/** Local Date for `time` ("h:mm AM/PM") on `date`'s calendar day. */
export function slotStart(date: Date, time: string): Date {
  const [clock, meridiem] = time.trim().split(" ");
  const [h, m] = clock.split(":").map(Number);
  let hour24 = h % 12;
  if (meridiem?.toUpperCase() === "PM") hour24 += 12;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour24, m, 0, 0);
}

/** True when the slot starts at or before `now` — i.e. it can no longer be
 * booked. Future days are never affected by today's clock. */
export function isSlotPast(date: Date, time: string, now: Date): boolean {
  return slotStart(date, time).getTime() <= now.getTime();
}
