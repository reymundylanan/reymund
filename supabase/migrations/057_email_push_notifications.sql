-- 057_email_push_notifications.sql
-- Requires 049–056. Every bell notice can also go out by email (through
-- the spa's Gmail) and as a phone/browser push notification, so clients
-- hear about their bookings without Messenger (which needs Meta Business
-- Verification). Also adds two bell notices: a reminder about 24 hours
-- before a booking, and "Appointment rescheduled".
--
-- Delivery: a trigger queues one row per channel in notification_deliveries;
-- a cron job pings /api/notifications/dispatch every minute. It reuses the
-- Vault secrets from 052 (review_eval_url, review_eval_secret) — no new
-- Vault setup — unless a 'notify_dispatch_url' secret is added to override
-- the URL.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ── New bell kinds ────────────────────────────────────────────────────

alter table client_notifications drop constraint if exists client_notifications_kind_check;
alter table client_notifications add constraint client_notifications_kind_check
  check (kind in ('confirmed', 'cancelled', 'review_request', 'review_reward',
                  'voucher_expired', 'voucher_cancelled', 'points_adjusted', 'no_show',
                  'reminder', 'rescheduled'));

-- One reminder per booking per scheduled time (the body holds the date and
-- time), so a rescheduled booking gets a fresh reminder.
create unique index if not exists client_notifications_one_reminder
  on client_notifications (appointment_id, body) where kind = 'reminder';

-- ── Client preferences ────────────────────────────────────────────────

create table if not exists notification_preferences (
  profile_id uuid primary key references profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

drop policy if exists "client read own notification_preferences" on notification_preferences;
create policy "client read own notification_preferences" on notification_preferences for select
  using (profile_id = auth.uid());

drop policy if exists "client insert own notification_preferences" on notification_preferences;
create policy "client insert own notification_preferences" on notification_preferences for insert
  with check (profile_id = auth.uid());

drop policy if exists "client update own notification_preferences" on notification_preferences;
create policy "client update own notification_preferences" on notification_preferences for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update on notification_preferences to authenticated;

-- ── Push subscriptions (one per browser/phone) ────────────────────────

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_profile_idx on push_subscriptions (profile_id);

alter table push_subscriptions enable row level security;

drop policy if exists "client read own push_subscriptions" on push_subscriptions;
create policy "client read own push_subscriptions" on push_subscriptions for select
  using (profile_id = auth.uid());

-- Writes go through the two functions below (an endpoint can move between
-- accounts when people share a phone).
revoke insert, update, delete on push_subscriptions from anon, authenticated;
grant select on push_subscriptions to authenticated;

create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'PUSH_FORBIDDEN';
  end if;
  if coalesce(btrim(p_endpoint), '') = '' or p_endpoint not like 'https://%'
     or coalesce(btrim(p_p256dh), '') = '' or coalesce(btrim(p_auth), '') = ''
     or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'PUSH_INVALID';
  end if;
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

create or replace function remove_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
end;
$$;

revoke execute on function save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function remove_push_subscription(text) from public, anon;
grant execute on function save_push_subscription(text, text, text, text) to authenticated;
grant execute on function remove_push_subscription(text) to authenticated;

-- ── Delivery queue ────────────────────────────────────────────────────

create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references client_notifications(id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  skip_reason text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (notification_id, channel)
);

create index if not exists notification_deliveries_due
  on notification_deliveries (next_attempt_at) where status = 'pending';

alter table notification_deliveries enable row level security;

drop policy if exists "admin read notification_deliveries" on notification_deliveries;
create policy "admin read notification_deliveries" on notification_deliveries for select
  using (coalesce(public.current_user_role()::text, '') = 'admin');

revoke insert, update, delete on notification_deliveries from anon, authenticated;

-- Appointment notices go by email; every notice goes by push.
create or replace function queue_notification_deliveries() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.kind in ('confirmed', 'cancelled', 'rescheduled', 'no_show', 'reminder', 'review_request')
     and exists (select 1 from profiles p where p.id = new.client_id and coalesce(btrim(p.email), '') <> '') then
    insert into notification_deliveries (notification_id, channel) values (new.id, 'email')
    on conflict do nothing;
  end if;

  if exists (select 1 from push_subscriptions s where s.profile_id = new.client_id) then
    insert into notification_deliveries (notification_id, channel) values (new.id, 'push')
    on conflict do nothing;
  end if;

  return new;
exception when others then
  -- Never lose the bell notice over email/push.
  raise warning 'queue_notification_deliveries failed: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function queue_notification_deliveries() from public, anon, authenticated;

drop trigger if exists client_notifications_delivery_trigger on client_notifications;
create trigger client_notifications_delivery_trigger
  after insert on client_notifications
  for each row execute function queue_notification_deliveries();

create or replace function claim_notification_deliveries(p_limit integer)
returns setof notification_deliveries
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update notification_deliveries
     set status = 'failed', last_error = coalesce(last_error, 'dispatcher crashed repeatedly')
   where status = 'sending' and claimed_at < now() - interval '10 minutes' and attempts >= 5;

  update notification_deliveries
     set status = 'pending'
   where status = 'sending' and claimed_at < now() - interval '10 minutes' and attempts < 5;

  return query
  update notification_deliveries d
     set status = 'sending', attempts = d.attempts + 1, claimed_at = now()
   where d.id in (
     select id from notification_deliveries
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at
      for update skip locked
      limit p_limit
   )
  returning d.*;
end;
$$;

revoke execute on function claim_notification_deliveries(integer) from public, anon, authenticated;

create or replace function notify_ping_dispatcher() returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from notification_deliveries
     where (status = 'pending' and next_attempt_at <= now())
        or (status = 'sending' and claimed_at < now() - interval '10 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_dispatch_url';
  if v_url is null then
    select replace(decrypted_secret, '/api/reviews/evaluate', '/api/notifications/dispatch') into v_url
      from vault.decrypted_secrets where name = 'review_eval_url';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'review_eval_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function notify_ping_dispatcher() from public, anon, authenticated;

select cron.unschedule('notify-dispatch') where exists (select 1 from cron.job where jobname = 'notify-dispatch');
select cron.schedule('notify-dispatch', '* * * * *', $$select public.notify_ping_dispatcher()$$);

-- ── Service names for a booking (shared by the notices below) ─────────

create or replace function appointment_service_label(p_appointment_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select string_agg(service_name, ', ' order by position) from appointment_services where appointment_id = a.id),
    (select name from branch_services where id = a.service_id),
    nullif(btrim(split_part(coalesce(a.notes, ''), ' with ', 1)), ''),
    'appointment')
  from appointments a where a.id = p_appointment_id;
$$;

revoke execute on function appointment_service_label(uuid) from public, anon, authenticated;

-- ── Reminder ~24 hours before ─────────────────────────────────────────

create or replace function enqueue_client_reminders() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
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
  return v_count;
end;
$$;

revoke execute on function enqueue_client_reminders() from public, anon, authenticated;

select cron.unschedule('client-reminders') where exists (select 1 from cron.job where jobname = 'client-reminders');
select cron.schedule('client-reminders', '*/15 * * * *', $$select public.enqueue_client_reminders()$$);

-- ── "Appointment rescheduled" ─────────────────────────────────────────

create or replace function notify_client_rescheduled() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_branch text;
begin
  if new.client_id is null or new.visit_type <> 'appointment'
     or new.status::text in ('cancelled', 'completed')
     or (new.scheduled_date = old.scheduled_date and new.start_time = old.start_time) then
    return new;
  end if;
  -- The client's own reschedule needs no notice.
  if auth.uid() is not distinct from new.client_id then
    return new;
  end if;

  select name into v_branch from branches where id = new.branch_id;

  insert into client_notifications (client_id, appointment_id, kind, title, body, link_path)
  values (
    new.client_id, new.id, 'rescheduled', 'Appointment rescheduled',
    'Your ' || appointment_service_label(new.id) || ' has been moved to '
      || to_char(new.scheduled_date, 'Dy, Mon FMDD') || ' at ' || to_char(new.start_time, 'FMHH12:MI AM')
      || coalesce(' at ' || v_branch, '') || '.',
    '/my-glow/appointments/' || new.id
  );
  return new;
exception when others then
  raise warning 'notify_client_rescheduled failed: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function notify_client_rescheduled() from public, anon, authenticated;

drop trigger if exists appointments_rescheduled_notice_trigger on appointments;
create trigger appointments_rescheduled_notice_trigger
  after update of scheduled_date, start_time on appointments
  for each row execute function notify_client_rescheduled();

notify pgrst, 'reload schema';
