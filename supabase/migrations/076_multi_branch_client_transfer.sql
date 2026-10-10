-- 076: Multi-Branch — transfer a client (account or walk-in) to another branch.
--
-- A client's records (visits, payments, GlowPoints, vouchers, reviews) belong
-- to the client, not to a branch, so they all go with them: every branch's
-- front desk sees the same history. What changes:
--   * an account client's home branch (profiles.branch_id) becomes the new one;
--   * the upcoming bookings the Admin ticks are moved to the new branch, each
--     through admin_move_appointment (full re-check under a lock, client notice).
-- Past visits keep the branch where they actually happened, so each branch's
-- sales, payments and reports stay true. If any chosen booking can't be moved,
-- nothing at all is changed (one transaction).

alter table branch_transfer_log drop constraint if exists branch_transfer_log_transfer_type_check;
alter table branch_transfer_log add constraint branch_transfer_log_transfer_type_check
  check (transfer_type in ('appointment_move', 'staff_temporary', 'staff_permanent', 'service_availability', 'client_transfer'));

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
  if not exists (select 1 from branches where id = p_to_branch and lower(coalesce(status, 'active')) = 'active') then
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

revoke execute on function admin_transfer_client(uuid, text, text, uuid, text, jsonb) from public, anon;
grant execute on function admin_transfer_client(uuid, text, text, uuid, text, jsonb) to authenticated;

-- Undo now also covers a client's home branch (moved bookings are undone from
-- their own history entries, each re-checked).
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
  elsif v_log.transfer_type = 'client_transfer' then
    if v_log.client_id is null then
      perform mb_reject('NOT_UNDOABLE', 'A walk-in has no home branch — undo each moved visit from its own history entry');
    end if;
    if not exists (select 1 from profiles where id = v_log.client_id and branch_id is not distinct from v_log.to_branch_id) then
      perform mb_reject('CHANGED_SINCE', 'Their home branch has changed since — undo is no longer safe');
    end if;
    update profiles set branch_id = v_log.from_branch_id where id = v_log.client_id;
    insert into branch_transfer_log (transfer_type, client_id, from_branch_id, to_branch_id, reason, previous, next, initiated_by, undo_of)
    values ('client_transfer', v_log.client_id, v_log.to_branch_id, v_log.from_branch_id,
            'Undo of an earlier transfer (moved bookings are undone from their own entries)', v_log.next, v_log.previous, auth.uid(), v_log.id)
    returning id into v_new;
  else
    perform mb_reject('NOT_UNDOABLE', 'Change the service availability back from the Services tab instead');
  end if;

  update branch_transfer_log set status = 'undone', undone_at = now() where id = v_log.id;
  return v_new;
end;
$$;

revoke execute on function admin_undo_transfer(uuid) from public, anon;
grant execute on function admin_undo_transfer(uuid) to authenticated;

notify pgrst, 'reload schema';
