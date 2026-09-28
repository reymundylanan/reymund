create or replace function log_appointment_history() returns trigger as $$
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
$$ language plpgsql;
