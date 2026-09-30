-- Run in the Supabase SQL Editor AFTER applying 049. Everything is rolled
-- back. Replace the placeholders first:
--   :CLIENT_ID     a customer profile id
--   :PENDING_APPT  one of that customer's appointments with status 'pending'
begin;

-- 1. Front desk confirms (postgres role here = not the client) -> 1 notification
update appointments set status = 'confirmed' where id = ':PENDING_APPT'::uuid;
do $$ begin
  if (select count(*) from client_notifications where appointment_id = ':PENDING_APPT'::uuid and kind = 'confirmed') = 1
  then raise notice 'PASS confirm writes one notification';
  else raise warning 'FAIL confirm notification count'; end if;
end $$;

select title, body, link_path from client_notifications where appointment_id = ':PENDING_APPT'::uuid;

-- 2. Then cancels -> one more notification
update appointments set status = 'cancelled' where id = ':PENDING_APPT'::uuid;
do $$ begin
  if (select count(*) from client_notifications where appointment_id = ':PENDING_APPT'::uuid and kind = 'cancelled') = 1
  then raise notice 'PASS cancel writes one notification';
  else raise warning 'FAIL cancel notification count'; end if;
end $$;

-- 3. A non-status update writes nothing new
update appointments set staff_notes = coalesce(staff_notes, '') where id = ':PENDING_APPT'::uuid;
do $$ begin
  if (select count(*) from client_notifications where appointment_id = ':PENDING_APPT'::uuid) = 2
  then raise notice 'PASS non-status update is silent';
  else raise warning 'FAIL unexpected notification'; end if;
end $$;

-- 4. The client sees exactly their own rows and can only change read_at
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select 'client sees own (must be 2):' as check, count(*) from client_notifications where appointment_id = ':PENDING_APPT'::uuid;
update client_notifications set read_at = now() where appointment_id = ':PENDING_APPT'::uuid;
do $$ begin
  update client_notifications set body = 'hacked' where appointment_id = ':PENDING_APPT'::uuid;
  raise warning 'FAIL client could edit body';
exception when insufficient_privilege then
  raise notice 'PASS client cannot edit body';
end $$;
reset role;

-- 5. Another signed-in user sees none of them
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
set local role authenticated;
select 'other user sees (must be 0):' as check, count(*) from client_notifications;
reset role;

rollback;
