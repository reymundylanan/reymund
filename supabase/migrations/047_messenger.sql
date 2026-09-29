-- 047_messenger.sql
-- Messenger notifications: account linking, an outbox of messages to
-- send, a trigger that queues appointment updates, a cron job that
-- queues ~24h reminders, and a cron job that pings the Next.js
-- dispatcher (/api/messenger/dispatch) which actually sends them.
--
-- Before the dispatcher ping does anything, add two Vault secrets
-- (Dashboard → Project Settings → Vault, or SQL):
--   select vault.create_secret('https://<site>/api/messenger/dispatch', 'messenger_dispatch_url');
--   select vault.create_secret('<same value as MESSENGER_DISPATCH_SECRET>', 'messenger_dispatch_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ── Linking ───────────────────────────────────────────────────────────

create table if not exists messenger_subscriptions (
  profile_id uuid primary key references profiles(id) on delete cascade,
  psid text not null unique,
  linked_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  opted_out_at timestamptz
);

alter table messenger_subscriptions enable row level security;

drop policy if exists "client read own messenger_subscription" on messenger_subscriptions;
create policy "client read own messenger_subscription" on messenger_subscriptions for select
  using (profile_id = auth.uid());

drop policy if exists "client delete own messenger_subscription" on messenger_subscriptions;
create policy "client delete own messenger_subscription" on messenger_subscriptions for delete
  using (profile_id = auth.uid());

create table if not exists messenger_link_tokens (
  token text primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Server (service role) only — no policies.
alter table messenger_link_tokens enable row level security;

-- ── Outbox ────────────────────────────────────────────────────────────

create table if not exists messenger_outbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('reminder', 'appointment_update', 'promo', 'booking_invite')),
  appointment_id uuid references appointments(id) on delete cascade,
  promo_id uuid references branch_promotions(id) on delete set null,
  broadcast_id uuid references notification_broadcasts(id) on delete set null,
  update_type text check (update_type in ('rescheduled', 'cancelled', 'no_show')),
  remind_for timestamptz,
  custom_text text,
  link_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  skip_reason text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint messenger_outbox_update_type_matches_kind
    check ((kind = 'appointment_update') = (update_type is not null)),
  constraint messenger_outbox_reminder_has_time
    check (kind <> 'reminder' or (appointment_id is not null and remind_for is not null))
);

-- One reminder per appointment per scheduled time: a reschedule gets a
-- fresh reminder for the new time.
create unique index if not exists messenger_outbox_one_reminder
  on messenger_outbox (appointment_id, remind_for) where kind = 'reminder';

create index if not exists messenger_outbox_due
  on messenger_outbox (next_attempt_at) where status = 'pending';

create index if not exists messenger_outbox_broadcast
  on messenger_outbox (broadcast_id) where broadcast_id is not null;

alter table messenger_outbox enable row level security;

drop policy if exists "admin read messenger_outbox" on messenger_outbox;
create policy "admin read messenger_outbox" on messenger_outbox for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create or replace view messenger_broadcast_results
with (security_invoker = true) as
select
  broadcast_id,
  count(*) filter (where status = 'sent')::int as sent,
  count(*) filter (where status = 'skipped')::int as skipped,
  count(*) filter (where status = 'failed')::int as failed,
  count(*) filter (where status in ('pending', 'sending'))::int as pending
from messenger_outbox
where broadcast_id is not null
group by broadcast_id;

create table if not exists messenger_dispatch_runs (
  id boolean primary key default true,
  last_run_at timestamptz,
  last_sent integer not null default 0,
  last_failed integer not null default 0,
  constraint messenger_dispatch_runs_singleton check (id)
);
insert into messenger_dispatch_runs (id) values (true) on conflict (id) do nothing;

alter table messenger_dispatch_runs enable row level security;

drop policy if exists "admin read messenger_dispatch_runs" on messenger_dispatch_runs;
create policy "admin read messenger_dispatch_runs" on messenger_dispatch_runs for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── Broadcast channels ────────────────────────────────────────────────

alter table notification_broadcasts add column if not exists channels text[] not null default '{email}';
alter table notification_broadcasts add column if not exists promo_id uuid references branch_promotions(id) on delete set null;

-- ── Clients can read the history of their own appointments ────────────

drop policy if exists "client read own appointment_history" on appointment_history;
create policy "client read own appointment_history" on appointment_history for select
  using (exists (
    select 1 from appointments a where a.id = appointment_history.appointment_id and a.client_id = auth.uid()
  ));

-- ── Appointment update trigger ────────────────────────────────────────

create or replace function enqueue_messenger_appointment_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_client uuid;
  v_type text;
  v_status text;
  v_session_status text;
  v_scheduled_date date;
  v_start_time time;
