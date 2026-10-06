-- 072_second_reminder.sql
-- Requires 047, 068. Clients get two reminders per booking:
--   • the day before (about 24 hours ahead) — as before
--   • on the day, about 3 hours before the session — new
-- Both go to the bell, email and push (068) and Messenger (047). Bookings
-- made less than an hour before the 3-hour mark don't get the second one
-- (they just booked, so a reminder right away would be noise).

-- ── Messenger: allow one reminder per slot ("day" and "soon") ─────────

alter table messenger_outbox add column if not exists reminder_slot text not null default 'day';
alter table messenger_outbox drop constraint if exists messenger_outbox_reminder_slot_check;
alter table messenger_outbox add constraint messenger_outbox_reminder_slot_check check (reminder_slot in ('day', 'soon'));

drop index if exists messenger_outbox_one_reminder;
create unique index if not exists messenger_outbox_one_reminder_per_slot
  on messenger_outbox (appointment_id, remind_for, reminder_slot) where kind = 'reminder';

create or replace function enqueue_messenger_reminders() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
  v_soon integer;
begin
  -- The day before.
  insert into messenger_outbox (profile_id, kind, appointment_id, remind_for, reminder_slot, link_path)
  select
    a.client_id, 'reminder', a.id,
    (a.scheduled_date + a.start_time) at time zone 'Asia/Manila',
    'day',
    '/my-glow/appointments/' || a.id
  from appointments a
  join messenger_subscriptions s on s.profile_id = a.client_id and s.opted_out_at is null
  where a.client_id is not null
    and a.scheduled_date between current_date - 1 and current_date + 2
    and (a.scheduled_date + a.start_time) at time zone 'Asia/Manila'
        between now() + interval '23 hours' and now() + interval '24 hours'
    and a.status not in ('cancelled', 'no_show', 'completed')
    and coalesce(a.session_status, '') not in ('completed', 'paid', 'no_show')
  on conflict do nothing;
  get diagnostics v_count = row_count;

  -- On the day, about 3 hours before.
  insert into messenger_outbox (profile_id, kind, appointment_id, remind_for, reminder_slot, link_path)
  select
    a.client_id, 'reminder', a.id,
    (a.scheduled_date + a.start_time) at time zone 'Asia/Manila',
    'soon',
    '/my-glow/appointments/' || a.id
  from appointments a
  join messenger_subscriptions s on s.profile_id = a.client_id and s.opted_out_at is null
  where a.client_id is not null
    and a.scheduled_date between current_date - 1 and current_date + 1
    and (a.scheduled_date + a.start_time) at time zone 'Asia/Manila'
        between now() + interval '2 hours' and now() + interval '3 hours'
    and a.created_at < now() - interval '1 hour'
    and a.status not in ('cancelled', 'no_show', 'completed')
    and coalesce(a.session_status, '') not in ('completed', 'paid', 'no_show', 'in_service', 'arrived')
  on conflict do nothing;
  get diagnostics v_soon = row_count;

  delete from messenger_link_tokens where expires_at < now() - interval '1 day';

  return v_count + v_soon;
end;
$$;

revoke execute on function enqueue_messenger_reminders() from public, anon, authenticated;

-- ── Bell, email and push ──────────────────────────────────────────────
-- The bell's unique index (appointment_id, body) keeps each reminder to one;
-- the two reminders have different wording, so both are allowed.

create or replace function enqueue_client_reminders() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
  v_soon integer;
begin
  -- The day before.
  insert into client_notifications (client_id, appointment_id, kind, title, body, link_path)
  select
    a.client_id, a.id, 'reminder', 'Appointment tomorrow',
    'Reminder: your ' || appointment_service_label(a.id) || ' is on '
      || to_char(a.scheduled_date, 'Dy, Mon FMDD') || ' at ' || to_char(a.start_time, 'FMHH12:MI AM')
      || coalesce(' at ' || b.name, '') || '. Please arrive on time — bookings are cancelled after '
      || coalesce((select grace_period_minutes from spa_settings where id), 10) || ' minutes.',
    '/my-glow/appointments/' || a.id
  from appointments a
  left join branches b on b.id = a.branch_id
  where a.client_id is not null
    and a.visit_type = 'appointment'
    and a.scheduled_date between current_date - 1 and current_date + 2
    and (a.scheduled_date + a.start_time) at time zone 'Asia/Manila'
        between now() + interval '23 hours' and now() + interval '24 hours'
    and a.status::text not in ('cancelled', 'no_show', 'completed')
    and a.session_status is null
  on conflict do nothing;
  get diagnostics v_count = row_count;

  -- On the day, about 3 hours before.
  insert into client_notifications (client_id, appointment_id, kind, title, body, link_path)
  select
    a.client_id, a.id, 'reminder', 'Your appointment is today',
    'See you soon! Your ' || appointment_service_label(a.id) || ' is today at '
      || to_char(a.start_time, 'FMHH12:MI AM') || coalesce(' at ' || b.name, '')
      || '. Please arrive 10 minutes early — bookings are cancelled after '
      || coalesce((select grace_period_minutes from spa_settings where id), 10) || ' minutes late.',
    '/my-glow/appointments/' || a.id
  from appointments a
  left join branches b on b.id = a.branch_id
  where a.client_id is not null
    and a.visit_type = 'appointment'
    and a.scheduled_date between current_date - 1 and current_date + 1
    and (a.scheduled_date + a.start_time) at time zone 'Asia/Manila'
        between now() + interval '2 hours' and now() + interval '3 hours'
    and a.created_at < now() - interval '1 hour'
    and a.status::text not in ('cancelled', 'no_show', 'completed')
    and a.session_status is null
  on conflict do nothing;
  get diagnostics v_soon = row_count;

  return v_count + v_soon;
end;
$$;

revoke execute on function enqueue_client_reminders() from public, anon, authenticated;

notify pgrst, 'reload schema';
