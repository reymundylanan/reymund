-- 049_client_notifications.sql
-- In-app notifications for clients: when the front desk (or admin)
-- confirms a pending booking or cancels a booking, a row is written here
-- by a trigger, so it works no matter which screen made the change. The
-- client sees it in the header bell and, if online, as a live pop-up.
-- (Numbered 049 because 048 belongs to the unmerged reviews branch.)

create table if not exists client_notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete cascade,
  kind text not null check (kind in ('confirmed', 'cancelled')),
  title text not null,
  body text not null,
  link_path text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_notifications_client_created_idx
  on client_notifications (client_id, created_at desc);

alter table client_notifications enable row level security;

drop policy if exists "client read own notifications" on client_notifications;
create policy "client read own notifications" on client_notifications for select
  using (client_id = auth.uid());

drop policy if exists "client mark own notifications read" on client_notifications;
create policy "client mark own notifications read" on client_notifications for update
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

-- Clients may only change read_at; rows are created by the trigger below.
revoke insert, update, delete on client_notifications from anon, authenticated;
grant select on client_notifications to authenticated;
grant update (read_at) on client_notifications to authenticated;

do $$ begin
  alter publication supabase_realtime add table client_notifications;
exception when duplicate_object then null; end $$;

create or replace function notify_client_booking_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind text;
  v_service text;
  v_branch text;
  v_when text;
begin
  if new.client_id is null or new.status::text = old.status::text then
    return new;
  end if;

  if old.status::text = 'pending' and new.status::text = 'confirmed' then
    v_kind := 'confirmed';
  elsif new.status::text = 'cancelled' then
    v_kind := 'cancelled';
  else
    return new;
  end if;

  -- The client's own actions don't need a notification.
  if auth.uid() is not distinct from new.client_id then
    return new;
  end if;

  select name into v_service from branch_services where id = new.service_id;
  -- Bookings record services as free text: "<services> with <therapist> — ₱…".
  v_service := coalesce(v_service, nullif(btrim(split_part(coalesce(new.notes, ''), ' with ', 1)), ''), 'Your appointment');
  select name into v_branch from branches where id = new.branch_id;
  v_when := to_char(new.scheduled_date, 'Dy, Mon FMDD') || ' at ' || to_char(new.start_time, 'FMHH12:MI AM');

  insert into client_notifications (client_id, appointment_id, kind, title, body, link_path)
  values (
    new.client_id,
    new.id,
    v_kind,
    case v_kind when 'confirmed' then 'Booking confirmed' else 'Booking cancelled' end,
    v_service || ' on ' || v_when || coalesce(' at ' || v_branch, '') || '.' ||
      case v_kind when 'cancelled' then ' Please call your branch if this is unexpected.' else '' end,
    '/my-glow/appointments/' || new.id
  );

  return new;
exception when others then
  -- Never block a confirm/cancel over a notification.
  raise warning 'notify_client_booking_status failed: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function notify_client_booking_status() from public, anon, authenticated;

drop trigger if exists appointments_client_notification_trigger on appointments;
create trigger appointments_client_notification_trigger
  after update of status on appointments
  for each row execute function notify_client_booking_status();
