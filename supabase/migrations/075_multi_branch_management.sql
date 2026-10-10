-- 075: Multi-Branch Kanban Management (Admin).
--
-- Adds the transfer history / audit log and the server-side functions the
-- Admin board uses to move appointments, transfer staff, change where a
-- service is offered, and undo a transfer. Every function:
--   * checks the caller is an Admin (Front Desk keeps its existing features),
--   * re-validates availability inside the transaction under a lock, so a
--     slot taken a moment ago is rejected instead of double-booked,
--   * never deletes or rewrites history: appointments keep their id, payments
--     and history rows; the change is recorded in branch_transfer_log.
-- Errors are raised as 'MB_REJECTED:<CODE>:<message>' for the API to explain.

-- ── Transfer history / audit log ──────────────────────────────────────

create table if not exists branch_transfer_log (
  id uuid primary key default gen_random_uuid(),
  transfer_type text not null check (transfer_type in
    ('appointment_move', 'staff_temporary', 'staff_permanent', 'service_availability')),
  status text not null default 'completed' check (status in ('completed', 'undone')),
  appointment_id uuid references appointments(id) on delete set null,
  staff_member_id uuid references staff_members(id) on delete set null,
  service_id uuid references branch_services(id) on delete set null,
  client_id uuid references profiles(id) on delete set null,
  from_branch_id uuid references branches(id) on delete set null,
  to_branch_id uuid references branches(id) on delete set null,
  from_staff_id uuid references staff_members(id) on delete set null,
  to_staff_id uuid references staff_members(id) on delete set null,
  from_date date,
  from_time time,
  to_date date,
  to_time time,
  dates date[],
  reason text,
  previous jsonb not null default '{}'::jsonb,
  next jsonb not null default '{}'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  notification_id uuid references client_notifications(id) on delete set null,
  messenger_outbox_id uuid references messenger_outbox(id) on delete set null,
  initiated_by uuid references profiles(id) on delete set null,
  undo_of uuid references branch_transfer_log(id) on delete set null,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists branch_transfer_log_created_idx on branch_transfer_log (created_at desc);
create index if not exists branch_transfer_log_appointment_idx on branch_transfer_log (appointment_id);
create index if not exists branch_transfer_log_staff_idx on branch_transfer_log (staff_member_id);

alter table branch_transfer_log enable row level security;

-- Admins read it; rows are only written by the functions below.
drop policy if exists "admin read branch_transfer_log" on branch_transfer_log;
create policy "admin read branch_transfer_log" on branch_transfer_log for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

do $$ begin
  alter publication supabase_realtime add table branch_transfer_log;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table appointments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table staff_members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table branch_services;
exception when duplicate_object then null; end $$;

-- ── Helpers ───────────────────────────────────────────────────────────

create or replace function mb_reject(p_code text, p_message text) returns void
language plpgsql as $$
begin
  raise exception 'MB_REJECTED:%:%', p_code, p_message;
end;
$$;

create or replace function mb_require_admin() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin') then
    perform mb_reject('FORBIDDEN', 'Only Admins can manage branches from the Multi-Branch board');
  end if;
end;
$$;

-- Branch opening hours from branches.hours ("8:00 AM - 7:00 PM"); falls back
-- to the spa-wide booking window when the text can't be read.
create or replace function mb_branch_hours(p_branch_id uuid, out open_at time, out close_at time)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_hours text;
begin
  select hours into v_hours from branches where id = p_branch_id;
  begin
    open_at := btrim(split_part(v_hours, ' - ', 1))::time;
    close_at := btrim(split_part(v_hours, ' - ', 2))::time;
  exception when others then
    open_at := null;
  end;
  if open_at is null or close_at is null or close_at <= open_at then
    select booking_window_start, booking_window_end into open_at, close_at from spa_settings limit 1;
  end if;
end;
$$;

create or replace function mb_minutes(p_time time) returns integer
language sql immutable as $$
  select (extract(hour from p_time) * 60 + extract(minute from p_time))::integer
$$;

-- Full check that a staff member can take [p_start, p_start + p_duration) at
-- p_branch_id on p_date. Raises MB_REJECTED with the first failed rule.
create or replace function mb_assert_slot(
  p_branch_id uuid,
  p_professional_id uuid,
  p_date date,
  p_start time,
  p_duration integer,
  p_exclude_appointment uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_now integer := mb_minutes((now() at time zone 'Asia/Manila')::time);
  v_start integer := mb_minutes(p_start);
  v_end integer := mb_minutes(p_start) + p_duration;
  v_open time;
  v_close time;
  v_branch_status text;
  v_home uuid;
  v_guest boolean;
  v_att record;
  v_busy_until integer;
begin
  if p_duration is null or p_duration <= 0 then
    perform mb_reject('INVALID', 'The appointment has no service duration');
  end if;

  select lower(coalesce(status, 'active')) into v_branch_status from branches where id = p_branch_id;
  if not found then
    perform mb_reject('INVALID', 'That branch no longer exists');
  end if;
  if v_branch_status <> 'active' then
    perform mb_reject('BRANCH_CLOSED', 'The branch is not open for bookings (' || v_branch_status || ')');
  end if;

  select open_at, close_at into v_open, v_close from mb_branch_hours(p_branch_id);
  if v_start < mb_minutes(v_open) or v_end > mb_minutes(v_close) then
    perform mb_reject('OUTSIDE_HOURS', 'The full service must fit between ' || to_char(v_open, 'FMHH12:MI AM')
      || ' and ' || to_char(v_close, 'FMHH12:MI AM'));
  end if;

  if p_date < v_today or (p_date = v_today and v_start <= v_now) then
    perform mb_reject('PAST', 'That time has already passed');
  end if;

  if p_professional_id is null then
    return;
  end if;

  select branch_id into v_home from staff_members where id = p_professional_id;
  if not found then
    perform mb_reject('INVALID', 'That staff member no longer exists');
  end if;
  v_guest := v_home is distinct from p_branch_id and exists (
    select 1 from branch_transfer_requests t
     where t.staff_member_id = p_professional_id and t.target_branch_id = p_branch_id
       and t.status = 'approved' and t.dates @> array[p_date]
  );
  if v_home is distinct from p_branch_id and not v_guest then
    perform mb_reject('NOT_AT_BRANCH', 'This staff member doesn''t work at that branch on that date');
  end if;

  -- Days off, leave, and (for their home branch) days lent to another branch.
  if exists (
    select 1 from staff_shifts s
     where s.staff_member_id = p_professional_id and s.shift_date = p_date
       and not (v_guest and s.source = 'transfer')
       and (s.period = 'full_day'
            or (s.period = 'morning' and v_start < 13 * 60)
            or (s.period = 'afternoon' and v_end > 13 * 60))
  ) then
    perform mb_reject('DAY_OFF', 'This staff member is off (day off, leave or lent out) for that time');
  end if;

  -- Live attendance today.
  if p_date = v_today then
    select a.id, a.status into v_att from staff_attendance a
     where a.staff_member_id = p_professional_id and a.attendance_date = p_date;
    if found then
      if v_att.status = 'out' then
        perform mb_reject('STAFF_OUT', 'This staff member has already punched out today');
      elsif v_att.status = 'in_service' then
        select max(mb_minutes(start_time) + duration_minutes) into v_busy_until from appointments
         where professional_id = p_professional_id and scheduled_date = p_date and session_status = 'in_service';
        if v_start < greatest(coalesce(v_busy_until, 0), v_now + 15) then
          perform mb_reject('IN_SERVICE', 'This staff member is serving a client until about '
            || to_char(make_time(greatest(coalesce(v_busy_until, 0), v_now + 15) / 60 % 24, greatest(coalesce(v_busy_until, 0), v_now + 15) % 60, 0), 'FMHH12:MI AM'));
        end if;
      elsif v_att.status = 'on_break' then
        select max(mb_minutes((b.break_start at time zone 'Asia/Manila')::time)) + 60 into v_busy_until
          from staff_attendance_breaks b where b.attendance_id = v_att.id and b.break_end is null;
        if v_start < coalesce(v_busy_until, v_now + 60) then
          perform mb_reject('ON_BREAK', 'This staff member is on a break');
        end if;
      end if;
    end if;
  end if;

  -- Existing appointments and walk-ins (the whole duration, not just the start).
  if exists (
    select 1 from appointments a
     where a.professional_id = p_professional_id and a.scheduled_date = p_date
       and a.id is distinct from p_exclude_appointment
       and a.status::text in ('pending', 'confirmed')
       and (a.session_status is null or a.session_status <> 'no_show')
       and mb_minutes(a.start_time) < v_end
       and mb_minutes(a.start_time) + a.duration_minutes > v_start
  ) then
    perform mb_reject('SLOT_TAKEN', 'This staff member already has a booking during that time');
  end if;
end;
$$;

-- Departments an appointment's services need (from its line items).
create or replace function mb_appointment_departments(p_appointment_id uuid) returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct s.department) filter (where s.department is not null and s.department <> ''), '{}')
    from (
      select bs.department from appointment_services x join branch_services bs on bs.id = x.service_id
       where x.appointment_id = p_appointment_id
      union all
      select bs.department from appointments a join branch_services bs on bs.id = a.service_id
       where a.id = p_appointment_id
    ) s
