-- 077: Walk-in transfers — when a walk-in's service can't be done at the
-- current branch, the Front Desk books it at another branch (with the client's
-- agreement). The walk-in request is kept as its own record and linked to the
-- booking it became at the destination.
--
--   * Front Desk may only start transfers from its own branch; Admin from any.
--   * The destination slot is re-checked under a lock (mb_assert_slot, 075):
--     never into an occupied or invalid slot, never shortened.
--   * The destination booking is an ordinary confirmed appointment, so the
--     receiving Front Desk checks the client in and starts the service with the
--     existing workflow. Nothing is marked In Service at either branch here.
--   * Statuses after confirmation come from that booking (arrived, in service,
--     done, cancelled), so there is one source of truth.

create table if not exists walkin_transfers (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'awaiting_approval'
    check (status in ('waiting_availability', 'awaiting_approval', 'confirmed', 'cancelled')),
  origin_branch_id uuid not null references branches(id) on delete restrict,
  dest_branch_id uuid references branches(id) on delete set null,
  client_id uuid references profiles(id) on delete set null,
  walkin_name text not null check (length(btrim(walkin_name)) between 1 and 120),
  walkin_phone text,
  services jsonb not null default '[]'::jsonb,
  duration_minutes integer not null check (duration_minutes between 5 and 720),
  origin_price numeric,
  price numeric,
  requested_date date not null,
  requested_time time,
  professional_id uuid references staff_members(id) on delete set null,
  proposed_date date,
  proposed_time time,
  mode text check (mode in ('immediate', 'later')),
  travel_minutes integer,
  dest_appointment_id uuid references appointments(id) on delete set null,
  notes text,
  cancel_reason text,
  initiated_by uuid references profiles(id) on delete set null,
  client_approved_at timestamptz,
  confirmed_by uuid references profiles(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists walkin_transfers_origin_idx on walkin_transfers (origin_branch_id, created_at desc);
create index if not exists walkin_transfers_dest_idx on walkin_transfers (dest_branch_id, proposed_date);
create unique index if not exists walkin_transfers_one_booking on walkin_transfers (dest_appointment_id) where dest_appointment_id is not null;

alter table walkin_transfers enable row level security;

drop policy if exists "read walkin_transfers" on walkin_transfers;
create policy "read walkin_transfers" on walkin_transfers for select using (
  exists (
    select 1 from profiles p where p.id = auth.uid()
      and (p.role = 'admin' or (p.role = 'front_desk' and p.branch_id in (walkin_transfers.origin_branch_id, walkin_transfers.dest_branch_id)))
  )
);
-- Writes only through the functions below.

do $$ begin
  alter publication supabase_realtime add table walkin_transfers;
exception when duplicate_object then null; end $$;

alter table branch_transfer_log drop constraint if exists branch_transfer_log_transfer_type_check;
alter table branch_transfer_log add constraint branch_transfer_log_transfer_type_check
  check (transfer_type in ('appointment_move', 'staff_temporary', 'staff_permanent', 'service_availability', 'client_transfer', 'walkin_transfer'));

-- Admin, or Front Desk of the origin branch.
create or replace function mb_require_walkin_access(p_origin_branch uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from profiles p where p.id = auth.uid()
      and (p.role = 'admin' or (p.role = 'front_desk' and p.branch_id = p_origin_branch))
  ) then
    perform mb_reject('FORBIDDEN', 'Only Admin or this branch''s Front Desk can transfer its walk-ins');
  end if;
end;
$$;

-- Keep a walk-in request that isn't booked yet: waiting for availability, or
-- an option shown to the client who hasn't agreed yet. Reserves nothing.
create or replace function save_walkin_transfer_request(
  p_id uuid,
  p_status text,
  p_origin_branch uuid,
  p_client_id uuid,
  p_walkin_name text,
  p_walkin_phone text,
  p_services jsonb,
  p_duration integer,
  p_origin_price numeric,
  p_requested_date date,
  p_requested_time time,
  p_dest_branch uuid,
  p_professional_id uuid,
  p_proposed_date date,
  p_proposed_time time,
  p_mode text,
  p_notes text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  perform mb_require_walkin_access(p_origin_branch);
  if p_status not in ('waiting_availability', 'awaiting_approval') then
    perform mb_reject('INVALID', 'Unknown status');
  end if;
  if p_id is not null then
    update walkin_transfers set
      status = p_status, dest_branch_id = p_dest_branch, professional_id = p_professional_id,
      proposed_date = p_proposed_date, proposed_time = p_proposed_time, mode = p_mode,
      notes = coalesce(p_notes, notes), updated_at = now()
    where id = p_id and origin_branch_id = p_origin_branch and status in ('waiting_availability', 'awaiting_approval')
    returning id into v_id;
    if v_id is null then
      perform mb_reject('INVALID', 'That walk-in request can no longer be changed');
    end if;
    return v_id;
  end if;
  insert into walkin_transfers (status, origin_branch_id, client_id, walkin_name, walkin_phone, services, duration_minutes,
                                origin_price, requested_date, requested_time, dest_branch_id, professional_id,
                                proposed_date, proposed_time, mode, notes, initiated_by)
  values (p_status, p_origin_branch, p_client_id, btrim(p_walkin_name), nullif(btrim(coalesce(p_walkin_phone, '')), ''),
          coalesce(p_services, '[]'::jsonb), p_duration, p_origin_price, p_requested_date, p_requested_time, p_dest_branch,
          p_professional_id, p_proposed_date, p_proposed_time, p_mode, p_notes, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- The client agreed: book the destination slot (re-checked under a lock).
-- p_services: [{ "service_id": <destination branch_services id>, "name": "...", "price": 0 }]
create or replace function confirm_walkin_transfer(
  p_id uuid,
  p_origin_branch uuid,
  p_client_id uuid,
  p_walkin_name text,
  p_walkin_phone text,
  p_services jsonb,
  p_duration integer,
  p_origin_price numeric,
  p_requested_date date,
  p_requested_time time,
  p_dest_branch uuid,
  p_professional_id uuid,
  p_date date,
  p_start time,
  p_mode text,
  p_travel_minutes integer,
  p_notes text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := p_id;
  v_svc jsonb;
  v_row branch_services%rowtype;
  v_staff staff_members%rowtype;
  v_origin branches%rowtype;
  v_dest branches%rowtype;
  v_names text[] := '{}';
  v_first uuid;
  v_price numeric := 0;
  v_code text;
  v_appt uuid;
  v_pos integer := 0;
  v_notice uuid;
  v_outbox uuid;
  v_log uuid;
begin
  perform mb_require_walkin_access(p_origin_branch);
  if p_professional_id is null then
    perform mb_reject('INVALID', 'Choose the staff member at the destination');
  end if;
  if jsonb_array_length(coalesce(p_services, '[]'::jsonb)) = 0 then
    perform mb_reject('INVALID', 'No services chosen');
  end if;

  select * into v_origin from branches where id = p_origin_branch;
  select * into v_dest from branches where id = p_dest_branch;
  select * into v_staff from staff_members where id = p_professional_id;

  -- One booking per staff member and day at a time (same lock as 075's moves).
  perform pg_advisory_xact_lock(hashtextextended(p_professional_id::text || p_date::text, 75));
  perform mb_assert_slot(p_dest_branch, p_professional_id, p_date, p_start, p_duration, null);

  -- Every service must be an active service of the destination, and the staff
  -- member's department must cover it.
  for v_svc in select * from jsonb_array_elements(p_services) loop
    select * into v_row from branch_services where id = (v_svc->>'service_id')::uuid;
    if not found or v_row.branch_id <> p_dest_branch or v_row.status <> 'Active' then
      perform mb_reject('SERVICE_UNAVAILABLE', coalesce(v_dest.name, 'The destination') || ' doesn''t offer ' || coalesce(v_svc->>'name', 'that service'));
    end if;
    if v_row.department is distinct from v_staff.department then
      perform mb_reject('NOT_QUALIFIED', coalesce(v_staff.full_name, 'This staff member') || ' isn''t qualified for ' || v_row.name);
    end if;
    v_first := coalesce(v_first, v_row.id);
    v_names := v_names || coalesce(nullif(v_svc->>'name', ''), v_row.name);
    v_price := v_price + coalesce((v_svc->>'price')::numeric, v_row.price, 0);
  end loop;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  insert into appointments (booking_code, branch_id, client_id, walkin_name, walkin_phone, professional_id, service_id,
                            appointment_type, scheduled_date, start_time, duration_minutes, status, visit_type,
                            confirmed_at, confirmed_by, notes)
  values (v_code, p_dest_branch, p_client_id,
          case when p_client_id is null then btrim(p_walkin_name) end,
          case when p_client_id is null then nullif(btrim(coalesce(p_walkin_phone, '')), '') end,
          p_professional_id, v_first, 'solo', p_date, p_start, p_duration, 'confirmed', 'appointment',
          now(), auth.uid(),
          array_to_string(v_names, ', ') || ' with ' || coalesce(v_staff.full_name, 'staff') || ' — ₱' || to_char(v_price, 'FM999,999,990') || '.00'
            || ' · Walk-in transfer from ' || coalesce(v_origin.name, 'another branch'))
  returning id into v_appt;

  for v_svc in select * from jsonb_array_elements(p_services) loop
    insert into appointment_services (appointment_id, position, service_id, service_name)
    values (v_appt, v_pos, (v_svc->>'service_id')::uuid, left(coalesce(nullif(v_svc->>'name', ''), 'Service'), 200));
    v_pos := v_pos + 1;
  end loop;

  if v_id is not null then
    update walkin_transfers set
      status = 'confirmed', dest_branch_id = p_dest_branch, professional_id = p_professional_id,
      proposed_date = p_date, proposed_time = p_start, mode = p_mode, travel_minutes = p_travel_minutes,
      services = p_services, duration_minutes = p_duration, price = v_price, dest_appointment_id = v_appt,
      client_approved_at = now(), confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now(),
      notes = coalesce(p_notes, notes)
    where id = v_id and origin_branch_id = p_origin_branch and status in ('waiting_availability', 'awaiting_approval');
    if not found then
      perform mb_reject('INVALID', 'That walk-in request was already handled');
    end if;
  else
    insert into walkin_transfers (status, origin_branch_id, dest_branch_id, client_id, walkin_name, walkin_phone, services,
                                  duration_minutes, origin_price, price, requested_date, requested_time, professional_id,
                                  proposed_date, proposed_time, mode, travel_minutes, dest_appointment_id, notes,
                                  initiated_by, client_approved_at, confirmed_by, confirmed_at)
    values ('confirmed', p_origin_branch, p_dest_branch, p_client_id, btrim(p_walkin_name), nullif(btrim(coalesce(p_walkin_phone, '')), ''),
            p_services, p_duration, p_origin_price, v_price, p_requested_date, p_requested_time, p_professional_id,
            p_date, p_start, p_mode, p_travel_minutes, v_appt, p_notes, auth.uid(), now(), auth.uid(), now())
    returning id into v_id;
  end if;

  -- Tell a client with an account (in-app + Gmail; Messenger when linked).
  if p_client_id is not null then
    insert into client_notifications (client_id, appointment_id, kind, title, body, link_path)
    values (
      p_client_id, v_appt, 'confirmed', 'Your booking at ' || coalesce(v_dest.name, 'our other branch'),
      'Hi ' || coalesce(split_part(btrim(p_walkin_name), ' ', 1), 'there') || ', your ' || array_to_string(v_names, ', ')
        || ' is booked at ' || coalesce(v_dest.name, 'our other branch') || coalesce(' (' || v_dest.address || ')', '')
        || ' on ' || to_char(p_date, 'Dy, Mon FMDD') || ' at ' || to_char(p_start, 'FMHH12:MI AM')
        || ' with ' || coalesce(v_staff.full_name, 'our staff') || '. Please arrive a few minutes early and tell the front desk your name'
        || coalesce(' — booking #' || v_code, '') || '.' || coalesce(' Questions? Call ' || v_dest.phone || '.', ''),
      '/my-glow/appointments/' || v_appt
    ) returning id into v_notice;

    if exists (select 1 from messenger_subscriptions s where s.profile_id = p_client_id and s.opted_out_at is null) then
      insert into messenger_outbox (profile_id, kind, appointment_id, update_type, link_path)
      values (p_client_id, 'appointment_update', v_appt, 'confirmed', '/my-glow/appointments/' || v_appt)
      returning id into v_outbox;
    end if;
  end if;

  insert into branch_transfer_log (transfer_type, appointment_id, client_id, service_id, from_branch_id, to_branch_id, to_staff_id,
                                   from_date, from_time, to_date, to_time, reason, previous, next, validation,
                                   notification_id, messenger_outbox_id, initiated_by)
  values ('walkin_transfer', v_appt, p_client_id, v_first, p_origin_branch, p_dest_branch, p_professional_id,
          p_requested_date, p_requested_time, p_date, p_start, nullif(btrim(coalesce(p_notes, '')), ''),
          jsonb_build_object('client', btrim(p_walkin_name), 'branch', v_origin.name, 'services', v_names, 'price', p_origin_price, 'type', 'Walk-in request'),
          jsonb_build_object('client', btrim(p_walkin_name), 'branch', v_dest.name, 'address', v_dest.address, 'staff', v_staff.full_name,
                             'date', p_date, 'time', p_start, 'price', v_price, 'mode', p_mode, 'booking', v_code),
          jsonb_build_object('client_approved', true, 'walkin_transfer_id', v_id, 'travel_minutes', p_travel_minutes),
          v_notice, v_outbox, auth.uid())
  returning id into v_log;

  return jsonb_build_object('transfer_id', v_id, 'appointment_id', v_appt, 'booking_code', v_code, 'log_id', v_log, 'price', v_price);
end;
$$;

-- Cancel a walk-in transfer. A confirmed one cancels its destination booking
-- too — but never once the client has checked in there.
create or replace function cancel_walkin_transfer(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_t walkin_transfers%rowtype;
  v_session text;
begin
  select * into v_t from walkin_transfers where id = p_id for update;
  if not found then
    perform mb_reject('INVALID', 'That walk-in transfer no longer exists');
  end if;
  perform mb_require_walkin_access(v_t.origin_branch_id);
  if v_t.status = 'cancelled' then
    return;
  end if;
  if v_t.dest_appointment_id is not null then
    select session_status into v_session from appointments where id = v_t.dest_appointment_id;
    if v_session is not null and v_session not in ('reschedule_requested') then
      perform mb_reject('NOT_MOVABLE', 'The client is already checked in at the destination — the receiving Front Desk handles it from here');
    end if;
    update appointments set status = 'cancelled' where id = v_t.dest_appointment_id and status::text in ('pending', 'confirmed');
  end if;
  update walkin_transfers set status = 'cancelled', cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_at = now() where id = p_id;
end;
$$;

revoke execute on function mb_require_walkin_access(uuid) from public, anon;
revoke execute on function save_walkin_transfer_request(uuid, text, uuid, uuid, text, text, jsonb, integer, numeric, date, time, uuid, uuid, date, time, text, text) from public, anon;
revoke execute on function confirm_walkin_transfer(uuid, uuid, uuid, text, text, jsonb, integer, numeric, date, time, uuid, uuid, date, time, text, integer, text) from public, anon;
revoke execute on function cancel_walkin_transfer(uuid, text) from public, anon;
grant execute on function save_walkin_transfer_request(uuid, text, uuid, uuid, text, text, jsonb, integer, numeric, date, time, uuid, uuid, date, time, text, text) to authenticated;
grant execute on function confirm_walkin_transfer(uuid, uuid, uuid, text, text, jsonb, integer, numeric, date, time, uuid, uuid, date, time, text, integer, text) to authenticated;
grant execute on function cancel_walkin_transfer(uuid, text) to authenticated;

notify pgrst, 'reload schema';
