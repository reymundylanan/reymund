# GlowPoints Redemption & Vouchers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clients redeem GlowPoints for personal ₱ vouchers; Front Desk applies one voucher per booking at payment; unused vouchers expire and return their points; Admin manages options, vouchers, settings and manual point adjustments.

**Architecture:** Migration `053_glowpoints_redemption.sql` adds `reward_options`, `reward_vouchers`, redemption settings, new ledger types and SECURITY DEFINER functions (redeem, apply, undo, cancel, expire, adjust), a daily pg_cron expiry job, and relaxes 050's profile guard so the points functions (and only they) can sync `profiles.loyalty_points` on the caller's own row. UI tasks add the client redeem flow, the Front Desk voucher section and Admin management.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, Supabase (Postgres, RLS, pg_cron), Vitest, Tailwind 4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-30-glowpoints-redemption-design.md`

## Global Constraints

- Never push; never run SQL against the live DB. Work on branch `feat/glowpoints-redemption`. New commits only — never amend/rebase/reset. Only `git add` the files you change.
- Commit trailer exactly: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Files are CRLF: edit with Edit/Write tools.
- AGENTS.md: read `node_modules/next/dist/docs/` before using unfamiliar Next.js APIs.
- Lint baseline 31 errors / 34 warnings; changed files add no new errors.
- Query errors → `logQueryError(label, error)`; before 053 is applied every page renders (redeem stays "Coming soon", voucher section hidden, admin sections "Not set up yet").
- Defaults: options "₱50 OFF" 500 pts / ₱50 / 90 days and "₱100 OFF" 1000 pts / ₱100 / 90 days; max discount per booking ₱100; redemption enabled.
- Voucher code format `GLOW-XXXX-XXXX`, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I).
- One voucher per booking; discount = min(voucher amount, remaining balance, max per booking); leftover lost (warning first); undo only the same Asia/Manila day and only before the booking is paid.
- Expired or cancelled unused vouchers return their points (`voucher_refund`), which lowers `lifetime_redeemed` and never changes `lifetime_earned`; tiers use `lifetime_earned`.
- Money shown as `₱` + `toLocaleString("en-PH")`; dates in Asia/Manila.

## Review Focus

1. Double-tap Redeem / two tabs: balance deducted once per voucher, never below 0. (Task 1 SQL cases 2–3.)
2. A voucher from client A typed on client B's booking: rejected. (Task 1 case 6.)
3. Expiry job run twice / overlapping: each voucher refunded exactly once; ledger sum = balance. (Task 1 cases 11–12.)
4. Undo after the booking was paid or on another day: rejected. (Task 1 case 9.)
5. Client redeeming on their own row passes 050's guard, but a client still cannot change `loyalty_points` directly. (Task 1 cases 1, 14.)

---

### Task 1: Migration 053 + check script

**Files:**
- Create: `supabase/migrations/053_glowpoints_redemption.sql`
- Create: `supabase/tests/053_glowpoints_redemption_check.sql`

**Interfaces:**
- Consumes (052): `client_rewards`, `points_transactions`, `add_points(uuid,text,integer,uuid,uuid,text,uuid)`, `review_reward_settings`, `client_notifications` (kind check `client_notifications_kind_check`); (050) `protect_profile_fields()`.
- Produces:
  - tables `reward_options`, `reward_vouchers`; settings columns `max_voucher_discount`, `redemption_enabled`; `points_transactions.voucher_id`; ledger types `redemption`, `voucher_refund`.
  - `redeem_reward(p_option_id uuid) returns jsonb` → `{ voucherId, code, expiresAt, balance }` (customer)
  - `apply_voucher(p_appointment_id uuid, p_code text, p_remaining numeric) returns jsonb` → `{ voucherId, code, discount }` (admin/front_desk)
  - `undo_voucher(p_voucher_id uuid) returns void` (admin/front_desk)
  - `cancel_voucher(p_voucher_id uuid, p_reason text) returns void` (admin)
  - `adjust_client_points(p_client_id uuid, p_points integer, p_reason text) returns integer` (admin; returns new balance)
  - `save_reward_option(p_id uuid, p_name text, p_points integer, p_discount numeric, p_valid_days integer, p_active boolean, p_sort integer) returns uuid` (admin)
  - `update_redemption_settings(p_max numeric, p_enabled boolean) returns void` (admin)
  - `expire_vouchers() returns integer` (cron only)
  - errors: `REDEEM_FORBIDDEN`, `REDEEM_DISABLED`, `REDEEM_INVALID`, `REDEEM_NOT_ENOUGH`, `VOUCHER_FORBIDDEN`, `VOUCHER_INVALID`, `VOUCHER_NOT_FOUND`, `VOUCHER_WRONG_CLIENT`, `VOUCHER_USED`, `VOUCHER_EXPIRED`, `VOUCHER_ALREADY_APPLIED`, `VOUCHER_UNDO_EXPIRED`, `POINTS_INVALID`, `POINTS_NEGATIVE`, `REVIEW_FORBIDDEN`, `REVIEW_INVALID`
  - bell kinds `voucher_expired`, `voucher_cancelled`, `points_adjusted` (link `/my-glow#rewards`)

