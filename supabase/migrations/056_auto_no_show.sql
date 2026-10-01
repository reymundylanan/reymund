-- 056_auto_no_show.sql
-- Requires 053, 054. A booking whose client hasn't checked in 10 minutes
-- (spa_settings.grace_period_minutes) after the start time becomes No Show
-- automatically on the server, every minute — not only while a Front Desk
-- page is open. The client gets a bell notice that the appointment was
-- cancelled and to contact the spa to reschedule. Messenger already sends
-- its No Show message from appointment_history (047).

-- ── Late limit: 10 minutes ────────────────────────────────────────────

alter table spa_settings alter column grace_period_minutes set default 10;
-- Only move the old default; keep a value an Admin chose on purpose.
update spa_settings set grace_period_minutes = 10 where grace_period_minutes = 15;

-- ── Sweep ─────────────────────────────────────────────────────────────

create extension if not exists pg_cron;

-- Same rule as the Front Desk page's sweep: not cancelled/completed, not
-- checked in or otherwise started, and the grace period is over.
-- Walk-ins are never swept (they are created already in service).
create or replace function auto_mark_no_shows() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_grace integer;
  v_count integer;
begin
  select coalesce(grace_period_minutes, 10) into v_grace from spa_settings where id;
  update appointments a
     set session_status = 'no_show'
   where a.visit_type = 'appointment'
     and a.status::text not in ('cancelled', 'completed')
     and a.session_status is null
     and a.arrival_time is null
     and ((a.scheduled_date + a.start_time) at time zone 'Asia/Manila')
         + make_interval(mins => coalesce(v_grace, 10)) <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function auto_mark_no_shows() from public, anon, authenticated;

select cron.unschedule('auto-no-show') where exists (select 1 from cron.job where jobname = 'auto-no-show');
select cron.schedule('auto-no-show', '* * * * *', $$select public.auto_mark_no_shows()$$);

-- ── Bell notice ───────────────────────────────────────────────────────

alter table client_notifications drop constraint if exists client_notifications_kind_check;
alter table client_notifications add constraint client_notifications_kind_check
  check (kind in ('confirmed', 'cancelled', 'review_request', 'review_reward',
                  'voucher_expired', 'voucher_cancelled', 'points_adjusted', 'no_show'));

create unique index if not exists client_notifications_one_no_show
  on client_notifications (appointment_id) where kind = 'no_show';

create or replace function notify_client_no_show() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_services text;
  v_when text;
begin
  if new.client_id is null or new.visit_type <> 'appointment'
     or coalesce(new.session_status, '') <> 'no_show'
     or coalesce(old.session_status, '') = 'no_show' then
    return new;
  end if;
  -- An old booking swept late (e.g. right after this migration) gets no notice.
  if new.scheduled_date < (now() at time zone 'Asia/Manila')::date - 1 then
    return new;
  end if;

  select string_agg(service_name, ', ' order by position) into v_services
    from appointment_services where appointment_id = new.id;
  v_services := coalesce(
    v_services,
    (select name from branch_services where id = new.service_id),
    nullif(btrim(split_part(coalesce(new.notes, ''), ' with ', 1)), ''),
    'appointment');
  v_when := to_char(new.start_time, 'FMHH12:MI AM');

  insert into client_notifications (client_id, appointment_id, kind, title, body, link_path)
  values (
    new.client_id, new.id, 'no_show', 'Appointment cancelled',
    'You didn''t arrive within ' || (select coalesce(grace_period_minutes, 10) from spa_settings where id)
      || ' minutes of your ' || v_services || ' booking at ' || v_when
      || ', so it has been cancelled. Please contact us to reschedule.',
    '/my-glow/appointments/' || new.id
  )
  on conflict do nothing;
  return new;
exception when others then
  -- Never block marking a No Show over a notification.
  raise warning 'notify_client_no_show failed: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function notify_client_no_show() from public, anon, authenticated;

drop trigger if exists appointments_no_show_notice_trigger on appointments;
create trigger appointments_no_show_notice_trigger
  after update of session_status on appointments
  for each row execute function notify_client_no_show();
