# Staff Shift Availability — Design Spec

Date: 2026-09-24
Status: Approved (in-chat design confirmed by user 2026-09-24)

## Purpose

Let front desk staff mark a branch staff member as off (full day, morning,
or afternoon) for a specific date, and have the public booking flow
actually respect that — a customer can no longer book a specific
professional during a period that staff member is marked off.

## Current state (why this doesn't work today)

- `staff_shifts` exists in the schema (`shift_date`, `professional_id`,
  `branch_id`, `start_time`, `end_time`, `status`) but is **never read or
  written anywhere in the app**, and its `professional_id` column
  references the `professionals` table — a legacy table the live app
  never populates (confirmed during earlier work this session: real staff
  live in `staff_members`, a completely different table). The table has
  zero rows today, so fixing its foreign key is a safe, non-destructive
  change.
- `src/components/frontdesk/staff/StaffShiftGrid.tsx` currently renders a
  **hardcoded** "On Shift" bar (9am–6pm) for every staff member, for every
  day, regardless of reality.
- `BookingModal.tsx`'s date/time picker (`step === "time"`,
  `src/components/booking/BookingModal.tsx:892-985`) has no concept of
  staff availability at all — every date and time slot is selectable for
  every professional.

## Data model

Reuse `staff_shifts`, fixed and repurposed to record **exceptions only**:
a row means "this staff member is off, on this date, for this period." No
row for a given staff member + date = on duty (the default), so front desk
never has to pre-populate anyone's normal schedule — only the days they're
out.

```sql
-- Fix the FK: staff_shifts must reference staff_members, not the dead
-- professionals table. Table has 0 rows, so this is safe.
alter table staff_shifts drop constraint if exists staff_shifts_professional_id_fkey;
alter table staff_shifts rename column professional_id to staff_member_id;
alter table staff_shifts
  add constraint staff_shifts_staff_member_id_fkey
  foreign key (staff_member_id) references staff_members(id) on delete cascade;

-- Replace the old working/break/off status with a period concept.
alter table staff_shifts drop column if exists status;
alter table staff_shifts drop column if exists start_time;
alter table staff_shifts drop column if exists end_time;
alter table staff_shifts add column if not exists period text not null default 'full_day';

do $$ begin
  alter table staff_shifts
    add constraint staff_shifts_period_check
    check (period in ('full_day', 'morning', 'afternoon'));
exception when duplicate_object then null; end $$;
```

Resulting shape: `id, staff_member_id, branch_id, shift_date, period,
created_at`. One staff member can have at most one off-record per date
(a `full_day` row makes separate morning/afternoon rows redundant — the
UI prevents creating overlapping records; see §3).

**Morning/afternoon boundary**: a fixed **1:00 PM** cutoff, not
branch-specific operating hours. Simple, predictable, and good enough for
"I'm out this afternoon" style scheduling — branches' differing hours
(8am–6pm vs 10am–8pm) don't need to shift this boundary.

**RLS**: needs to be publicly readable (booking flow reads it as an
anonymous-to-the-data check, same trust level as branch hours), and
writable by front desk/admin staff, matching the existing
`staff_members` policy pattern.

```sql
alter table staff_shifts enable row level security;

create policy "public read staff_shifts" on staff_shifts for select using (true);

create policy "staff manage staff_shifts" on staff_shifts for all
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'front_desk'))
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'front_desk'))
  );
```

## 1. Staff Schedule page (Front Desk) — `StaffShiftGrid.tsx`

Replaces the hardcoded bar with real, date-scoped data:

- **Date navigation**: prev/next day buttons + a "jump to today" button,
  same interaction pattern already built for the Admin Bookings Calendar
  (`BookingsCalendar.tsx`) — reused for consistency, not reinvented.
- For the selected date, each staff row shows:
  - **On Duty** (default, no `staff_shifts` row for that
    staff_member_id + date) — plain/neutral styling.
  - **Off (Full Day)** / **Off (Morning)** / **Off (Afternoon)** — red
    styling, matching the "off/unavailable" convention used elsewhere in
    this app (e.g. cancelled/no-show badges).
