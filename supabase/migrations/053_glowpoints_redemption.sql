-- 053_glowpoints_redemption.sql
-- Requires 052. GlowPoints redemption: reward options, personal vouchers,
-- Front Desk apply/undo, Admin cancel/adjust, a daily expiry job that
-- returns points for unused vouchers, and a narrow change to 050's profile
-- guard so the points functions can keep profiles.loyalty_points in sync.

create extension if not exists pg_cron;

-- ── Profile guard: loyalty_points only through the points functions ───

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
     or new.total_spend is distinct from old.total_spend
     or new.restricted is distinct from old.restricted
     or new.gdpr_consented is distinct from old.gdpr_consented
     or new.allergy is distinct from old.allergy
     or new.preferences is distinct from old.preferences
     or new.created_at is distinct from old.created_at then
    raise exception 'PROFILE_FIELD_LOCKED';
  end if;

  if new.loyalty_points is distinct from old.loyalty_points
     and coalesce(current_setting('glowsync.points_rpc', true), '') <> 'on' then
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


-- ── Ledger ────────────────────────────────────────────────────────────

alter table points_transactions drop constraint if exists points_transactions_type_check;
alter table points_transactions add constraint points_transactions_type_check
  check (type in ('opening_balance', 'review_reward', 'admin_adjustment', 'redemption', 'voucher_refund'));

-- (reward_vouchers is created below; add the column after it.)

-- ── Settings ──────────────────────────────────────────────────────────

alter table review_reward_settings add column if not exists max_voucher_discount numeric(10,2) not null default 100;
alter table review_reward_settings add column if not exists redemption_enabled boolean not null default true;
alter table review_reward_settings drop constraint if exists review_reward_settings_max_voucher_check;
alter table review_reward_settings add constraint review_reward_settings_max_voucher_check
  check (max_voucher_discount between 0 and 100000);

