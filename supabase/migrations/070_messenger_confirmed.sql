-- 070_messenger_confirmed.sql
-- Requires 047. When the Front Desk confirms a pending booking, a client who
-- connected Messenger gets a "Your booking is confirmed" message (the bell and
-- email already have it). Same rules as the other appointment updates: not for
-- walk-ins or the client's own change, one pending message per booking.

alter table messenger_outbox drop constraint if exists messenger_outbox_update_type_check;
alter table messenger_outbox add constraint messenger_outbox_update_type_check
  check (update_type in ('rescheduled', 'cancelled', 'no_show', 'confirmed'));

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
  elsif new.event_type = 'status_change' and new.to_value = 'confirmed' and new.from_value = 'pending' then
    v_type := 'confirmed';
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
  elsif v_type = 'confirmed' then
    -- Confirmed, and not already in the past.
    if v_status is distinct from 'confirmed'
       or (v_scheduled_date + v_start_time) < (now() at time zone 'Asia/Manila') then
      return new;
    end if;
  elsif v_type = 'rescheduled' then
    if new.to_value is distinct from (v_scheduled_date::text || ' ' || v_start_time::text) then
      return new;
    end if;
  end if;

  -- Front Desk's auto-sweep can mark old appointments no-show long after the fact; don't notify.
  if v_type = 'no_show' and v_scheduled_date < ((now() at time zone 'Asia/Manila')::date - 1) then
    return new;
  end if;

  -- Pending rows are built from current appointment data at send time, so a
  -- duplicate pending row is redundant (this also collapses the two history
  -- rows when status and session_status both flip to no_show in one update).
  -- Once a message has gone out, a later genuine change must send again.
  if exists (
    select 1 from messenger_outbox o
    where o.appointment_id = new.appointment_id
      and o.kind = 'appointment_update'
      and o.update_type = v_type
      and o.status = 'pending'
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

notify pgrst, 'reload schema';