begin
  if new.event_type = 'reschedule' then
    v_type := 'rescheduled';
  elsif new.event_type = 'status_change' and new.to_value = 'cancelled' then
    v_type := 'cancelled';
  elsif new.event_type = 'status_change' and new.to_value = 'no_show' then
    v_type := 'no_show';
  else
    return new;
  end if;

  -- Fetch current appointment state to validate event matches reality.
  -- The appointment_history insert policy is open (with check true), so anyone
  -- can forge history rows; we trust only events where to_value reflects the
  -- appointment's actual current state.
  select client_id, status::text, session_status, scheduled_date, start_time
    into v_client, v_status, v_session_status, v_scheduled_date, v_start_time
    from appointments
   where id = new.appointment_id;

  -- Walk-ins without an account, and changes the client made themselves.
  if v_client is null or new.changed_by is not distinct from v_client then
    return new;
  end if;

  if not exists (
    select 1 from messenger_subscriptions s where s.profile_id = v_client and s.opted_out_at is null
  ) then
    return new;
  end if;

  -- Validate the event matches the current appointment state.
  if v_type = 'cancelled' or v_type = 'no_show' then
    if v_status is distinct from new.to_value and v_session_status is distinct from new.to_value then
      return new;
    end if;
  elsif v_type = 'rescheduled' then
    if new.to_value is distinct from (v_scheduled_date::text || ' ' || v_start_time::text) then
      return new;
    end if;
  end if;

  -- status and session_status can both flip to no_show in one update,
  -- producing two history rows; send one message.
  if exists (
    select 1 from messenger_outbox o
    where o.appointment_id = new.appointment_id
      and o.kind = 'appointment_update'
      and o.update_type = v_type
      and o.created_at > now() - interval '5 minutes'
  ) then
    return new;
  end if;

  insert into messenger_outbox (profile_id, kind, appointment_id, update_type, link_path)
  values (v_client, 'appointment_update', new.appointment_id, v_type,
          '/my-glow/appointments/' || new.appointment_id);

  return new;
exception when others then
  -- Never block a Front Desk / Admin appointment change over a notification.
  raise warning 'enqueue_messenger_appointment_update failed: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function enqueue_messenger_appointment_update() from public, anon, authenticated;

drop trigger if exists appointment_history_messenger_trigger on appointment_history;
create trigger appointment_history_messenger_trigger
  after insert on appointment_history
  for each row execute function enqueue_messenger_appointment_update();

-- ── Reminder job ──────────────────────────────────────────────────────

create or replace function enqueue_messenger_reminders() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count integer;
begin
  insert into messenger_outbox (profile_id, kind, appointment_id, remind_for, link_path)
  select
    a.client_id,
    'reminder',
    a.id,
    (a.scheduled_date + a.start_time) at time zone 'Asia/Manila',
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

  delete from messenger_link_tokens where expires_at < now() - interval '1 day';

  return v_count;
end;
$$;

revoke execute on function enqueue_messenger_reminders() from public, anon, authenticated;

-- ── Claiming work for the dispatcher ──────────────────────────────────

create or replace function claim_messenger_outbox(p_limit integer)
returns setof messenger_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- A dispatcher that died mid-batch leaves rows in 'sending'.
  -- Rows with attempts >= 5 are failed (crash-looping); don't cycle them.
  update messenger_outbox
     set status = 'failed', last_error = coalesce(last_error, 'dispatcher crashed repeatedly')
   where status = 'sending' and claimed_at < now() - interval '10 minutes' and attempts >= 5;

  update messenger_outbox
     set status = 'pending'
   where status = 'sending' and claimed_at < now() - interval '10 minutes' and attempts < 5;

  return query
  update messenger_outbox o
     set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
   where o.id in (
     select id from messenger_outbox
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at
      for update skip locked
      limit p_limit
   )
  returning o.*;
end;
$$;

revoke execute on function claim_messenger_outbox(integer) from public, anon, authenticated;

-- ── Dispatcher ping ───────────────────────────────────────────────────

create or replace function messenger_ping_dispatcher() returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from messenger_outbox
     where (status = 'pending' and next_attempt_at <= now())
        or (status = 'sending' and claimed_at < now() - interval '10 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'messenger_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'messenger_dispatch_secret';
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

revoke execute on function messenger_ping_dispatcher() from public, anon, authenticated;

select cron.schedule('messenger-reminders', '*/15 * * * *', $$select public.enqueue_messenger_reminders()$$);
select cron.schedule('messenger-dispatch', '* * * * *', $$select public.messenger_ping_dispatcher()$$);
