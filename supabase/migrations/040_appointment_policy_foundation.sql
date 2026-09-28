-- 040_appointment_policy_foundation.sql
-- Foundation for the spa's "No Refunds — Rescheduling Only" policy:
-- new lifecycle statuses, a global grace-period setting, and a
-- permanent audit trail of every status change and reschedule.
--
-- Refunds are deliberately NOT touched at the schema level here — the
-- 'refunded' payments.status value and its refund_reason/refunded_at
-- columns are left in place so any historical refund rows already in
-- the database keep displaying correctly. What actually disables
-- refunds is removing the application code path that can create one
-- (RefundPanel and processRefund), done separately from this migration.

alter table appointments drop constraint if exists appointments_session_status_check;
alter table appointments add constraint appointments_session_status_check
  check (session_status is null or session_status in (
    'arrived', 'waiting', 'ready', 'late_arrival', 'in_service', 'completed', 'paid', 'no_show',
    'reschedule_requested', 'rescheduled'
  ));

-- Preserves the very first scheduled date/time even across multiple
-- reschedules, so "original vs new" can always be shown.
alter table appointments add column if not exists original_scheduled_date date;
alter table appointments add column if not exists original_start_time time;
alter table appointments add column if not exists reschedule_count integer not null default 0;

-- One global, admin-editable setting. The boolean primary key + check
-- forces exactly one row to ever exist (a singleton settings table).
create table if not exists spa_settings (
  id boolean primary key default true,
  grace_period_minutes integer not null default 15,
  constraint spa_settings_singleton check (id)
);
insert into spa_settings (id) values (true) on conflict (id) do nothing;

alter table spa_settings enable row level security;

drop policy if exists "everyone read spa_settings" on spa_settings;
create policy "everyone read spa_settings" on spa_settings for select using (true);

drop policy if exists "admin update spa_settings" on spa_settings;
create policy "admin update spa_settings" on spa_settings for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Permanent record of every status change and reschedule. Populated by
-- a trigger (not application code) so nothing can be missed regardless
-- of which flow — Front Desk, Walk-Ins, Admin — performs the update,
-- and so a status moving on (e.g. No-Show -> Late Arrival) never erases
-- that the No-Show happened.
create table if not exists appointment_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'status_change', 'reschedule')),
  from_value text,
  to_value text,
  changed_by uuid references profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

alter table appointment_history enable row level security;

drop policy if exists "staff read appointment_history" on appointment_history;
create policy "staff read appointment_history" on appointment_history for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'front_desk')));

drop policy if exists "system insert appointment_history" on appointment_history;
create policy "system insert appointment_history" on appointment_history for insert
  with check (true);

do $$ begin
  alter publication supabase_realtime add table appointment_history;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table spa_settings;
exception when duplicate_object then null; end $$;

create or replace function log_appointment_history() returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    insert into appointment_history (appointment_id, event_type, from_value, to_value, changed_by)
    values (new.id, 'created', null, coalesce(new.session_status, new.status), auth.uid());
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into appointment_history (appointment_id, event_type, from_value, to_value, changed_by)
    values (new.id, 'status_change', old.status, new.status, auth.uid());
  end if;

  if old.session_status is distinct from new.session_status then
    insert into appointment_history (appointment_id, event_type, from_value, to_value, changed_by)
    values (new.id, 'status_change', coalesce(old.session_status, 'none'), coalesce(new.session_status, 'none'), auth.uid());
  end if;

  if old.scheduled_date is distinct from new.scheduled_date or old.start_time is distinct from new.start_time then
    insert into appointment_history (appointment_id, event_type, from_value, to_value, changed_by)
    values (
      new.id, 'reschedule',
      old.scheduled_date::text || ' ' || old.start_time::text,
      new.scheduled_date::text || ' ' || new.start_time::text,
      auth.uid()
    );
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists appointments_history_trigger on appointments;
create trigger appointments_history_trigger
  after insert or update on appointments
  for each row execute function log_appointment_history();
