-- 082_real_names.sql
-- Requires 050. Clients' names must identify them (same rule as the My Glow
-- profile form): first and last name, letters only, up to 50 characters,
-- at most 5 words of up to 20 letters, no stretched letters ("Aaaaarnel"),
-- no placeholder words ("Test", "User", "Admin", "Client"…).
-- Only the name check changes; the rest of update_my_profile is as in 050.

create or replace function update_my_profile(
  p_full_name text, p_phone text, p_gender text, p_address text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_words text[];
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_gender text := nullif(btrim(coalesce(p_gender, '')), '');
  v_address text;
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid and role::text = 'customer') then
    raise exception 'PROFILE_FORBIDDEN';
  end if;

  v_words := array(select w from unnest(string_to_array(v_name, ' ')) as w where w ~ '[[:alpha:]]');
  if length(v_name) > 50
     or v_name !~ '^[[:alpha:] .''-]+$'
     or coalesce(array_length(v_words, 1), 0) not between 2 and 5
     or not exists (select 1 from unnest(v_words) as w where length(regexp_replace(w, '[^[:alpha:]]', '', 'g')) >= 2)
     or exists (select 1 from unnest(v_words) as w where length(w) > 20)
     or v_name ~* '([[:alpha:]])\1{3}'
     or exists (
       select 1 from unnest(v_words) as w
        where lower(regexp_replace(w, '[.''-]', '', 'g')) in
          ('test', 'testing', 'user', 'client', 'customer', 'admin', 'glowsync', 'blush', 'guest',
           'unknown', 'anonymous', 'none', 'name', 'sample', 'asdf', 'qwerty')
     ) then
    raise exception 'PROFILE_INVALID:full_name';
  end if;

  if v_digits ~ '^639[0-9]{9}$' then
    v_digits := substr(v_digits, 3);
  elsif v_digits ~ '^09[0-9]{9}$' then
    v_digits := substr(v_digits, 2);
  end if;
  if v_digits !~ '^9[0-9]{9}$' then
    raise exception 'PROFILE_INVALID:phone';
  end if;
  v_phone := '+63 ' || substr(v_digits, 1, 3) || ' ' || substr(v_digits, 4, 3) || ' ' || substr(v_digits, 7, 4);

  if v_gender is not null and v_gender not in ('female', 'male', 'prefer_not_to_say') then
    raise exception 'PROFILE_INVALID:gender';
  end if;

  v_address := btrim(regexp_replace(
    regexp_replace(
      regexp_replace(coalesce(p_address, ''), '</?[a-zA-Z][^>]*>', '', 'g'),
      '[\x00-\x1F\x7F]', ' ', 'g'),
    '\s+', ' ', 'g'));
  if length(v_address) < 5 or length(v_address) > 200 then
    raise exception 'PROFILE_INVALID:address';
  end if;

  perform set_config('glowsync.profile_rpc', 'on', true);
  update profiles
     set full_name = v_name, phone = v_phone, gender = v_gender, address = v_address
   where id = v_uid;
  perform set_config('glowsync.profile_rpc', 'off', true);
end;
$$;

revoke execute on function update_my_profile(text, text, text, text) from public, anon;
grant execute on function update_my_profile(text, text, text, text) to authenticated;
