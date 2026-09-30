-- Run AFTER applying 050. Rolled back. Placeholders:
--   :CLIENT_ID   a customer profile id
--   :OTHER_ID    a different customer profile id
--   :STAFF_ID    a front_desk profile id
begin;

-- If this insert is rejected on your Supabase version, upload any image to avatars/clients/<CLIENT_ID>/check.jpg in the Storage dashboard and delete this line.
insert into storage.objects (bucket_id, name) values ('avatars', 'clients/:CLIENT_ID/check.jpg');

select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Valid update through the function, odd phone format normalized
select update_my_profile('José Mari Dela Cruz-Santos', '+63 917-123-4567', 'male', '  Purok 3,   Brgy. San Francisco <b>Pagadian</b> ');
select full_name, phone, gender, address from profiles where id = ':CLIENT_ID';
-- expect: José Mari Dela Cruz-Santos | +63 917 123 4567 | male | Purok 3, Brgy. San Francisco Pagadian

-- 2. Invalid values rejected per field, with the expected code
do $$ declare f text; begin
  foreach f in array array['name','name_symbols','phone','gender','address'] loop
    begin
      perform update_my_profile(
        case when f = 'name' then 'J0hn 😀' when f = 'name_symbols' then '--' else 'Ana Cruz' end,
        case when f = 'phone' then '12345' else '09171234567' end,
        case when f = 'gender' then 'other' else null end,
        case when f = 'address' then 'abc' else 'Purok 1, Pagadian' end);
      raise warning 'FAIL % accepted', f;
    exception when others then
      if sqlerrm = ('PROFILE_INVALID:' || case when f in ('name', 'name_symbols') then 'full_name' else f end) then
        raise notice 'PASS % rejected: %', f, sqlerrm;
      else
        raise warning 'FAIL % got %', f, sqlerrm;
      end if;
    end;
  end loop;
end $$;

-- 3. Direct updates of protected / RPC-only fields are blocked
do $$ begin
  update profiles set role = 'admin' where id = ':CLIENT_ID';
  raise warning 'FAIL role change accepted';
exception when others then
  if sqlerrm = 'PROFILE_FIELD_LOCKED' then raise notice 'PASS role locked'; else raise warning 'FAIL role got %', sqlerrm; end if;
end $$;
do $$ begin
  update profiles set loyalty_points = 99999 where id = ':CLIENT_ID';
  raise warning 'FAIL points change accepted';
exception when others then
  if sqlerrm = 'PROFILE_FIELD_LOCKED' then raise notice 'PASS points locked'; else raise warning 'FAIL points got %', sqlerrm; end if;
end $$;
do $$ begin
  update profiles set full_name = 'X Y' where id = ':CLIENT_ID';
  raise warning 'FAIL direct full_name change accepted';
exception when others then
  if sqlerrm = 'PROFILE_FIELD_LOCKED' then raise notice 'PASS direct full_name locked'; else raise warning 'FAIL full_name got %', sqlerrm; end if;
end $$;
do $$ begin
  update profiles set avatar_url = 'https://evil.com/a.jpg' where id = ':CLIENT_ID';
  raise warning 'FAIL direct avatar_url change accepted';
exception when others then
  if sqlerrm = 'PROFILE_FIELD_LOCKED' then raise notice 'PASS direct avatar_url locked'; else raise warning 'FAIL avatar_url got %', sqlerrm; end if;
end $$;
do $$ begin
  update profiles set phone = '12345' where id = ':CLIENT_ID';
  raise warning 'FAIL direct bad phone accepted';
exception when others then
  if sqlerrm = 'PROFILE_INVALID:phone' then raise notice 'PASS direct bad phone rejected'; else raise warning 'FAIL bad phone got %', sqlerrm; end if;
end $$;

do $$ begin
  update profiles set phone = null where id = ':CLIENT_ID';
  raise warning 'FAIL clearing phone accepted';
exception when others then
  if sqlerrm = 'PROFILE_INVALID:phone' then raise notice 'PASS clearing phone rejected'; else raise warning 'FAIL clear phone got %', sqlerrm; end if;
end $$;

-- 4. Direct update of a normalized phone (booking form) still works
update profiles set phone = '+63 918 000 0000' where id = ':CLIENT_ID';
select 'phone still editable:' as check, phone from profiles where id = ':CLIENT_ID';

-- 5. Another client's row is untouched (RLS)
update profiles set full_name = 'Hacked' where id = ':OTHER_ID';
reset role;
do $$ declare n int; begin
  select count(*) into n from profiles where id = ':OTHER_ID' and full_name = 'Hacked';
  if n = 0 then raise notice 'PASS other row unchanged'; else raise warning 'FAIL other row was modified'; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;

-- 6. Avatar URL must be a real object in own folder on a supabase.co host
do $$ begin
  perform set_my_avatar('https://evil.com/storage/v1/object/public/avatars/clients/:CLIENT_ID/check.jpg');
  raise warning 'FAIL foreign host accepted';
exception when others then
  if sqlerrm = 'PROFILE_BAD_AVATAR' then raise notice 'PASS foreign host rejected'; else raise warning 'FAIL foreign host got %', sqlerrm; end if;
end $$;
do $$ begin
  perform set_my_avatar('https://attackerproj.supabase.co/storage/v1/object/public/avatars/clients/:CLIENT_ID/check.jpg');
  raise warning 'FAIL other supabase project accepted';
exception when others then
  if sqlerrm = 'PROFILE_BAD_AVATAR' then raise notice 'PASS other project rejected'; else raise warning 'FAIL other project got %', sqlerrm; end if;
end $$;
do $$ begin
  perform set_my_avatar('https://zxcgdirwkzdiufmhstau.supabase.co/storage/v1/object/public/avatars/clients/:CLIENT_ID/missing.jpg');
  raise warning 'FAIL missing object accepted';
exception when others then
  if sqlerrm = 'PROFILE_BAD_AVATAR' then raise notice 'PASS missing object rejected'; else raise warning 'FAIL missing object got %', sqlerrm; end if;
end $$;
select set_my_avatar('https://zxcgdirwkzdiufmhstau.supabase.co/storage/v1/object/public/avatars/clients/:CLIENT_ID/check.jpg');
select 'avatar set:' as check, avatar_url from profiles where id = ':CLIENT_ID';
select remove_my_avatar();
select 'avatar removed (must be null):' as check, avatar_url from profiles where id = ':CLIENT_ID';
reset role;

-- 7. Staff session: can set VIP via the function, cannot self-promote
select set_config('request.jwt.claims', json_build_object('sub', ':STAFF_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select set_client_vip(':CLIENT_ID', true);
select 'vip after set_client_vip (must be true):' as check, vip from profiles where id = ':CLIENT_ID';
do $$ begin
  update profiles set role = 'admin' where id = ':STAFF_ID';
  raise warning 'FAIL staff self-promotion accepted';
exception when others then
  if sqlerrm = 'PROFILE_FIELD_LOCKED' then raise notice 'PASS staff self-promotion locked'; else raise warning 'FAIL staff role got %', sqlerrm; end if;
end $$;
reset role;

-- 8. Storage policies on avatars: expect NO "Authenticated upload avatars" / "Authenticated update avatars"
select policyname, cmd, roles, qual, with_check from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and (qual ilike '%avatars%' or with_check ilike '%avatars%');
do $$ declare n int; begin
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('Authenticated upload avatars', 'Authenticated update avatars');
  if n = 0 then raise notice 'PASS broad avatar policies gone'; else raise warning 'FAIL % broad avatar policies remain', n; end if;
end $$;

rollback;
