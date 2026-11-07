-- 086_appointment_history_locked.sql
-- 040 let ANYONE (even signed-out visitors) add rows to appointment_history,
-- so the booking history — and the Messenger alerts that read it (047, 070) —
-- could be fed fake events. Only the database itself writes history:
--   * the log_appointment_history trigger (below, now security definer),
--   * the Multi-Branch move / transfer functions (075+, already definer).
-- Reading stays as before (staff all, clients their own).

-- Same body as 043; it now writes with the table owner's rights instead of
-- the caller's, so clients and staff keep booking normally. auth.uid() still
-- records who made the change.
create or replace function log_appointment_history() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if TG_OP = 'INSERT' then
    insert into appointment_history (appointment_id, event_type, from_value, to_value, changed_by)
    values (new.id, 'created', null, coalesce(new.session_status, new.status::text), auth.uid());
    return new;
  end if;
  if old.status is distinct from new.status then
    insert into appointment_history (appointment_id, event_type, from_value, to_value, changed_by)
    values (new.id, 'status_change', old.status::text, new.status::text, auth.uid());
  end if;
  if old.session_status is distinct from new.session_status then
    insert into appointment_history (appointment_id, event_type, from_value, to_value, changed_by)
    values (new.id, 'status_change', coalesce(old.session_status, 'none'), coalesce(new.session_status, 'none'), auth.uid());
  end if;
  if old.scheduled_date is distinct from new.scheduled_date or old.start_time is distinct from new.start_time then
    insert into appointment_history (appointment_id, event_type, from_value, to_value, changed_by)
    values (new.id, 'reschedule', old.scheduled_date::text || ' ' || old.start_time::text, new.scheduled_date::text || ' ' || new.start_time::text, auth.uid());
  end if;
  return new;
end;
$$;

-- No insert policy: signed-in users and visitors can no longer add history.
drop policy if exists "system insert appointment_history" on appointment_history;
