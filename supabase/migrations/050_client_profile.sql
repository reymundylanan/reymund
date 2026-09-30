-- 050_client_profile.sql
-- Client "My Profile": adds gender/address, lets clients update ONLY their
-- own name/phone/gender/address/photo through checked functions, and
-- closes the hole where the "users update own profile" policy let a client
-- change their own role, points, VIP, etc. by calling the API directly.

alter table profiles add column if not exists gender text;
alter table profiles add column if not exists address text;

alter table profiles drop constraint if exists profiles_gender_check;
alter table profiles add constraint profiles_gender_check
  check (gender is null or gender in ('female', 'male', 'prefer_not_to_say'));

-- ── Guard: customers cannot change protected fields on their own row ──

create or replace function protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and old.role::text = 'customer' then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.email is distinct from old.email
       or new.username is distinct from old.username
       or new.branch_id is distinct from old.branch_id
       or new.vip is distinct from old.vip
       or new.loyalty_points is distinct from old.loyalty_points
       or new.total_spend is distinct from old.total_spend
       or new.restricted is distinct from old.restricted
       or new.gdpr_consented is distinct from old.gdpr_consented
       or new.allergy is distinct from old.allergy
       or new.preferences is distinct from old.preferences
       or new.created_at is distinct from old.created_at then
      raise exception 'PROFILE_FIELD_LOCKED';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function protect_profile_fields() from public, anon, authenticated;

drop trigger if exists profiles_protect_fields on profiles;
create trigger profiles_protect_fields
  before update on profiles
  for each row execute function protect_profile_fields();

-- ── Update own profile ────────────────────────────────────────────────

create or replace function update_my_profile(
  p_full_name text, p_phone text, p_gender text, p_address text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_gender text := nullif(btrim(coalesce(p_gender, '')), '');
  v_address text;
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid and role::text = 'customer') then
    raise exception 'PROFILE_FORBIDDEN';
  end if;

  if length(v_name) < 2 or length(v_name) > 80 or v_name !~ '^[[:alpha:] .''-]+$' then
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

  update profiles
     set full_name = v_name, phone = v_phone, gender = v_gender, address = v_address
   where id = v_uid;
end;
$$;

revoke execute on function update_my_profile(text, text, text, text) from public, anon;
grant execute on function update_my_profile(text, text, text, text) to authenticated;

-- ── Photo ─────────────────────────────────────────────────────────────

create or replace function set_my_avatar(p_url text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid and role::text = 'customer') then
    raise exception 'PROFILE_FORBIDDEN';
  end if;
  if p_url is null
     or p_url !~ ('^https://[^/]+/storage/v1/object/public/avatars/clients/' || v_uid::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'PROFILE_BAD_AVATAR';
  end if;
  update profiles set avatar_url = p_url where id = v_uid;
end;
$$;

create or replace function remove_my_avatar() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid and role::text = 'customer') then
    raise exception 'PROFILE_FORBIDDEN';
  end if;
  update profiles set avatar_url = null where id = v_uid;
end;
$$;

revoke execute on function set_my_avatar(text) from public, anon;
grant execute on function set_my_avatar(text) to authenticated;
revoke execute on function remove_my_avatar() from public, anon;
grant execute on function remove_my_avatar() to authenticated;

-- ── Storage: clients manage only avatars/clients/<their id>/… ─────────

drop policy if exists "clients insert own avatar" on storage.objects;
create policy "clients insert own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'clients'
              and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "clients update own avatar" on storage.objects;
create policy "clients update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'clients'
         and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'clients'
              and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "clients delete own avatar" on storage.objects;
create policy "clients delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'clients'
         and (storage.foldername(name))[2] = auth.uid()::text);

-- ── Realtime ──────────────────────────────────────────────────────────

do $$ begin
  alter publication supabase_realtime add table profiles;
exception when duplicate_object then null; end $$;
