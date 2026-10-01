-- 054 check script. Replace before running:
--   :CLIENT_ID    a customer profile id (with a full_name)
--   :FRONTDESK_ID a front_desk profile id
--   :BRANCH_ID    a branch id
--   :STAFF_ID     a staff_members id
-- Every check prints NOTICE 'PASS …' or WARNING 'FAIL …'. Everything is rolled back.
begin;

-- A walk-in registered the way the Front Desk screen does it.
insert into appointments (id, branch_id, client_id, professional_id, appointment_type, scheduled_date, start_time,
                          duration_minutes, status, session_status, walkin_name, walkin_phone, notes, visit_type)
values ('00000000-0000-4000-8000-000000000541', ':BRANCH_ID', null, ':STAFF_ID', 'solo', current_date, '10:00',
        60, 'confirmed', 'in_service', 'Typed Name', '', 'Check Service with Tester — ₱1.00', 'walk_in');

-- 1. Existing walk-ins were backfilled; bookings stay 'appointment'.
do $$ begin
  if exists (select 1 from appointments where client_id is null and walkin_name is not null and visit_type <> 'walk_in') then
    raise warning 'FAIL unlinked walk-ins not marked walk_in';
  else
    raise notice 'PASS walk-ins backfilled';
  end if;
end $$;

-- 2. A client cannot search accounts.
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform * from search_client_accounts('ma');
  raise warning 'FAIL client could search accounts';
exception when others then
  if sqlerrm = 'WALKIN_FORBIDDEN' then raise notice 'PASS client search refused'; else raise warning 'FAIL client search got %', sqlerrm; end if;
end $$;
do $$ begin
  perform link_walkin_client('00000000-0000-4000-8000-000000000541', ':CLIENT_ID');
  raise warning 'FAIL client could link';
exception when others then
  if sqlerrm = 'WALKIN_FORBIDDEN' then raise notice 'PASS client link refused'; else raise warning 'FAIL client link got %', sqlerrm; end if;
end $$;
reset role;

-- 3. Front Desk search returns masked data only.
select set_config('request.jwt.claims', json_build_object('sub', ':FRONTDESK_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare r record; n int := 0;
begin
  for r in select * from search_client_accounts((select split_part(full_name, ' ', 1) from profiles where id = ':CLIENT_ID')) loop
    n := n + 1;
    if r.email_masked is not null and r.email_masked !~ '^.\*\*\*@' then
      raise warning 'FAIL email not masked: %', r.email_masked;
    end if;
    if r.phone_last4 is not null and length(r.phone_last4) > 4 then
      raise warning 'FAIL phone not masked';
    end if;
  end loop;
  if n between 1 and 8 then raise notice 'PASS search returned % masked result(s)', n; else raise warning 'FAIL search returned %', n; end if;
end $$;

do $$ begin
  if (select count(*) from search_client_accounts('a')) = 0 then raise notice 'PASS one-letter search returns nothing';
  else raise warning 'FAIL one-letter search returned rows'; end if;
end $$;

-- 4. Linking sets the client, keeps it a walk-in, and writes the audit row.
select link_walkin_client('00000000-0000-4000-8000-000000000541', ':CLIENT_ID');
do $$ begin
  if exists (select 1 from appointments a join profiles p on p.id = a.client_id
              where a.id = '00000000-0000-4000-8000-000000000541'
                and a.client_id = ':CLIENT_ID' and a.visit_type = 'walk_in' and a.walkin_name = p.full_name)
     and (select count(*) from walkin_account_links
           where appointment_id = '00000000-0000-4000-8000-000000000541' and linked_by = ':FRONTDESK_ID') = 1 then
    raise notice 'PASS linked + audited';
  else
    raise warning 'FAIL link result';
  end if;
end $$;

-- 5. A linked walk-in cannot be linked again.
do $$ begin
  perform link_walkin_client('00000000-0000-4000-8000-000000000541', ':CLIENT_ID');
  raise warning 'FAIL relinked';
exception when others then
  if sqlerrm = 'WALKIN_INVALID' then raise notice 'PASS second link refused'; else raise warning 'FAIL relink got %', sqlerrm; end if;
end $$;
reset role;

-- 6. Completing the linked walk-in sends the review request (051 trigger).
update appointments set session_status = 'completed' where id = '00000000-0000-4000-8000-000000000541';
do $$ begin
  if exists (select 1 from client_notifications
              where appointment_id = '00000000-0000-4000-8000-000000000541' and kind = 'review_request') then
    raise notice 'PASS review request sent for linked walk-in';
  else
    raise warning 'FAIL no review request';
  end if;
end $$;

rollback;
