-- 028_appointments_session_lifecycle.sql
-- Foundation for unifying Walk-ins with Online Booking's availability:
-- professional_id/service_id already existed on appointments but were
-- never populated (booking flow only ever wrote a free-text notes
-- string) — app code now starts populating them so a therapist's real
-- schedule is queryable instead of guessed from parsed text.
--
-- Walk-ins have no customer account, so client_id must allow null and
-- we record their name/phone directly on the appointment.
--
-- session_status is a same-day operational tracker, independent of the
-- existing `status` column (which stays as the booking/payment state:
-- pending/confirmed/cancelled). It starts null (not yet on-site) and
-- moves registered -> waiting -> in_service -> completed as front desk
-- manages the room. Payment completion is tracked via the existing
-- payments table (a 'settled' row = paid), not a new column here.
alter table appointments alter column client_id drop not null;
alter table appointments add column if not exists walkin_name text;
alter table appointments add column if not exists walkin_phone text;
alter table appointments add column if not exists session_status text;

do $$ begin
  alter table appointments add constraint appointments_session_status_check
    check (session_status is null or session_status in ('registered', 'waiting', 'in_service', 'completed'));
exception when duplicate_object then null; end $$;

create index if not exists idx_appointments_professional_date
  on appointments(professional_id, scheduled_date);

-- Front desk needs to insert walk-ins (no client account exists to own
-- the row) and update session_status on any appointment at their own
-- branch — this was very likely missing since inserts previously only
-- ever came from a logged-in customer's own booking.
drop policy if exists "front_desk manage own branch appointments" on appointments;
create policy "front_desk manage own branch appointments" on appointments for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'front_desk' and p.branch_id = appointments.branch_id
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role = 'front_desk' and p.branch_id = appointments.branch_id
    )
  );

-- Same reasoning for payments: front desk collects payment for
-- walk-ins directly (no customer-initiated GCash flow), so needs to
-- insert payments rows for their own branch's appointments.
drop policy if exists "front_desk manage payments for own branch" on payments;
create policy "front_desk manage payments for own branch" on payments for all
  using (
    exists (
      select 1 from appointments a
      join profiles p on p.id = auth.uid()
      where a.id = payments.appointment_id and p.role = 'front_desk' and p.branch_id = a.branch_id
    )
  )
  with check (
    exists (
      select 1 from appointments a
      join profiles p on p.id = auth.uid()
      where a.id = payments.appointment_id and p.role = 'front_desk' and p.branch_id = a.branch_id
    )
  );