- [ ] **Step 1: Write the migration**

```sql
-- 053_glowpoints_redemption.sql
-- Requires 052. GlowPoints redemption: reward options, personal vouchers,
-- Front Desk apply/undo, Admin cancel/adjust, a daily expiry job that
-- returns points for unused vouchers, and a narrow change to 050's profile
-- guard so the points functions can keep profiles.loyalty_points in sync.

create extension if not exists pg_cron;

-- ── Profile guard: loyalty_points only through the points functions ───

-- Copy protect_profile_fields() from 050 VERBATIM (read the current file),
-- with exactly one change: remove the "new.loyalty_points is distinct from
-- old.loyalty_points" line from the "Nobody may change these" list, and add
-- right after that block:
--
--   if new.loyalty_points is distinct from old.loyalty_points
--      and coalesce(current_setting('glowsync.points_rpc', true), '') <> 'on' then
--     raise exception 'PROFILE_FIELD_LOCKED';
--   end if;
--
-- Keep the function header, security definer, search_path, revoke and the
-- existing trigger untouched (create or replace only).

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
```

- [ ] **Step 2: Write the check script** (`supabase/tests/053_glowpoints_redemption_check.sql`, style of `052_review_rewards_check.sql`: placeholders `:CLIENT_ID`, `:OTHER_ID`, `:FRONTDESK_ID`, `:ADMIN_ID`, `:BRANCH_ID`, `:STAFF_ID`; `begin; … rollback;`; NOTICE PASS / WARNING FAIL; exact `sqlerrm`; parenthesize concatenations in IF). As postgres give `:CLIENT_ID` 1200 points via `adjust`-equivalent direct setup (insert `client_rewards` 1200/1200 and a matching `opening_balance` row; set `loyalty_points` 1200) and create two appointments for `:CLIENT_ID` (one `pending`, one for undo tests) and one for `:OTHER_ID`. Cases:
  1. As the client: `update profiles set loyalty_points = 99999 where id = :CLIENT_ID` → `PROFILE_FIELD_LOCKED`.
  2. As the client: `redeem_reward(<₱50 option>)` → balance 700, one voucher `active`, code matches the regex, one `redemption` row −500 with `voucher_id`; `lifetime_earned` still 1200, `lifetime_redeemed` 500; `profiles.loyalty_points` = 700.
  3. Redeem ₱100 (1000) now → `REDEEM_NOT_ENOUGH`; balance unchanged.
  4. As admin `update_redemption_settings(100, false)`; client redeem → `REDEEM_DISABLED`; re-enable.
  5. As `:OTHER_ID` / anon / front desk: `redeem_reward` → `REDEEM_FORBIDDEN` (front desk) / permission or FORBIDDEN; direct `insert into reward_vouchers` → error.
  6. As front desk: `apply_voucher(<OTHER_ID's appointment>, <client code>, 500)` → `VOUCHER_WRONG_CLIENT`.
  7. As front desk: `apply_voucher(<client appt>, lower(code), 30)` → discount 30 (min of 50, 30, 100); status `used`; second voucher on the same appointment → `VOUCHER_ALREADY_APPLIED`; same code again → `VOUCHER_USED`.
  8. Max cap: admin sets max 20; a fresh ₱50 voucher applied with remaining 500 → discount 20; reset max 100.
  9. Undo: same day on unpaid appointment → back to `active`; set `used_at` to yesterday → `VOUCHER_UNDO_EXPIRED`; used on an appointment with `session_status = 'paid'` → `VOUCHER_UNDO_EXPIRED`.
  10. As client: `apply_voucher` / `undo_voucher` / `cancel_voucher` → `VOUCHER_FORBIDDEN`.
  11. Expiry: set an active voucher's `expires_at = now() - interval '1 minute'`; `expire_vouchers()` returns 1, voucher `expired`, one `voucher_refund` +500, balance +500, `lifetime_earned` unchanged, `lifetime_redeemed` −500, one `voucher_expired` bell; second `expire_vouchers()` returns 0 and adds nothing.
  12. Ledger sum for `:CLIENT_ID` = `client_rewards.current_points` = `profiles.loyalty_points`.
  13. Cancel: admin `cancel_voucher(active, 'test')` → refund once, bell `voucher_cancelled`; again → `VOUCHER_INVALID`; empty reason → `VOUCHER_INVALID`.
  14. Adjust: admin `adjust_client_points(:CLIENT_ID, -999999, 'x')` → `POINTS_INVALID`; below zero → `POINTS_NEGATIVE`; `+50` → balance +50, `lifetime_earned` +50, bell `points_adjusted`; front desk → `REVIEW_FORBIDDEN`.
  15. 052 still works: a review reward via `apply_review_evaluation` (service role, copy the 052 check's setup) still pays and updates `loyalty_points` (guard + 7-arg `add_points` wrapper).
  16. Options: admin `save_reward_option(null, 'Test', 10, 5, 30, true, 9)` returns an id; client call → `REVIEW_FORBIDDEN`; invalid values → `REVIEW_INVALID`.

- [ ] **Step 3: Self-check syntax**; re-read 050's guard copy line by line against 050.
- [ ] **Step 4: Commit** — `feat: GlowPoints vouchers - redeem, apply, expire, cancel and adjust (053)`.

---

### Task 2: Voucher helpers + history labels

**Files:**
- Create: `src/lib/vouchers.ts`, `src/lib/vouchers.test.ts`
- Modify: `src/lib/supabase/queries/rewards.ts` (`PointsEntry.type` union + `describeEntry`), `src/lib/supabase/queries/rewards.test.ts`

**Interfaces:**
```ts
export const VOUCHER_CODE_RE: RegExp; // /^GLOW-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/
export function normalizeVoucherCode(input: string): string; // trim, uppercase, remove spaces
export function voucherDiscount(amount: number, remaining: number, maxPerBooking: number): number;
export function expiryLabel(expiresAt: string, now?: Date): { text: string; soon: boolean };
export function peso(n: number): string; // "₱1,500" / "₱50.50"
export function redeemErrorMessage(code: string | null | undefined): string;
export function voucherErrorMessage(code: string | null | undefined): string;
// rewards.ts: PointsEntry.type adds "redemption" | "voucher_refund"; describeEntry handles them
```

- [ ] **Step 1: Failing tests** (`src/lib/vouchers.test.ts`):
```ts
import { describe, expect, it } from "vitest";
import { VOUCHER_CODE_RE, expiryLabel, normalizeVoucherCode, peso, redeemErrorMessage, voucherDiscount, voucherErrorMessage } from "./vouchers";

it("matches the voucher code format", () => {
  expect(VOUCHER_CODE_RE.test("GLOW-7KQ4-P2XM")).toBe(true);
  expect(VOUCHER_CODE_RE.test("GLOW-7KQ0-P2XM")).toBe(false);
  expect(VOUCHER_CODE_RE.test("glow-7kq4-p2xm")).toBe(false);
});
it("normalizes typed codes", () => expect(normalizeVoucherCode(" glow-7kq4 -p2xm ")).toBe("GLOW-7KQ4-P2XM"));
it("discount is the smallest of amount, remaining and max", () => {
  expect(voucherDiscount(50, 500, 100)).toBe(50);
  expect(voucherDiscount(100, 60, 100)).toBe(60);
  expect(voucherDiscount(100, 500, 80)).toBe(80);
  expect(voucherDiscount(50, 0, 100)).toBe(0);
});
describe("expiryLabel", () => {
  const now = new Date("2026-10-01T04:00:00Z"); // noon Manila
  it("days left", () => expect(expiryLabel("2026-10-13T04:00:00Z", now)).toEqual({ text: "Expires in 12 days", soon: false }));
  it("soon", () => expect(expiryLabel("2026-10-04T04:00:00Z", now)).toEqual({ text: "Expires in 3 days", soon: true }));
  it("today", () => expect(expiryLabel("2026-10-01T15:00:00Z", now)).toEqual({ text: "Expires today", soon: true }));
  it("past", () => expect(expiryLabel("2026-09-30T04:00:00Z", now)).toEqual({ text: "Expired", soon: false }));
});
it("formats pesos", () => {
  expect(peso(1500)).toBe("₱1,500");
  expect(peso(50.5)).toBe("₱50.50");
});
it("maps errors", () => {
  expect(redeemErrorMessage("REDEEM_NOT_ENOUGH")).toBe("You don't have enough GlowPoints for this reward.");
  expect(redeemErrorMessage("REDEEM_DISABLED")).toBe("Redeeming rewards is paused right now.");
  expect(redeemErrorMessage("X")).toBe("Couldn't redeem this reward. Please try again.");
  expect(voucherErrorMessage("VOUCHER_WRONG_CLIENT")).toBe("This voucher belongs to a different client.");
  expect(voucherErrorMessage("VOUCHER_EXPIRED")).toBe("This voucher has expired or was cancelled.");
  expect(voucherErrorMessage("VOUCHER_USED")).toBe("This voucher was already used.");
  expect(voucherErrorMessage("VOUCHER_ALREADY_APPLIED")).toBe("A voucher is already applied to this booking.");
  expect(voucherErrorMessage("VOUCHER_NOT_FOUND")).toBe("No voucher found with that code.");
  expect(voucherErrorMessage("VOUCHER_UNDO_EXPIRED")).toBe("This voucher can no longer be removed.");
  expect(voucherErrorMessage("?")).toBe("Couldn't apply the voucher. Please try again.");
});
```
`rewards.test.ts` additions: `describeEntry("redemption", "Redeemed ₱50 OFF (GLOW-7KQ4-P2XM)", null)` → `"Redeemed ₱50 OFF"`; `describeEntry("voucher_refund", "Voucher expired: ₱50 OFF (GLOW-…)", null)` → `"Voucher returned — expired"`; with `"Voucher cancelled: …"` → `"Voucher returned — cancelled"`; `describeEntry("admin_adjustment", "Review check: photo", null)` → `"Review check (team)"`; `describeEntry("admin_adjustment", "Adjustment: goodwill", null)` → `"Adjustment by GlowSync"`.

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `src/lib/vouchers.ts`:
```ts
export const VOUCHER_CODE_RE = /^GLOW-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function normalizeVoucherCode(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function voucherDiscount(amount: number, remaining: number, maxPerBooking: number): number {
  return Math.max(0, Math.min(amount, remaining, maxPerBooking));
}

const DAY = 24 * 60 * 60 * 1000;
function manilaDay(d: Date): number {
  return Math.floor((d.getTime() + 8 * 60 * 60 * 1000) / DAY);
}

export function expiryLabel(expiresAt: string, now: Date = new Date()): { text: string; soon: boolean } {
  const end = new Date(expiresAt);
  if (end.getTime() <= now.getTime()) return { text: "Expired", soon: false };
  const days = manilaDay(end) - manilaDay(now);
  if (days <= 0) return { text: "Expires today", soon: true };
  return { text: `Expires in ${days} day${days === 1 ? "" : "s"}`, soon: days < 7 };
}

export function peso(n: number): string {
  const hasCents = Math.round(n * 100) % 100 !== 0;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

const REDEEM: Record<string, string> = {
  REDEEM_NOT_ENOUGH: "You don't have enough GlowPoints for this reward.",
  REDEEM_DISABLED: "Redeeming rewards is paused right now.",
  REDEEM_INVALID: "This reward is no longer available.",
  REDEEM_FORBIDDEN: "Only client accounts can redeem rewards.",
};
export function redeemErrorMessage(code: string | null | undefined): string {
  return REDEEM[code?.trim() ?? ""] ?? "Couldn't redeem this reward. Please try again.";
}

const VOUCHER: Record<string, string> = {
  VOUCHER_WRONG_CLIENT: "This voucher belongs to a different client.",
  VOUCHER_EXPIRED: "This voucher has expired or was cancelled.",
  VOUCHER_USED: "This voucher was already used.",
  VOUCHER_ALREADY_APPLIED: "A voucher is already applied to this booking.",
  VOUCHER_NOT_FOUND: "No voucher found with that code.",
  VOUCHER_UNDO_EXPIRED: "This voucher can no longer be removed.",
  VOUCHER_FORBIDDEN: "Only Front Desk and Admin can do this.",
  VOUCHER_INVALID: "This voucher can't be used here.",
};
export function voucherErrorMessage(code: string | null | undefined): string {
  return VOUCHER[code?.trim() ?? ""] ?? "Couldn't apply the voucher. Please try again.";
}
```
`rewards.ts`: widen `PointsEntry["type"]` with `"redemption" | "voucher_refund"`; `describeEntry`:
```ts
if (type === "redemption") return note ? note.replace(/\s*\(GLOW-[^)]*\)\s*$/, "") : "Redeemed a reward";
if (type === "voucher_refund") return /cancel/i.test(note ?? "") ? "Voucher returned — cancelled" : "Voucher returned — expired";
if (type === "admin_adjustment") return (note ?? "").startsWith("Review check") ? "Review check (team)" : "Adjustment by GlowSync";
```
(remove `void note;`).
- [ ] **Step 4: Run** tests, tsc — PASS. **Step 5: Commit** — `feat: voucher helpers and redemption history labels`.

---

### Task 3: Client — Redeem flow and My Vouchers

**Files:**
- Create: `src/lib/supabase/queries/vouchers.ts`, `src/components/my-glow/RedeemRewardsModal.tsx`, `src/components/my-glow/MyVouchersList.tsx`
- Modify: `src/components/my-glow/MyRewardsCard.tsx`, `src/app/my-glow/page.tsx`
- Test: `src/lib/supabase/queries/vouchers.test.ts`

**Interfaces:**
```ts
export type RewardOption = { id: string; name: string; pointsCost: number; discountAmount: number; validDays: number };
export type Voucher = { id: string; name: string; code: string; discountAmount: number; pointsUsed: number; status: "active" | "used" | "expired" | "cancelled"; expiresAt: string; createdAt: string; usedAt: string | null; discountApplied: number | null };
export type RedemptionState = { enabled: boolean; options: RewardOption[] } | null; // null = pre-053
export async function getRedemptionState(supabase): Promise<RedemptionState>;
export async function getMyVouchers(supabase, clientId: string): Promise<Voucher[]>;
export async function redeemReward(supabase, optionId: string): Promise<{ code: string; expiresAt: string; balance: number } | { error: string }>;
export function sortVouchers(v: Voucher[]): Voucher[]; // active (soonest expiry first), then others newest first
```
- [ ] **Step 1: Failing tests** — `sortVouchers` ordering; `redeemReward` with a fake client: success maps `{code, expiresAt, balance}`; RPC error `REDEEM_NOT_ENOUGH` → `{ error: "You don't have enough GlowPoints for this reward." }` (via `redeemErrorMessage`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**
  - Queries: options = `reward_options` active ordered by `sort_order, points_cost`; enabled from `review_reward_settings.redemption_enabled`; any error (pre-053) → log + `null`. Vouchers = `reward_vouchers` for the client (select the fields above); error → log + `[]`.
  - `my-glow/page.tsx`: fetch `getRedemptionState` + `getMyVouchers` with the others; pass to `MyRewardsCard` (`redemption`, `vouchers` props); include voucher ids in the card `key` so it refreshes.
  - `MyRewardsCard`: when `redemption` is null keep the disabled "Redeem Rewards — Coming soon"; otherwise the button opens `RedeemRewardsModal`. Below the history render `MyVouchersList` (hidden when empty).
  - `RedeemRewardsModal`: title "Available Rewards", balance line, option cards (name, "{points} GlowPoints", "Valid for {validDays} days"); button **Redeem** or disabled "Earn {n} more points"; when `!enabled` all disabled with "Redemption is paused right now."; confirm step "Use {points} GlowPoints for {name}? Valid until {date}." with Cancel / Confirm; success: "🎉 Reward Unlocked!", "Your {name} GlowSync discount is now available.", code large (`font-mono text-2xl tracking-widest`), **Copy** (`navigator.clipboard.writeText`, "Copied!"), "Show this code at the front desk when you pay.", **Done** → `router.refresh()`. Errors in a `role="alert"` box. Dialog: `role="dialog"`, `aria-modal`, Escape closes (not while saving).
  - `MyVouchersList`: "My Vouchers"; active cards: name, code (mono) + Copy, `expiryLabel` (amber when `soon`); others greyed with "Used {date} · −{peso(discountApplied)}", "Expired {date} — points returned", "Cancelled — points returned".
- [ ] **Step 4: Verify** — tests, tsc, eslint changed files, `npm test`. **Step 5: Commit** — `feat: redeem GlowPoints for vouchers in My Rewards`.

---

### Task 4: Front Desk — apply a voucher at payment

**Files:**
- Create: `src/lib/supabase/queries/frontdeskVouchers.ts`, `src/components/frontdesk/appointments/VoucherSection.tsx`
- Modify: `src/components/frontdesk/appointments/AppointmentPaymentModal.tsx`, `src/components/frontdesk/appointments/utils.ts` (add `client_id: string | null` to `AppointmentRow`) and the query that selects Front Desk appointments (add `client_id` to its select — find it with `grep -rn "AppointmentRow" src/lib src/components/frontdesk`)
- Test: `src/lib/supabase/queries/frontdeskVouchers.test.ts`

**Interfaces:**
```ts
export type DeskVoucher = { id: string; code: string; name: string; discountAmount: number; expiresAt: string; status: string; discountApplied: number | null };
export async function getDeskVouchers(supabase, clientId: string, appointmentId: string): Promise<{ applied: DeskVoucher | null; available: DeskVoucher[]; maxPerBooking: number } | null>; // null pre-053
export async function applyVoucher(supabase, appointmentId: string, code: string, remaining: number): Promise<{ discount: number } | { error: string }>;
export async function undoVoucher(supabase, voucherId: string): Promise<string | null>; // error message or null
```
- [ ] **Step 1: Failing tests** for `applyVoucher`/`undoVoucher` with a fake client: success → `{ discount }`; `VOUCHER_WRONG_CLIENT` → message via `voucherErrorMessage`; code is normalized before the RPC (`normalizeVoucherCode`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**
  - `getDeskVouchers`: `reward_vouchers` where `client_id = clientId` and (`status = 'active' and expires_at > now` OR `used_appointment_id = appointmentId and status = 'used'`); `maxPerBooking` from `review_reward_settings.max_voucher_discount`; error → log + `null`.
  - `VoucherSection` (props: `appointmentId`, `clientId`, `remainingBeforeVoucher`, `paid: boolean`, `onChange(discount: number)`): title "GlowPoints voucher"; when applied: "Voucher {code} −{peso}" + **Undo** (hidden when `paid`); otherwise the client's active vouchers (code, name, `expiryLabel`) each with **Apply**, plus a code input + Apply. Before applying, if `voucher.discountAmount > min(remaining, maxPerBooking)` show a confirm: "This voucher is worth {peso(amount)} but only {peso(allowed)} can be used — the extra {peso(amount - allowed)} will be lost." Errors inline (`role="alert"`). Renders nothing when `clientId` is null or `getDeskVouchers` returned null.
  - `AppointmentPaymentModal`: keep the free Discount input; add `voucherDiscount` state initialised from the applied voucher; `total = max(servicePrice + additional_charges - discount - voucherDiscount, 0)`; pass `remainingBeforeVoucher = max(servicePrice + additional_charges - discount - advanceTotal, 0)`; show a "Voucher" line in the totals when > 0; `paid` = `isFullyCoveredByAdvance || cashJustRecorded` or session already paid.
- [ ] **Step 4: Verify** — tests, tsc, eslint changed files, `npm test`, `npm run build`. **Step 5: Commit** — `feat: Front Desk applies GlowPoints vouchers at payment`.

---

### Task 5: Admin — options, vouchers, settings, stats, adjust points

**Files:**
- Create: `src/lib/supabase/queries/adminVouchers.ts`, `src/components/admin/reviews/RedemptionAdmin.tsx`
- Modify: `src/components/admin/reviews/RewardsManager.tsx` (render `RedemptionAdmin` below the existing sections)
- Test: `src/lib/supabase/queries/adminVouchers.test.ts`

**Interfaces:**
```ts
export type OptionInput = { id: string | null; name: string; pointsCost: number; discountAmount: number; validDays: number; active: boolean; sortOrder: number };
export function validateOption(o: OptionInput): string | null;
// "Name must be 1–60 characters.", "Points must be a whole number from 1 to 1,000,000.",
// "Discount must be more than ₱0 and at most ₱100,000.", "Valid days must be from 1 to 365."
export function validateAdjustment(points: number, reason: string): string | null;
// "Enter a non-zero whole number of points (max 100,000).", "Enter a reason (up to 500 characters)."
export async function listOptions(supabase): Promise<(OptionInput & { id: string })[] | null>;
export async function saveOption(supabase, o: OptionInput): Promise<string | null>;
export async function listVouchers(supabase, q: { search?: string; status?: string; page?: number }): Promise<{ rows: AdminVoucherRow[]; total: number } | null>;
export async function cancelVoucher(supabase, id: string, reason: string): Promise<string | null>;
export async function getRedemptionSettings(supabase): Promise<{ maxPerBooking: number; enabled: boolean } | null>;
export async function saveRedemptionSettings(supabase, s: { maxPerBooking: number; enabled: boolean }): Promise<string | null>;
export async function getRedemptionStats(supabase): Promise<{ pointsRedeemedThisMonth: number; activeVouchers: number; discountsThisMonth: number }>;
export async function searchClients(supabase, q: string): Promise<{ id: string; name: string; balance: number }[]>;
export async function adjustPoints(supabase, clientId: string, points: number, reason: string): Promise<{ balance: number } | { error: string }>;
```
- [ ] **Step 1: Failing tests** for `validateOption` and `validateAdjustment` (exact messages above; valid inputs → null).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**
  - Queries: RPCs `save_reward_option`, `cancel_voucher`, `update_redemption_settings`, `adjust_client_points`; error mapping `REVIEW_FORBIDDEN`/`VOUCHER_FORBIDDEN` → "Only admins can do this.", `REVIEW_INVALID`/`VOUCHER_INVALID`/`POINTS_INVALID` → "Check the values and try again.", `POINTS_NEGATIVE` → "That would make the balance negative.", else "Couldn't save. Please try again."; voucher list: search matches `code` (ilike, escaped) or client name (profiles ids lookup, cap 200, like adminReviews), status filter, 20 per page, newest first, with client name; stats: `points_transactions` type `redemption` this Manila month (sum of −points), `reward_vouchers` active count (head count), `discount_applied` sum where `used_at` this month; `searchClients`: customers by `full_name` ilike (limit 10) with `client_rewards.current_points`.
  - `RedemptionAdmin` sections: **Redemption stats** (3 tiles); **Reward Options** (table + Add/Edit form with `validateOption`, active toggle); **Vouchers** (search, status select, table: code, client, reward, status pill, created, expires/used; **Cancel** with reason prompt for active); **Redemption settings** (max discount per booking ₱, redemption enabled; confirm "New values apply immediately."); **Adjust points** (client search → pick → +/− points, reason, confirm "Add 50 GlowPoints to Maria C.?"; shows new balance). Every section shows "Not set up yet — apply migration 053." when its read returns null.
- [ ] **Step 4: Verify** — tests, tsc, eslint changed files, `npm test`, `npm run build`. **Step 5: Commit** — `feat: admin reward options, vouchers, redemption settings and point adjustments`.

---

### Task 6: Final checks

- [ ] `npm test && npx tsc --noEmit -p . && npm run lint && npm run build` — pass; lint 31/34.
- [ ] `grep -rn "createAdminClient" src/components` — none.
- [ ] Deferred manual (after 052 → 053): redeem on a phone, see voucher + history −500; apply at Front Desk (and the leftover warning), undo, pay; Admin cancel → points back + bell; `update reward_vouchers set expires_at = now() - interval '1 minute' …; select expire_vouchers();` → points back + bell; Admin adjust ±; check script all PASS.
