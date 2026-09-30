-- 050_client_profile.sql
-- Client "My Profile": adds gender/address, lets clients update ONLY their
-- own name/phone/gender/address/photo through checked functions, and
-- closes the hole where the "users update own profile" policy let a client
-- change their own role, points, VIP, etc. by calling the API directly.
-- Also: storage lockdown (007's avatar write policies let any signed-in user
-- overwrite any avatar), staff self-promotion (staff can no longer change
-- their own role/branch/etc.) and a self-insert guard (a self-created profile
-- must be a plain customer).

alter table profiles add column if not exists gender text;
alter table profiles add column if not exists address text;

-- restricted exists on the live DB but was never added by a migration file;
-- make sure it exists so the guard below can reference it.
alter table profiles add column if not exists restricted boolean not null default false;

alter table profiles drop constraint if exists profiles_gender_check;
alter table profiles add constraint profiles_gender_check
  check (gender is null or gender in ('female', 'male', 'prefer_not_to_say'));

-- ── Guard: users cannot change protected fields on their own row ──────

create or replace function protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rpc boolean := coalesce(current_setting('glowsync.profile_rpc', true), '') = 'on';
begin
  -- Only self-edits are guarded here; staff editing other rows is governed by
  -- RLS, and the service role (admin API routes) has auth.uid() = null.
  if auth.uid() is null or auth.uid() <> old.id then
    return new;
  end if;

  -- Nobody (customer or staff) may change these on their own row.
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

  if old.role::text = 'customer' then
    -- Name, gender, address and photo change only through update_my_profile /
    -- set_my_avatar / remove_my_avatar, which validate and set this flag.
    if not v_rpc and (
         new.full_name is distinct from old.full_name
      or new.gender is distinct from old.gender
      or new.address is distinct from old.address
      or new.avatar_url is distinct from old.avatar_url) then
      raise exception 'PROFILE_FIELD_LOCKED';
    end if;
    -- The booking form updates phone directly; it must still be a normalized PH mobile.
    if new.phone is distinct from old.phone
       and (new.phone is null or new.phone !~ '^\+63 9[0-9]{2} [0-9]{3} [0-9]{4}$') then
      raise exception 'PROFILE_INVALID:phone';
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

-- Self-created profiles (the OAuth callback) must be plain customers.
create or replace function protect_profile_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and auth.uid() = new.id then
    if new.role::text <> 'customer'
       or coalesce(new.vip, false)
       or coalesce(new.loyalty_points, 0) <> 0
       or coalesce(new.total_spend, 0) <> 0
       or coalesce(new.restricted, false)
       or new.username is not null
       or new.branch_id is not null then
      raise exception 'PROFILE_FIELD_LOCKED';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function protect_profile_insert() from public, anon, authenticated;

drop trigger if exists profiles_protect_insert on profiles;
create trigger profiles_protect_insert
  before insert on profiles
  for each row execute function protect_profile_insert();

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

  if length(v_name) < 2 or length(v_name) > 80 or v_name !~ '^[[:alpha:] .''-]+$' or v_name !~ '[[:alpha:]].*[[:alpha:]]' then
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

-- ── Photo ─────────────────────────────────────────────────────────────

create or replace function set_my_avatar(p_url text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_path text;
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid and role::text = 'customer') then
    raise exception 'PROFILE_FORBIDDEN';
  end if;
  v_path := substring(coalesce(p_url, '')
    from '^https://zxcgdirwkzdiufmhstau\.supabase\.co/storage/v1/object/public/avatars/(clients/[0-9a-f-]+/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp))$');
  if v_path is null
     or v_path not like 'clients/' || v_uid::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = v_path) then
    raise exception 'PROFILE_BAD_AVATAR';
  end if;
  perform set_config('glowsync.profile_rpc', 'on', true);
  update profiles set avatar_url = p_url where id = v_uid;
  perform set_config('glowsync.profile_rpc', 'off', true);
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
  perform set_config('glowsync.profile_rpc', 'on', true);
  update profiles set avatar_url = null where id = v_uid;
  perform set_config('glowsync.profile_rpc', 'off', true);
end;
$$;

revoke execute on function set_my_avatar(text) from public, anon;
grant execute on function set_my_avatar(text) to authenticated;
revoke execute on function remove_my_avatar() from public, anon;
grant execute on function remove_my_avatar() to authenticated;

-- ── Storage: lock down avatars; clients manage only avatars/clients/<their id>/… ──

-- 007 let ANY signed-in user (clients included) upload/overwrite ANY file in
-- avatars. Staff photo uploads come from admin/front desk screens only.
drop policy if exists "Authenticated upload avatars" on storage.objects;
drop policy if exists "Authenticated update avatars" on storage.objects;

drop policy if exists "staff upload avatars" on storage.objects;
create policy "staff upload avatars" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk'));

drop policy if exists "staff update avatars" on storage.objects;
create policy "staff update avatars" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk'))
  with check (bucket_id = 'avatars' and coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk'));

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
