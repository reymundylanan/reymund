-- Run AFTER applying 050. Rolled back. Placeholders:
--   :CLIENT_ID   a customer profile id
--   :OTHER_ID    a different customer profile id
--   :STAFF_ID    a front_desk or admin profile id
begin;

select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Valid update through the function, odd phone format normalized
select update_my_profile('José Mari Dela Cruz-Santos', '+63 917-123-4567', 'male', '  Purok 3,   Brgy. San Francisco <b>Pagadian</b> ');
select full_name, phone, gender, address from profiles where id = ':CLIENT_ID';
-- expect: José Mari Dela Cruz-Santos | +63 917 123 4567 | male | Purok 3, Brgy. San Francisco Pagadian

-- 2. Invalid values rejected per field
do $$ declare f text; begin
  foreach f in array array['name','phone','gender','address'] loop
    begin
      perform update_my_profile(
        case when f = 'name' then 'J0hn 😀' else 'Ana Cruz' end,
        case when f = 'phone' then '12345' else '09171234567' end,
        case when f = 'gender' then 'other' else null end,
        case when f = 'address' then 'abc' else 'Purok 1, Pagadian' end);
      raise warning 'FAIL % accepted', f;
    exception when others then raise notice 'PASS % rejected: %', f, sqlerrm; end;
  end loop;
end $$;

-- 3. Direct update of a protected field is blocked
do $$ begin
  update profiles set role = 'admin' where id = ':CLIENT_ID';
  raise warning 'FAIL role change accepted';
exception when others then
  if sqlerrm = 'PROFILE_FIELD_LOCKED' then raise notice 'PASS role locked'; else raise warning 'FAIL got %', sqlerrm; end if;
end $$;
do $$ begin
  update profiles set loyalty_points = 99999 where id = ':CLIENT_ID';
  raise warning 'FAIL points change accepted';
exception when others then raise notice 'PASS points locked: %', sqlerrm; end $$;

-- 4. Direct update of an allowed field (booking form's phone update) still works
update profiles set phone = '+63 918 000 0000' where id = ':CLIENT_ID';
select 'phone still editable:' as check, phone from profiles where id = ':CLIENT_ID';

-- 5. Another client's row is untouched (RLS)
update profiles set full_name = 'Hacked' where id = ':OTHER_ID';
select 'other row unchanged (must not be Hacked):' as check, full_name from profiles where id = ':OTHER_ID';

-- 6. Avatar URL must be in own folder
do $$ begin
  perform set_my_avatar('https://x.supabase.co/storage/v1/object/public/avatars/clients/:OTHER_ID/a.jpg');
  raise warning 'FAIL foreign avatar accepted';
exception when others then raise notice 'PASS foreign avatar rejected: %', sqlerrm; end $$;
select set_my_avatar('https://x.supabase.co/storage/v1/object/public/avatars/clients/:CLIENT_ID/1700000000.jpg');
select remove_my_avatar();
reset role;

-- 7. Staff session is not affected by the guard
select set_config('request.jwt.claims', json_build_object('sub', ':STAFF_ID', 'role', 'authenticated')::text, true);
update profiles set vip = not vip where id = ':CLIENT_ID';
select 'staff/postgres can still change vip:' as check, vip from profiles where id = ':CLIENT_ID';

-- 8. Storage policies on avatars (review manually for anything overly permissive)
select policyname, cmd, roles, qual, with_check from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and (qual ilike '%avatars%' or with_check ilike '%avatars%');

rollback;