$$;

-- The generic "Appointment rescheduled" notice is replaced by the board's own,
-- more detailed one (old and new branch, staff, reason) during a board move.
create or replace function notify_client_rescheduled() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_branch text;
begin
  if coalesce(current_setting('glowsync.board_move', true), '') = 'on' then
    return new;
  end if;
  if new.client_id is null or new.visit_type <> 'appointment'
     or new.status::text in ('cancelled', 'completed')
     or (new.scheduled_date = old.scheduled_date and new.start_time = old.start_time) then
    return new;
  end if;
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

-- ── Move / reschedule an appointment ──────────────────────────────────

create or replace function admin_move_appointment(
  p_appointment_id uuid,
  p_branch_id uuid,
  p_professional_id uuid,
  p_date date,
  p_start time,
  p_reason text,
  p_validation jsonb default '{}'::jsonb,
  p_undo_of uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_appt appointments%rowtype;
  v_from_branch branches%rowtype;
  v_to_branch branches%rowtype;
  v_from_staff text;
  v_to_staff text;
  v_to_dept text;
  v_depts text[];
  v_missing text;
  v_time_changed boolean;
  v_service text;
  v_client_name text;
  v_notice uuid;
  v_outbox uuid;
  v_log uuid;
  v_note text;
  v_history uuid;
begin
  perform mb_require_admin();

  if p_reason is null or btrim(p_reason) = '' then
    perform mb_reject('REASON_REQUIRED', 'Please give a reason for the change');
  end if;

  select * into v_appt from appointments where id = p_appointment_id for update;
  if not found then
    perform mb_reject('INVALID', 'That appointment no longer exists');
  end if;
  if v_appt.status::text not in ('pending', 'confirmed')
     or coalesce(v_appt.session_status, '') in ('in_service', 'completed', 'paid', 'no_show') then
    perform mb_reject('NOT_MOVABLE', 'Only upcoming pending or confirmed appointments can be moved (this one is '
      || coalesce(v_appt.session_status, v_appt.status::text) || ')');
  end if;
  if v_appt.branch_id = p_branch_id and v_appt.professional_id is not distinct from p_professional_id
     and v_appt.scheduled_date = p_date and v_appt.start_time = p_start then
    perform mb_reject('NO_CHANGE', 'Nothing to change — that is the current booking');
  end if;

  -- One mover at a time per staff member and day.
  if p_professional_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_professional_id::text || p_date::text, 75));
  end if;

  perform mb_assert_slot(p_branch_id, p_professional_id, p_date, p_start, v_appt.duration_minutes, v_appt.id);

  -- Qualified: the staff member's department covers every service.
  if p_professional_id is not null then
    select department into v_to_dept from staff_members where id = p_professional_id;
    v_depts := mb_appointment_departments(v_appt.id);
    if cardinality(v_depts) = 0 and v_appt.professional_id is not null then
      select array[department] into v_depts from staff_members where id = v_appt.professional_id and department is not null;
    end if;
    if cardinality(coalesce(v_depts, '{}')) > 0 and not (v_depts <@ array[v_to_dept]) then
      perform mb_reject('NOT_QUALIFIED', 'This staff member (' || coalesce(v_to_dept, 'no department')
        || ') isn''t qualified for ' || array_to_string(v_depts, ', ') || ' services');
    end if;
  end if;

  -- The destination branch must offer every service (matched by name).
  if p_branch_id <> v_appt.branch_id then
    select string_agg(distinct src.name, ', ') into v_missing
      from (
        select bs.name from appointment_services x join branch_services bs on bs.id = x.service_id
         where x.appointment_id = v_appt.id
        union all
        select bs.name from branch_services bs where bs.id = v_appt.service_id
      ) src
     where not exists (
       select 1 from branch_services d
        where d.branch_id = p_branch_id and lower(d.name) = lower(src.name) and d.status = 'Active'
     );
    if v_missing is not null then
      perform mb_reject('SERVICE_UNAVAILABLE', 'The destination branch doesn''t offer ' || v_missing);
    end if;
  end if;

  select * into v_from_branch from branches where id = v_appt.branch_id;
  select * into v_to_branch from branches where id = p_branch_id;
  select full_name into v_from_staff from staff_members where id = v_appt.professional_id;
  select full_name into v_to_staff from staff_members where id = p_professional_id;
  v_time_changed := v_appt.scheduled_date <> p_date or v_appt.start_time <> p_start;

  -- Our detailed notice replaces the generic one for this transaction.
  perform set_config('glowsync.board_move', 'on', true);

  update appointments set
    branch_id = p_branch_id,
    professional_id = p_professional_id,
    scheduled_date = p_date,
    start_time = p_start,
    service_id = case when p_branch_id = v_appt.branch_id or v_appt.service_id is null then v_appt.service_id else (
      select d.id from branch_services d join branch_services o on o.id = v_appt.service_id
       where d.branch_id = p_branch_id and lower(d.name) = lower(o.name) and d.status = 'Active' limit 1) end,
    original_scheduled_date = case when v_time_changed then coalesce(v_appt.original_scheduled_date, v_appt.scheduled_date) else v_appt.original_scheduled_date end,
    original_start_time = case when v_time_changed then coalesce(v_appt.original_start_time, v_appt.start_time) else v_appt.original_start_time end,
    reschedule_count = v_appt.reschedule_count + case when v_time_changed then 1 else 0 end,
    notes = case when v_from_staff is not null and v_to_staff is not null and v_appt.notes is not null
                 then replace(v_appt.notes, ' with ' || v_from_staff, ' with ' || v_to_staff) else v_appt.notes end
  where id = v_appt.id;

  -- Line items point at the destination branch's own services.
  if p_branch_id <> v_appt.branch_id then
    update appointment_services x set service_id = (
      select d.id from branch_services d join branch_services o on o.id = x.service_id
       where d.branch_id = p_branch_id and lower(d.name) = lower(o.name) and d.status = 'Active' limit 1)
     where x.appointment_id = v_appt.id and x.service_id is not null;
  end if;

  v_note := 'Moved by Admin from ' || coalesce(v_from_branch.name, '?')
    || coalesce(' with ' || v_from_staff, '') || ' to ' || coalesce(v_to_branch.name, '?')
    || coalesce(' with ' || v_to_staff, '') || '. Reason: ' || btrim(p_reason);

  -- History: the update trigger logged a date/time change; a branch/staff-only
  -- move is logged here (Messenger sends its "rescheduled" message from it).
  if v_time_changed then
    select id into v_history from appointment_history
     where appointment_id = v_appt.id and event_type = 'reschedule' order by created_at desc limit 1;
    update appointment_history set note = v_note where id = v_history;
  else
    insert into appointment_history (appointment_id, event_type, from_value, to_value, changed_by, note)
    values (v_appt.id, 'reschedule',
            v_appt.scheduled_date::text || ' ' || v_appt.start_time::text,
            p_date::text || ' ' || p_start::text, auth.uid(), v_note);
  end if;

  -- The client's notice (in-app, and by email when they allow it).
  if v_appt.client_id is not null and coalesce(v_appt.visit_type, 'appointment') = 'appointment' then
    select full_name into v_client_name from profiles where id = v_appt.client_id;
    v_service := appointment_service_label(v_appt.id);
    insert into client_notifications (client_id, appointment_id, kind, title, body, link_path)
    values (
      v_appt.client_id, v_appt.id, 'rescheduled', 'Your appointment was moved',
      'Hi ' || coalesce(split_part(v_client_name, ' ', 1), 'there') || ', your ' || coalesce(v_service, 'appointment')
        || ' has moved from ' || coalesce(v_from_branch.name, 'our branch') || ', '
        || to_char(v_appt.scheduled_date, 'Dy, Mon FMDD') || ' at ' || to_char(v_appt.start_time, 'FMHH12:MI AM')
        || ' to ' || coalesce(v_to_branch.name, 'our branch')
        || coalesce(' (' || v_to_branch.address || ')', '') || ', '
        || to_char(p_date, 'Dy, Mon FMDD') || ' at ' || to_char(p_start, 'FMHH12:MI AM')
        || coalesce(' with ' || v_to_staff, '') || '. Reason: ' || btrim(p_reason)
        || '. If the new schedule doesn''t suit you, message us on Messenger'
        || coalesce(' or call ' || v_to_branch.phone, '') || ' and we''ll find another time.',
      '/my-glow/appointments/' || v_appt.id
    )
    returning id into v_notice;

    select id into v_outbox from messenger_outbox
     where appointment_id = v_appt.id and kind = 'appointment_update' and status = 'pending'
     order by created_at desc limit 1;
  end if;

  insert into branch_transfer_log (
    transfer_type, appointment_id, client_id, service_id,
    from_branch_id, to_branch_id, from_staff_id, to_staff_id,
    from_date, from_time, to_date, to_time, reason,
    previous, next, validation, notification_id, messenger_outbox_id, initiated_by, undo_of
  ) values (
    'appointment_move', v_appt.id, v_appt.client_id, v_appt.service_id,
    v_appt.branch_id, p_branch_id, v_appt.professional_id, p_professional_id,
    v_appt.scheduled_date, v_appt.start_time, p_date, p_start, btrim(p_reason),
    jsonb_build_object('branch', v_from_branch.name, 'staff', v_from_staff, 'date', v_appt.scheduled_date, 'time', v_appt.start_time, 'status', v_appt.status),
    jsonb_build_object('branch', v_to_branch.name, 'address', v_to_branch.address, 'staff', v_to_staff, 'date', p_date, 'time', p_start),
    coalesce(p_validation, '{}'::jsonb), v_notice, v_outbox, auth.uid(), p_undo_of
  ) returning id into v_log;

  return v_log;