create or replace function update_redemption_settings(p_max numeric, p_enabled boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'REVIEW_FORBIDDEN';
  end if;
  update review_reward_settings
     set max_voucher_discount = p_max, redemption_enabled = p_enabled, updated_at = now(), updated_by = auth.uid()
   where id = 1;
exception
  when check_violation or not_null_violation then
    raise exception 'REVIEW_INVALID';
end;
$$;

revoke execute on function update_redemption_settings(numeric, boolean) from public, anon;
grant execute on function update_redemption_settings(numeric, boolean) to authenticated;

-- ── Options ───────────────────────────────────────────────────────────

create table if not exists reward_options (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  points_cost integer not null check (points_cost between 1 and 1000000),
  discount_amount numeric(10,2) not null check (discount_amount > 0 and discount_amount <= 100000),
  valid_days integer not null default 90 check (valid_days between 1 and 365),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into reward_options (name, points_cost, discount_amount, valid_days, sort_order)
select * from (values ('₱50 OFF', 500, 50.00, 90, 1), ('₱100 OFF', 1000, 100.00, 90, 2)) as v(name, points_cost, discount_amount, valid_days, sort_order)
 where not exists (select 1 from reward_options);

alter table reward_options enable row level security;
drop policy if exists "read reward options" on reward_options;
create policy "read reward options" on reward_options for select to authenticated using (true);
revoke insert, update, delete on reward_options from anon, authenticated;
grant select on reward_options to authenticated;

create or replace function save_reward_option(
  p_id uuid, p_name text, p_points integer, p_discount numeric, p_valid_days integer, p_active boolean, p_sort integer
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'REVIEW_FORBIDDEN';
  end if;
  if p_id is null then
    insert into reward_options (name, points_cost, discount_amount, valid_days, active, sort_order)
    values (btrim(p_name), p_points, p_discount, p_valid_days, p_active, coalesce(p_sort, 0))
    returning id into v_id;
  else
    update reward_options
       set name = btrim(p_name), points_cost = p_points, discount_amount = p_discount,
           valid_days = p_valid_days, active = p_active, sort_order = coalesce(p_sort, 0), updated_at = now()
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'REVIEW_INVALID';
    end if;
  end if;
  return v_id;
exception
  when check_violation or not_null_violation then
    raise exception 'REVIEW_INVALID';
end;
$$;

revoke execute on function save_reward_option(uuid, text, integer, numeric, integer, boolean, integer) from public, anon;
grant execute on function save_reward_option(uuid, text, integer, numeric, integer, boolean, integer) to authenticated;

-- ── Vouchers ──────────────────────────────────────────────────────────

create table if not exists reward_vouchers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  option_id uuid references reward_options(id) on delete set null,
  name text not null,
  points_used integer not null check (points_used > 0),
  discount_amount numeric(10,2) not null check (discount_amount > 0),
  code text not null unique check (code ~ '^GLOW-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_appointment_id uuid references appointments(id) on delete set null,
  discount_applied numeric(10,2),
  applied_by uuid references profiles(id) on delete set null,
  cancelled_reason text,
  cancelled_by uuid references profiles(id) on delete set null
);

create unique index if not exists reward_vouchers_one_per_booking
  on reward_vouchers (used_appointment_id) where status = 'used';
create index if not exists reward_vouchers_client_idx on reward_vouchers (client_id, status);
create index if not exists reward_vouchers_expiry_idx on reward_vouchers (status, expires_at);

alter table reward_vouchers enable row level security;
drop policy if exists "read reward vouchers" on reward_vouchers;
create policy "read reward vouchers" on reward_vouchers for select using (
  client_id = auth.uid() or coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk')
);
revoke insert, update, delete on reward_vouchers from anon, authenticated;
grant select on reward_vouchers to authenticated;

alter table points_transactions add column if not exists voucher_id uuid references reward_vouchers(id) on delete set null;

create or replace function generate_voucher_code() returns text
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := 'GLOW-';
  i integer;
begin
  for i in 1..8 loop
    v_code := v_code || substr(v_alpha, 1 + floor(random() * 32)::integer, 1);
    if i = 4 then
      v_code := v_code || '-';
    end if;
  end loop;
  return v_code;
end;
$$;

revoke execute on function generate_voucher_code() from public, anon, authenticated;

-- ── Points helpers (internal) ─────────────────────────────────────────

-- Same as 052's add_points plus voucher_id, and it sets the flag the
-- profile guard now requires to change loyalty_points.
create or replace function add_points(
  p_client uuid, p_type text, p_points integer, p_appointment uuid,
  p_evaluation uuid, p_note text, p_actor uuid, p_voucher uuid
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_balance integer;
begin
  insert into client_rewards (client_id) values (p_client) on conflict (client_id) do nothing;
  update client_rewards
     set current_points = current_points + p_points,
         lifetime_earned = lifetime_earned + greatest(p_points, 0),
         lifetime_redeemed = lifetime_redeemed + greatest(-p_points, 0),
         updated_at = now()
   where client_id = p_client
   returning current_points into v_balance;
  insert into points_transactions (client_id, type, points, balance_after, appointment_id, review_evaluation_id, voucher_id, note, created_by)
  values (p_client, p_type, p_points, v_balance, p_appointment, p_evaluation, p_voucher, p_note, p_actor);
  perform set_config('glowsync.points_rpc', 'on', true);
  update profiles set loyalty_points = v_balance where id = p_client;
  perform set_config('glowsync.points_rpc', 'off', true);
  return v_balance;
end;
$$;

create or replace function add_points(
  p_client uuid, p_type text, p_points integer, p_appointment uuid,
  p_evaluation uuid, p_note text, p_actor uuid
) returns integer
language sql security definer set search_path = public, pg_temp as $$
  select add_points(p_client, p_type, p_points, p_appointment, p_evaluation, p_note, p_actor, null::uuid)
$$;

-- Returns a voucher's points: raises the balance and lowers
-- lifetime_redeemed; lifetime_earned (tiers) is untouched.
create or replace function refund_points(p_client uuid, p_points integer, p_voucher uuid, p_note text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_balance integer;
begin
  insert into client_rewards (client_id) values (p_client) on conflict (client_id) do nothing;
  update client_rewards
     set current_points = current_points + p_points,
         lifetime_redeemed = greatest(lifetime_redeemed - p_points, 0),
         updated_at = now()
   where client_id = p_client
   returning current_points into v_balance;
  insert into points_transactions (client_id, type, points, balance_after, voucher_id, note)
  values (p_client, 'voucher_refund', p_points, v_balance, p_voucher, p_note);
  perform set_config('glowsync.points_rpc', 'on', true);
  update profiles set loyalty_points = v_balance where id = p_client;
  perform set_config('glowsync.points_rpc', 'off', true);
  return v_balance;
end;
$$;

revoke execute on function add_points(uuid, text, integer, uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function add_points(uuid, text, integer, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function refund_points(uuid, integer, uuid, text) from public, anon, authenticated;

-- ── Bell kinds ────────────────────────────────────────────────────────

alter table client_notifications drop constraint if exists client_notifications_kind_check;
alter table client_notifications add constraint client_notifications_kind_check
  check (kind in ('confirmed', 'cancelled', 'review_request', 'review_reward',
                  'voucher_expired', 'voucher_cancelled', 'points_adjusted'));

-- ── Redeem (client) ───────────────────────────────────────────────────

create or replace function redeem_reward(p_option_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_opt reward_options;
  v_enabled boolean;
  v_balance integer;
  v_code text;
  v_voucher uuid;
  v_expires timestamptz;
  i integer;
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid and role::text = 'customer') then
    raise exception 'REDEEM_FORBIDDEN';
  end if;
  select redemption_enabled into v_enabled from review_reward_settings where id = 1;
  if not coalesce(v_enabled, false) then
    raise exception 'REDEEM_DISABLED';
  end if;
  select * into v_opt from reward_options where id = p_option_id and active;
  if v_opt.id is null then
    raise exception 'REDEEM_INVALID';
  end if;

  insert into client_rewards (client_id) values (v_uid) on conflict (client_id) do nothing;
  select current_points into v_balance from client_rewards where client_id = v_uid for update;
  if v_balance < v_opt.points_cost then
    raise exception 'REDEEM_NOT_ENOUGH';
  end if;

  v_expires := now() + make_interval(days => v_opt.valid_days);
  for i in 1..5 loop
    v_code := generate_voucher_code();
    begin
      insert into reward_vouchers (client_id, option_id, name, points_used, discount_amount, code, expires_at)
      values (v_uid, v_opt.id, v_opt.name, v_opt.points_cost, v_opt.discount_amount, v_code, v_expires)
      returning id into v_voucher;
      exit;
    exception when unique_violation then
      v_voucher := null;
    end;
  end loop;
  if v_voucher is null then
    raise exception 'REDEEM_INVALID';
  end if;

  v_balance := add_points(v_uid, 'redemption', -v_opt.points_cost, null, null,
                          'Redeemed ' || v_opt.name || ' (' || v_code || ')', v_uid, v_voucher);
  return jsonb_build_object('voucherId', v_voucher, 'code', v_code, 'expiresAt', v_expires, 'balance', v_balance);
end;
$$;

revoke execute on function redeem_reward(uuid) from public, anon;
grant execute on function redeem_reward(uuid) to authenticated;

-- ── Apply / undo (Front Desk) ─────────────────────────────────────────

create or replace function apply_voucher(p_appointment_id uuid, p_code text, p_remaining numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_appt_client uuid;
  v_v reward_vouchers;
  v_max numeric(10,2);
  v_discount numeric(10,2);
begin
  if coalesce(public.current_user_role()::text, '') not in ('admin', 'front_desk') then
    raise exception 'VOUCHER_FORBIDDEN';
  end if;
  if p_remaining is null or p_remaining <= 0 then
    raise exception 'VOUCHER_INVALID';
  end if;
  select client_id into v_appt_client from appointments where id = p_appointment_id;
  if v_appt_client is null then
    raise exception 'VOUCHER_INVALID';
  end if;
  select * into v_v from reward_vouchers where code = upper(btrim(coalesce(p_code, ''))) for update;
  if v_v.id is null then
    raise exception 'VOUCHER_NOT_FOUND';
  end if;
  if v_v.client_id <> v_appt_client then
    raise exception 'VOUCHER_WRONG_CLIENT';
  end if;
  if v_v.status = 'used' then
    raise exception 'VOUCHER_USED';
  end if;
  if v_v.status <> 'active' or v_v.expires_at <= now() then
    raise exception 'VOUCHER_EXPIRED';
  end if;
  if exists (select 1 from reward_vouchers where used_appointment_id = p_appointment_id and status = 'used') then
    raise exception 'VOUCHER_ALREADY_APPLIED';
  end if;

  select max_voucher_discount into v_max from review_reward_settings where id = 1;
  v_discount := least(v_v.discount_amount, p_remaining, coalesce(v_max, v_v.discount_amount));
  if v_discount <= 0 then
    raise exception 'VOUCHER_INVALID';
  end if;

  update reward_vouchers
     set status = 'used', used_at = now(), used_appointment_id = p_appointment_id,
         discount_applied = v_discount, applied_by = auth.uid()
   where id = v_v.id;
  return jsonb_build_object('voucherId', v_v.id, 'code', v_v.code, 'discount', v_discount);
exception
  when unique_violation then
    raise exception 'VOUCHER_ALREADY_APPLIED';
end;
$$;

create or replace function undo_voucher(p_voucher_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_v reward_vouchers;
begin
  if coalesce(public.current_user_role()::text, '') not in ('admin', 'front_desk') then
    raise exception 'VOUCHER_FORBIDDEN';
  end if;
  select * into v_v from reward_vouchers where id = p_voucher_id for update;
  if v_v.id is null or v_v.status <> 'used' then
    raise exception 'VOUCHER_INVALID';
  end if;
  if (v_v.used_at at time zone 'Asia/Manila')::date <> (now() at time zone 'Asia/Manila')::date
     or exists (select 1 from appointments where id = v_v.used_appointment_id and session_status = 'paid') then
    raise exception 'VOUCHER_UNDO_EXPIRED';
  end if;
  update reward_vouchers
     set status = 'active', used_at = null, used_appointment_id = null, discount_applied = null, applied_by = null
   where id = v_v.id;
end;
$$;

revoke execute on function apply_voucher(uuid, text, numeric) from public, anon;
grant execute on function apply_voucher(uuid, text, numeric) to authenticated;
revoke execute on function undo_voucher(uuid) from public, anon;
grant execute on function undo_voucher(uuid) to authenticated;

-- ── Cancel / adjust (Admin) ───────────────────────────────────────────

create or replace function cancel_voucher(p_voucher_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_v reward_vouchers;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'VOUCHER_FORBIDDEN';
  end if;
  if length(v_reason) not between 1 and 500 then
    raise exception 'VOUCHER_INVALID';
  end if;
  select * into v_v from reward_vouchers where id = p_voucher_id for update;
  if v_v.id is null or v_v.status <> 'active' then
    raise exception 'VOUCHER_INVALID';
  end if;
  update reward_vouchers
     set status = 'cancelled', cancelled_reason = v_reason, cancelled_by = auth.uid()
   where id = v_v.id;
  perform refund_points(v_v.client_id, v_v.points_used, v_v.id,
                        'Voucher cancelled: ' || v_v.name || ' (' || v_v.code || ')');
  insert into client_notifications (client_id, kind, title, body, link_path)
  values (v_v.client_id, 'voucher_cancelled', 'Voucher cancelled',
          'Your ' || v_v.name || ' voucher was cancelled — ' || v_v.points_used || ' GlowPoints returned.',
          '/my-glow#rewards');
end;
$$;

create or replace function adjust_client_points(p_client_id uuid, p_points integer, p_reason text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_current integer;
  v_balance integer;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'REVIEW_FORBIDDEN';
  end if;
  if p_points is null or p_points = 0 or abs(p_points) > 100000 or length(v_reason) not between 1 and 500
     or not exists (select 1 from profiles where id = p_client_id and role::text = 'customer') then
    raise exception 'POINTS_INVALID';
  end if;
  insert into client_rewards (client_id) values (p_client_id) on conflict (client_id) do nothing;
  select current_points into v_current from client_rewards where client_id = p_client_id for update;
  if v_current + p_points < 0 then
    raise exception 'POINTS_NEGATIVE';
  end if;
  -- Corrections move lifetime_earned both ways (unlike redemptions).
  update client_rewards
     set current_points = current_points + p_points,
         lifetime_earned = greatest(lifetime_earned + p_points, 0),
         updated_at = now()
   where client_id = p_client_id
   returning current_points into v_balance;
  insert into points_transactions (client_id, type, points, balance_after, note, created_by)
  values (p_client_id, 'admin_adjustment', p_points, v_balance, 'Adjustment: ' || v_reason, auth.uid());
  perform set_config('glowsync.points_rpc', 'on', true);
  update profiles set loyalty_points = v_balance where id = p_client_id;
  perform set_config('glowsync.points_rpc', 'off', true);
  insert into client_notifications (client_id, kind, title, body, link_path)
  values (p_client_id, 'points_adjusted', 'GlowPoints updated',
          case when p_points > 0 then '+' else '' end || p_points || ' GlowPoints: ' || v_reason,
          '/my-glow#rewards');
  return v_balance;
end;
$$;

revoke execute on function cancel_voucher(uuid, text) from public, anon;
grant execute on function cancel_voucher(uuid, text) to authenticated;
revoke execute on function adjust_client_points(uuid, integer, text) from public, anon;
grant execute on function adjust_client_points(uuid, integer, text) to authenticated;

-- ── Expiry job ────────────────────────────────────────────────────────

create or replace function expire_vouchers() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v reward_vouchers;
  n integer := 0;
begin
  for v in select * from reward_vouchers where status = 'active' and expires_at <= now() for update skip locked loop
    update reward_vouchers set status = 'expired' where id = v.id;
    perform refund_points(v.client_id, v.points_used, v.id, 'Voucher expired: ' || v.name || ' (' || v.code || ')');
    insert into client_notifications (client_id, kind, title, body, link_path)
    values (v.client_id, 'voucher_expired', 'Voucher expired',
            'Your ' || v.name || ' voucher expired — ' || v.points_used || ' GlowPoints returned.',
            '/my-glow#rewards');
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function expire_vouchers() from public, anon, authenticated;

select cron.unschedule('expire-vouchers') where exists (select 1 from cron.job where jobname = 'expire-vouchers');
-- 00:10 Asia/Manila = 16:10 UTC
select cron.schedule('expire-vouchers', '10 16 * * *', $$select public.expire_vouchers()$$);

do $$ begin
  alter publication supabase_realtime add table reward_vouchers;
exception when duplicate_object then null; end $$;