- **"Add Block"** button (currently decorative) becomes real: opens a
  small form — pick a staff member (from this branch's roster, already
  fetched elsewhere via `staff_members`), pick a date, pick a period
  (Full Day / Morning / Afternoon). Submitting inserts a `staff_shifts`
  row. If a row already exists for that staff member + date, replace it
  (a person can only have one off-state per day) rather than creating a
  duplicate.
- Each **existing** off-block gets a small remove control (e.g. an ×)
  that deletes the row, restoring the staff member to on-duty for that
  date.

## 2. Booking flow gating — `BookingModal.tsx`

Only applies when `professionalId` is a specific staff member (not
`"any"` — matches the earlier decision that "any professional" bookings
are never restricted by one person's schedule).

Add a `useEffect` keyed on `[professionalId, calendarMonth]` that, when
`professionalId` is set and is not `"any"`, fetches that staff member's
`staff_shifts` rows for the visible `calendarMonth` (so navigating months
re-fetches). Store the result in new state, e.g.
`staffOffDays: { date: string; period: "full_day" | "morning" | "afternoon" }[]`.
`buildMonthGrid` itself stays a pure render-time function, unchanged — it
is only consulted, not the fetch trigger.

**Date grid** (`BookingModal.tsx:941-964`): extend the existing `isPast`
disable condition. A date is also disabled when a `full_day` off-record
exists for that professional on that date:

```ts
const isStaffOff = cellDate ? isFullDayOff(cellDate) : false;
disabled={!day || isPast || isStaffOff}
```

Visually reuse the same "disabled" treatment already applied to past
dates (`text-ink/20 cursor-not-allowed`) so an off-day and a past day look
the same to the customer — both simply aren't selectable.

**Time slot list** (`BookingModal.tsx:968-982`): when the *selected* date
has a `morning` or `afternoon` off-record (not `full_day`, since that's
already excluded at the date-grid level), filter out or disable the time
slots that fall in the off period (before 1:00 PM for `morning`, 1:00 PM
or later for `afternoon`), using the same 1:00 PM cutoff defined above.

If every time slot for the selected date ends up disabled (edge case:
branch hours are entirely within the off period), show a short inline
message — "No available times for this therapist on this date" — instead
of an empty, unexplained list.

## 3. Error handling

- **Race condition** (front desk marks someone off between the customer
  loading the calendar and submitting): the existing appointment-creation
  flow already handles a structurally identical race (double-booking a
  slot) via its conflict handling at submit time — reuse that same
  check-at-submit-time safety net rather than building a new one. If the
  insert would conflict with a since-added off-record, surface the same
  "Missing branch, date, or time" / booking-failed error pattern already
  used in `saveBooking()` for other failure modes.
- **Duplicate off-records**: the Add Block form replaces (upserts) rather
  than duplicates a staff member's existing record for that date, per §1.
- **Staff member deleted while having future off-records**: the FK's
  `on delete cascade` removes their `staff_shifts` rows automatically —
  no orphaned data.

## 4. Testing

No automated test framework exists in this repo (consistent with the rest
of the app). Verified manually via the `run` skill:

1. Mark a staff member off (Full Day) for tomorrow in the Staff Schedule
   page; confirm the badge updates immediately and persists on reload.
2. As a customer, select that same professional in the booking flow;
   confirm tomorrow's date is disabled in the calendar, other dates are
   not.
3. Mark a *different* staff member off (Morning) for today; confirm
   morning time slots are disabled/hidden for today when that professional
   is selected, afternoon slots remain selectable.
4. Confirm "any professional" bookings are unaffected by either of the
   above off-records.
5. Remove an off-block; confirm the staff member becomes bookable again
   without a page reload being required on the admin side (front desk
   sees it update), and a fresh booking-flow session reflects it.
6. Confirm a specific professional with zero available slots on a given
   date (fully off) shows the informative empty state, not a silent blank
   list.
