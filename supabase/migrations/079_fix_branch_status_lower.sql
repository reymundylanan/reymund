-- 079: fix "function lower(branch_status) does not exist".
-- branches.status is the enum branch_status ('active', 'maintenance', 'inactive');
-- lower() needs text, so the branch-open check in these three functions failed
-- on every appointment move, staff transfer and client transfer. These are the
-- same functions as in 075/076 with the status read as text — nothing else changes.

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

  select lower(coalesce(status::text, 'active')) into v_branch_status from branches where id = p_branch_id;
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
  if not exists (select 1 from branches where id = p_to_branch and lower(coalesce(status::text, 'active')) = 'active') then
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

create or replace function admin_transfer_client(
  p_client_id uuid,
  p_walkin_name text,
  p_walkin_phone text,
  p_to_branch uuid,
  p_reason text,
  p_moves jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_profile profiles%rowtype;
  v_from uuid;
  v_from_name text;
  v_to_name text;
  v_name text;
  v_move jsonb;
  v_appt appointments%rowtype;
  v_moved integer := 0;
  v_visits integer;
  v_spend numeric;
  v_log uuid;
begin
  perform mb_require_admin();

  if p_reason is null or btrim(p_reason) = '' then
    perform mb_reject('REASON_REQUIRED', 'Please give a reason for the transfer');
  end if;
  if not exists (select 1 from branches where id = p_to_branch and lower(coalesce(status::text, 'active')) = 'active') then
    perform mb_reject('BRANCH_CLOSED', 'The destination branch is not open');
  end if;
  select name into v_to_name from branches where id = p_to_branch;

  if p_client_id is not null then
    select * into v_profile from profiles where id = p_client_id for update;
    if not found or v_profile.role::text <> 'customer' then
      perform mb_reject('INVALID', 'That client account no longer exists');
    end if;
    v_from := v_profile.branch_id;
    v_name := v_profile.full_name;
  elsif coalesce(btrim(p_walkin_name), '') = '' then
    perform mb_reject('INVALID', 'Missing client');
  else
    v_name := btrim(p_walkin_name);
    -- A walk-in has no account; "their branch" is where they last visited.
    select branch_id into v_from from appointments
     where client_id is null and walkin_name = p_walkin_name
       and coalesce(walkin_phone, '') = coalesce(p_walkin_phone, '')
     order by scheduled_date desc, start_time desc limit 1;
  end if;
  select name into v_from_name from branches where id = v_from;

  -- Move each chosen upcoming booking (validated and notified one by one).
  for v_move in select * from jsonb_array_elements(coalesce(p_moves, '[]'::jsonb)) loop
    select * into v_appt from appointments where id = (v_move->>'appointment_id')::uuid;
    if not found then
      perform mb_reject('INVALID', 'One of the bookings no longer exists');
    end if;
    if p_client_id is not null and v_appt.client_id is distinct from p_client_id then
      perform mb_reject('INVALID', 'A booking doesn''t belong to this client');
    end if;
    if p_client_id is null and (v_appt.client_id is not null or v_appt.walkin_name is distinct from p_walkin_name
        or coalesce(v_appt.walkin_phone, '') <> coalesce(p_walkin_phone, '')) then
      perform mb_reject('INVALID', 'A booking doesn''t belong to this walk-in client');
    end if;
    if (v_move->>'branch_id')::uuid <> p_to_branch then
      perform mb_reject('INVALID', 'Every moved booking must go to the destination branch');
    end if;
    perform admin_move_appointment(
      v_appt.id,
      p_to_branch,
      nullif(v_move->>'professional_id', '')::uuid,
      (v_move->>'date')::date,
      (v_move->>'start')::time,
      btrim(p_reason) || ' (client moved to ' || coalesce(v_to_name, 'another branch') || ')',
      coalesce(v_move->'validation', '{}'::jsonb)
    );
    v_moved := v_moved + 1;
  end loop;

  if p_client_id is not null then
    if v_from is not distinct from p_to_branch and v_moved = 0 then
      perform mb_reject('NO_CHANGE', 'They already belong to that branch');
    end if;
    update profiles set branch_id = p_to_branch where id = p_client_id;
  elsif v_moved = 0 then
    perform mb_reject('NO_CHANGE', 'A walk-in client has no account to move — choose at least one upcoming visit to move');
  end if;

  -- Their records, for the history (nothing here is rewritten).
  select count(*) into v_visits from appointments a
   where (case when p_client_id is not null then a.client_id = p_client_id
               else a.client_id is null and a.walkin_name = p_walkin_name and coalesce(a.walkin_phone, '') = coalesce(p_walkin_phone, '') end)
     and a.status::text <> 'cancelled'
     and (a.status::text = 'completed' or coalesce(a.session_status, '') in ('completed', 'paid'));
  select coalesce(sum(p.amount), 0) into v_spend from payments p join appointments a on a.id = p.appointment_id
   where p.status = 'settled'
     and (case when p_client_id is not null then a.client_id = p_client_id
               else a.client_id is null and a.walkin_name = p_walkin_name and coalesce(a.walkin_phone, '') = coalesce(p_walkin_phone, '') end);

  insert into branch_transfer_log (transfer_type, client_id, from_branch_id, to_branch_id, reason, previous, next, validation, initiated_by)
  values (
    'client_transfer', p_client_id, v_from, p_to_branch, btrim(p_reason),
    jsonb_build_object('client', v_name, 'phone', coalesce(v_profile.phone, p_walkin_phone), 'branch', coalesce(v_from_name, 'No home branch'),
                       'type', case when p_client_id is null then 'Walk-in' else 'Account' end),
    jsonb_build_object('client', v_name, 'branch', v_to_name, 'moved_bookings', v_moved),
    jsonb_build_object('past_visits', v_visits, 'settled_payments', v_spend, 'records', 'kept with the client; past visits stay at the branch where they happened'),
    auth.uid()
  ) returning id into v_log;
  return v_log;
end;
$$;
