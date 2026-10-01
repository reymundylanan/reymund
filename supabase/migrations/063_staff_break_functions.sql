-- 063_staff_break_functions.sql
-- Requires 035, 055. Start / End Break wrote staff_attendance_breaks
-- directly, and the row-level policy only let Front Desk do it when their
-- profile branch exactly matched the attendance row's branch — anything
-- else (a visiting staff member, a mismatched branch) failed with "new row
-- violates row-level security policy". These functions do the check
-- themselves (Admin; or Front Desk at the attendance branch or the staff
-- member's home branch) and explain any refusal.

create or replace function staff_break_check(p_attendance_id uuid) returns staff_attendance
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role text := coalesce(public.current_user_role()::text, '');
  v_my_branch uuid;
  v_home_branch uuid;
  v_att staff_attendance%rowtype;
begin
  select * into v_att from staff_attendance where id = p_attendance_id for update;
  if not found then
    raise exception 'BREAK_INVALID: attendance record not found';
  end if;
  if v_role = 'admin' then
    return v_att;
  end if;
  if v_role <> 'front_desk' then
    raise exception 'BREAK_FORBIDDEN: only Front Desk or Admin can record breaks (this account is "%")', coalesce(nullif(v_role, ''), 'not signed in');
  end if;
  select branch_id into v_my_branch from profiles where id = auth.uid();
  select branch_id into v_home_branch from staff_members where id = v_att.staff_member_id;
  if v_my_branch is null then
    raise exception 'BREAK_FORBIDDEN: this Front Desk account has no branch assigned';
  end if;
  if v_my_branch is distinct from v_att.branch_id and v_my_branch is distinct from v_home_branch then
    raise exception 'BREAK_FORBIDDEN: this staff member is clocked in at another branch';
  end if;
  return v_att;
end;
$$;

revoke execute on function staff_break_check(uuid) from public, anon, authenticated;

create or replace function start_staff_break(p_attendance_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_att staff_attendance%rowtype;
begin
  v_att := staff_break_check(p_attendance_id);
  if v_att.status = 'in_service' then
    raise exception 'BREAK_INVALID: still In Service — cannot start a break while serving a client';
  end if;
  if v_att.status <> 'available' then
    raise exception 'BREAK_INVALID: punch in before starting a break';
  end if;
  insert into staff_attendance_breaks (attendance_id) values (v_att.id);
  update staff_attendance set status = 'on_break', recorded_by = auth.uid(), updated_at = now() where id = v_att.id;
end;
$$;

create or replace function end_staff_break(p_attendance_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_att staff_attendance%rowtype;
begin
  v_att := staff_break_check(p_attendance_id);
  if v_att.status <> 'on_break' then
    return;
  end if;
  update staff_attendance_breaks set break_end = now()
   where attendance_id = v_att.id and break_end is null;
  update staff_attendance set status = 'available', recorded_by = auth.uid(), updated_at = now() where id = v_att.id;
end;
$$;

revoke execute on function start_staff_break(uuid) from public, anon;
revoke execute on function end_staff_break(uuid) from public, anon;
grant execute on function start_staff_break(uuid) to authenticated;
grant execute on function end_staff_break(uuid) to authenticated;

notify pgrst, 'reload schema';
