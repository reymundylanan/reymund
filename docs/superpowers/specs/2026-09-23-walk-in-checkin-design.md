# Walk-in Check-In Feature — Design Spec

Date: 2026-09-23
Status: Approved (in-chat design confirmed by user 2026-09-23)

## Purpose

Replace the Front Desk dashboard's fully mock "Walk-in Queue" stat and "Lobby
Queue" panel with a real check-in system: front desk staff can register a
walk-in client (no account required), see them in a live queue ordered by
arrival time, and move them through the same appointment lifecycle a booked
client already goes through.

## Decisions made during brainstorming

- A checked-in walk-in becomes a **real `appointments` row** immediately —
  not a separate lightweight table — so it's tracked the same way as a
  booked appointment everywhere else in the app (Today's Schedule, stats).
- No customer account is created or required. The walk-in's name is stored
  as free text; `appointments.client_id` stays `null` for these rows (it is
  already nullable in the schema).
- Service is selected from the branch's real service catalog
  (`branch_services`), not free text, so pricing/duration stay consistent
  with online bookings.
- Wait time shown is **real elapsed time since check-in** (`now − start_time`),
  never a predicted estimate — there's no reliable average-service-duration
  data to predict from honestly.
- Queue actions: **Start Service** (→ `in_service`) and **No Show**
  (→ `no_show`). Completing service is handled the same way any other
  appointment is marked complete elsewhere in the app (out of scope to
  duplicate here).
- The "Walk-in Client" header button becomes the entry point for this
  feature. "New Booking" and "Verify GCash" stay as decorative buttons —
  explicitly out of scope for this pass.

## 1. Schema change

New migration: add one nullable column to the existing `appointments` table.

```sql
alter table appointments
  add column if not exists walk_in_name text;
```

No new tables. A walk-in row is distinguished from a booked row simply by
`client_id is null and walk_in_name is not null`.

## 2. RLS gap found during design

The current `appointments` table has **no INSERT policy for staff at all** —
only `"clients create own appointments" ... with check (client_id =
auth.uid())`. A front desk staffer creating a walk-in (`client_id: null`)
would be rejected by RLS today. New migration:

```sql
create policy "staff create appointments" on appointments for insert
  with check (
    exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'front_desk')
    )
  );
```

This matches the existing `"staff manage appointments"` UPDATE policy's role
set exactly (`admin`, `front_desk`) for consistency — `specialist` is
excluded from both, matching current precedent.

## 3. Check-in flow

"Walk-in Client" button (`DashboardHeader.tsx`) opens a modal:

- **Name** — required text input.
- **Service** — a `<select>` populated from `branch_services` where
  `branch_id` = the staffer's own branch and `status = 'Active'`, showing
  `{name} — ₱{price}`.
- **Check In** button — disabled until both fields are filled.

On submit, insert into `appointments`:

```ts
{
  booking_code: <random 6-char code, same generator BookingModal.tsx already uses>,
  branch_id: profile.branchId,
  client_id: null,
  walk_in_name: name,
  appointment_type: "solo",
  scheduled_date: today (YYYY-MM-DD),
  start_time: now (HH:MM:SS),
  duration_minutes: <selected service's duration, parsed from branch_services.duration
    the same way BookingModal.tsx's parseDurationMinutes() already does — that
    column is free text like "30 min", not a number>,
  status: "checked_in",
  notes: `${service.name} — ₱${service.price.toLocaleString()}.00`,
}
```

This matches the existing notes convention (`"{service} — ₱{price}.00"`,
omitting the `"with {professional}"` segment since no therapist is assigned
at check-in time — consistent with how therapist assignment is already
unused elsewhere in this app).

If the branch has zero active services (empty dropdown), the form disables
Check In and shows "No services configured for this branch yet."

## 4. Lobby Queue panel (replaces the mock version)

Query: `appointments` where `branch_id` = staffer's branch, `scheduled_date`
= today, `status = 'checked_in'`, ordered by `start_time` ascending (first
checked in = first in line).

Each row shows:
- Name (`walk_in_name`, falling back to `"Guest"` if somehow null)
- Service — walk-in notes never contain a `"with {professional}"` segment
  (no therapist is assigned at check-in), so `BookingDetailsPanel.tsx`'s
  `parseService` helper does not apply cleanly here. Use a simpler split on
  `" — "` instead: the part before it is the service name, e.g.
  `notes.split(" — ")[0]`.
- Elapsed wait time, formatted as `"Xm"` under an hour, `"Xh Ym"` at or
  above 60 minutes
- **Start Service** button → updates `status` to `in_service`
- **No Show** button → updates `status` to `no_show`

Empty state: "No one waiting right now."

## 5. Walk-in Queue stat card (replaces the mock version)

Restored to the stats row (making it 3 cards again: Daily Appointments,
Pending Payments, Walk-in Queue).

- Value: count of today's `checked_in` appointments at this branch.
- Note: `"Longest wait: {elapsed of the oldest checked_in row}"`, or
  `"No one waiting"` when the count is 0.

## 6. Today's Schedule — no changes needed to its query shape, one fix

`TodaySchedule` already renders every status (including `checked_in` and
`in_service`) with the right badges — a walk-in will appear there
automatically once created. The only fix needed: `getTodaySchedule`'s
client-name lookup currently only reads the `profiles` join, which will be
`null` for walk-ins. Fall back to `walk_in_name`:

```ts
client: one(row.client)?.full_name ?? row.walk_in_name ?? "Unknown",
```

(requires adding `walk_in_name` to that query's `select`).

## 7. Error handling

- RLS rejection on insert (e.g. a `specialist`-role account somehow reaches
  the button) → show the returned Supabase error message inline in the
  check-in modal, do not silently fail.
- Branch with no active services → Check In disabled with an explanatory
  message (see §3).
- Double-clicking Start Service / No Show → both are simple status updates;
  a second click is harmless (idempotent from the user's perspective, just
  re-sets the same or a no-longer-relevant status).

## 8. Testing

No automated test framework exists in this repo (consistent with the rest
of the app). Verified manually via the `run` skill:

1. Check in a walk-in with a real name and a real branch service; confirm it
   appears in the Lobby Queue immediately, in the Today's Schedule list, and
   the Walk-in Queue stat count increments.
2. Confirm elapsed wait time increases realistically on reload.
3. Click Start Service; confirm the row leaves the Lobby Queue and Today's
   Schedule shows it as "In Service".
4. Check in a second walk-in, click No Show; confirm it leaves the Lobby
   Queue and Today's Schedule shows "No-Show".
5. Confirm a branch with zero active services shows the disabled state
   instead of crashing.
6. Confirm the RLS migration is applied by checking-in successfully as a
   front_desk-role account (this was failing before the new INSERT policy).