end;
$$;

-- ── Transfer a staff member ───────────────────────────────────────────

create or replace function admin_transfer_staff(
  p_staff_id uuid,
  p_to_branch uuid,
  p_kind text,
  p_dates date[],
  p_reason text,
  p_validation jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_staff staff_members%rowtype;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_dates date[];
  v_bad text;
  v_from text;
  v_to text;
  v_log uuid;
begin
  perform mb_require_admin();
  perform pg_advisory_xact_lock(hashtextextended(p_staff_id::text, 76));

  select * into v_staff from staff_members where id = p_staff_id for update;
  if not found then
    perform mb_reject('INVALID', 'That staff member no longer exists');
  end if;
  if v_staff.branch_id is not distinct from p_to_branch then
    perform mb_reject('NO_CHANGE', 'They already belong to that branch');
  end if;
  if not exists (select 1 from branches where id = p_to_branch and lower(coalesce(status, 'active')) = 'active') then
    perform mb_reject('BRANCH_CLOSED', 'The destination branch is not open');
  end if;
  select name into v_from from branches where id = v_staff.branch_id;
  select name into v_to from branches where id = p_to_branch;

  if p_kind = 'permanent' then
    if p_reason is null or btrim(p_reason) = '' then
      perform mb_reject('REASON_REQUIRED', 'A permanent transfer needs a reason');
    end if;
    if exists (select 1 from staff_attendance where staff_member_id = p_staff_id and attendance_date = v_today and status = 'in_service') then
      perform mb_reject('IN_SERVICE', 'They are serving a client right now — try again once the service finishes');
    end if;

    update staff_members set branch_id = p_to_branch where id = p_staff_id;

    insert into branch_transfer_log (transfer_type, staff_member_id, from_branch_id, to_branch_id, to_date, reason, previous, next, validation, initiated_by)
    values ('staff_permanent', p_staff_id, v_staff.branch_id, p_to_branch, v_today, btrim(p_reason),
            jsonb_build_object('branch', v_from, 'staff', v_staff.full_name),
            jsonb_build_object('branch', v_to, 'staff', v_staff.full_name),
            coalesce(p_validation, '{}'::jsonb), auth.uid())
    returning id into v_log;
    return v_log;
  end if;

  if p_kind <> 'temporary' then
    perform mb_reject('INVALID', 'Unknown transfer type');
  end if;

  select array_agg(distinct d order by d) into v_dates from unnest(p_dates) d;
  if v_dates is null or cardinality(v_dates) < 1 or cardinality(v_dates) > 15 then
    perform mb_reject('INVALID', 'Pick between 1 and 15 dates');
  end if;
  if v_staff.branch_id is null then
    perform mb_reject('NO_HOME', 'They need a home branch before they can be lent out');
  end if;
  if v_dates[1] < v_today then
    perform mb_reject('PAST', 'One of the dates has already passed');
  end if;

  if v_today = any(v_dates) and exists (
    select 1 from staff_attendance where staff_member_id = p_staff_id and attendance_date = v_today and status in ('in_service', 'on_break')
  ) then
    perform mb_reject('IN_SERVICE', 'They are serving a client or on a break right now — start the transfer tomorrow, or once they are free');
  end if;

  select string_agg(to_char(s.shift_date, 'Mon FMDD'), ', ' order by s.shift_date) into v_bad
    from staff_shifts s where s.staff_member_id = p_staff_id and s.shift_date = any(v_dates);
  if v_bad is not null then
    perform mb_reject('DAY_OFF', 'They are already off, on leave or lent out on ' || v_bad);
  end if;

  select string_agg(distinct to_char(d, 'Mon FMDD'), ', ') into v_bad
    from branch_transfer_requests t, unnest(t.dates) d
   where t.staff_member_id = p_staff_id and t.status = 'approved' and d = any(v_dates);
  if v_bad is not null then
    perform mb_reject('ALREADY_LENT', 'They are already lent to another branch on ' || v_bad);
  end if;

  select string_agg(to_char(a.scheduled_date, 'Mon FMDD') || ' ' || to_char(a.start_time, 'FMHH12:MI AM'), ', ' order by a.scheduled_date, a.start_time) into v_bad
    from appointments a
   where a.professional_id = p_staff_id and a.scheduled_date = any(v_dates)
     and a.status::text in ('pending', 'confirmed') and (a.session_status is null or a.session_status <> 'no_show');
  if v_bad is not null then
    perform mb_reject('HAS_APPOINTMENTS', 'They have bookings on those dates (' || v_bad || ') — move those first');
  end if;

  insert into staff_shifts (staff_member_id, branch_id, shift_date, period, source)
  select p_staff_id, v_staff.branch_id, d, 'full_day', 'transfer' from unnest(v_dates) d;

  insert into branch_transfer_requests (staff_member_id, target_branch_id, dates, reason, status, decided_at)
  values (p_staff_id, p_to_branch, v_dates, nullif(btrim(coalesce(p_reason, '')), ''), 'approved', now());

  insert into branch_transfer_log (transfer_type, staff_member_id, from_branch_id, to_branch_id, from_date, to_date, dates, reason, previous, next, validation, initiated_by)
  values ('staff_temporary', p_staff_id, v_staff.branch_id, p_to_branch, v_dates[1], v_dates[cardinality(v_dates)], v_dates,
          nullif(btrim(coalesce(p_reason, '')), ''),
          jsonb_build_object('branch', v_from, 'staff', v_staff.full_name),
          jsonb_build_object('branch', v_to, 'staff', v_staff.full_name, 'dates', v_dates),
          coalesce(p_validation, '{}'::jsonb), auth.uid())
  returning id into v_log;
  return v_log;
end;
$$;

-- ── Where a service is offered ────────────────────────────────────────

create or replace function admin_set_service_availability(
  p_service_id uuid,
  p_active boolean,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_svc branch_services%rowtype;
  v_branch text;
  v_affected integer;
  v_log uuid;
begin
  perform mb_require_admin();
  select * into v_svc from branch_services where id = p_service_id for update;
  if not found then
    perform mb_reject('INVALID', 'That service no longer exists');
  end if;
  if (v_svc.status = 'Active') = p_active then
    perform mb_reject('NO_CHANGE', 'Nothing to change');
  end if;
  select name into v_branch from branches where id = v_svc.branch_id;

  -- Existing bookings are NOT moved; they are counted for the Admin to review.
  select count(*) into v_affected from appointments a
   where (a.service_id = v_svc.id or exists (select 1 from appointment_services x where x.appointment_id = a.id and x.service_id = v_svc.id))
     and a.scheduled_date >= (now() at time zone 'Asia/Manila')::date
     and a.status::text in ('pending', 'confirmed');

  update branch_services set status = case when p_active then 'Active' else 'Inactive' end where id = v_svc.id;

  insert into branch_transfer_log (transfer_type, service_id, from_branch_id, to_branch_id, reason, previous, next, validation, initiated_by)
  values ('service_availability', v_svc.id, v_svc.branch_id, v_svc.branch_id, nullif(btrim(coalesce(p_reason, '')), ''),
          jsonb_build_object('service', v_svc.name, 'branch', v_branch, 'status', v_svc.status),
          jsonb_build_object('service', v_svc.name, 'branch', v_branch, 'status', case when p_active then 'Active' else 'Inactive' end),
          jsonb_build_object('upcoming_appointments', v_affected), auth.uid())
  returning id into v_log;
  return v_log;
end;
$$;

-- Offer a service at another branch (a copy of it there, or re-activating it).
create or replace function admin_offer_service_at_branch(
  p_source_service_id uuid,
  p_branch_id uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_src branch_services%rowtype;
  v_existing branch_services%rowtype;
  v_new uuid;
  v_branch text;
  v_log uuid;
begin
  perform mb_require_admin();
  select * into v_src from branch_services where id = p_source_service_id;
  if not found then
    perform mb_reject('INVALID', 'That service no longer exists');
  end if;
  select * into v_existing from branch_services where branch_id = p_branch_id and lower(name) = lower(v_src.name) limit 1;
  if found then
    if v_existing.status = 'Active' then
      perform mb_reject('NO_CHANGE', 'That branch already offers it');
    end if;
    return admin_set_service_availability(v_existing.id, true, p_reason);
  end if;

  insert into branch_services (branch_id, name, department, category, duration, price, price_41, description, benefits, status,
                               addons, hair_options, brows_type, body_wellness_type, facial_options, laser_type, slimming_type,
                               non_surgical_type, doctor_type, cocktail_type)
  values (p_branch_id, v_src.name, v_src.department, v_src.category, v_src.duration, v_src.price, v_src.price_41, v_src.description,
          v_src.benefits, 'Active', v_src.addons, v_src.hair_options, v_src.brows_type, v_src.body_wellness_type, v_src.facial_options,
          v_src.laser_type, v_src.slimming_type, v_src.non_surgical_type, v_src.doctor_type, v_src.cocktail_type)
  returning id into v_new;

  select name into v_branch from branches where id = p_branch_id;
  insert into branch_transfer_log (transfer_type, service_id, to_branch_id, reason, previous, next, initiated_by)
  values ('service_availability', v_new, p_branch_id, nullif(btrim(coalesce(p_reason, '')), ''),
          jsonb_build_object('service', v_src.name, 'branch', v_branch, 'status', 'Not offered'),
          jsonb_build_object('service', v_src.name, 'branch', v_branch, 'status', 'Active'), auth.uid())
  returning id into v_log;
  return v_log;
end;
$$;

-- ── Undo (only when it's still safe) ──────────────────────────────────

create or replace function admin_undo_transfer(p_log_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_log branch_transfer_log%rowtype;
  v_appt appointments%rowtype;
  v_new uuid;
begin
  perform mb_require_admin();
  select * into v_log from branch_transfer_log where id = p_log_id for update;
  if not found then
    perform mb_reject('INVALID', 'That transfer no longer exists');
  end if;
  if v_log.status <> 'completed' then
    perform mb_reject('NOT_UNDOABLE', 'It has already been undone');
  end if;

  if v_log.transfer_type = 'appointment_move' then
    select * into v_appt from appointments where id = v_log.appointment_id;
    if not found or v_appt.branch_id is distinct from v_log.to_branch_id
       or v_appt.professional_id is distinct from v_log.to_staff_id
       or v_appt.scheduled_date is distinct from v_log.to_date or v_appt.start_time is distinct from v_log.to_time then
      perform mb_reject('CHANGED_SINCE', 'The appointment has changed since — undo is no longer safe');
    end if;
    -- Re-validates the original slot like any other move.
    v_new := admin_move_appointment(v_appt.id, v_log.from_branch_id, v_log.from_staff_id, v_log.from_date, v_log.from_time,
                                    'Undo of an earlier move' || coalesce(' (' || v_log.reason || ')', ''), '{}'::jsonb, v_log.id);
  elsif v_log.transfer_type = 'staff_permanent' then
    if not exists (select 1 from staff_members where id = v_log.staff_member_id and branch_id is not distinct from v_log.to_branch_id) then
      perform mb_reject('CHANGED_SINCE', 'Their branch has changed since — undo is no longer safe');
    end if;
    update staff_members set branch_id = v_log.from_branch_id where id = v_log.staff_member_id;
    insert into branch_transfer_log (transfer_type, staff_member_id, from_branch_id, to_branch_id, reason, previous, next, initiated_by, undo_of)
    values ('staff_permanent', v_log.staff_member_id, v_log.to_branch_id, v_log.from_branch_id, 'Undo of an earlier transfer',
            v_log.next, v_log.previous, auth.uid(), v_log.id)
    returning id into v_new;
  elsif v_log.transfer_type = 'staff_temporary' then
    if exists (
      select 1 from appointments a
       where a.professional_id = v_log.staff_member_id and a.branch_id = v_log.to_branch_id
         and a.scheduled_date = any(v_log.dates) and a.status::text in ('pending', 'confirmed')
    ) then
      perform mb_reject('CHANGED_SINCE', 'They already have bookings at the other branch on those dates — move those first');
    end if;
    delete from staff_shifts
     where staff_member_id = v_log.staff_member_id and branch_id = v_log.from_branch_id
       and source = 'transfer' and shift_date = any(v_log.dates);
    update branch_transfer_requests set status = 'denied', decided_at = now()
     where staff_member_id = v_log.staff_member_id and target_branch_id = v_log.to_branch_id
       and status = 'approved' and dates = v_log.dates;
    insert into branch_transfer_log (transfer_type, staff_member_id, from_branch_id, to_branch_id, dates, reason, previous, next, initiated_by, undo_of)
    values ('staff_temporary', v_log.staff_member_id, v_log.to_branch_id, v_log.from_branch_id, v_log.dates, 'Undo of an earlier transfer',
            v_log.next, v_log.previous, auth.uid(), v_log.id)
    returning id into v_new;
  else
    perform mb_reject('NOT_UNDOABLE', 'Change the service availability back from the Services tab instead');
  end if;

  update branch_transfer_log set status = 'undone', undone_at = now() where id = v_log.id;
  return v_new;
end;
$$;

revoke execute on function mb_require_admin() from public, anon;
revoke execute on function mb_assert_slot(uuid, uuid, date, time, integer, uuid) from public, anon;
revoke execute on function admin_move_appointment(uuid, uuid, uuid, date, time, text, jsonb, uuid) from public, anon;
revoke execute on function admin_transfer_staff(uuid, uuid, text, date[], text, jsonb) from public, anon;
revoke execute on function admin_set_service_availability(uuid, boolean, text) from public, anon;
revoke execute on function admin_offer_service_at_branch(uuid, uuid, text) from public, anon;
revoke execute on function admin_undo_transfer(uuid) from public, anon;
grant execute on function admin_move_appointment(uuid, uuid, uuid, date, time, text, jsonb, uuid) to authenticated;
grant execute on function admin_transfer_staff(uuid, uuid, text, date[], text, jsonb) to authenticated;
grant execute on function admin_set_service_availability(uuid, boolean, text) to authenticated;
grant execute on function admin_offer_service_at_branch(uuid, uuid, text) to authenticated;
grant execute on function admin_undo_transfer(uuid) to authenticated;

notify pgrst, 'reload schema';
