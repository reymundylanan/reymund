# AI Review Evaluation & GlowPoints Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gemini grades each new visit review against an Admin-configurable rubric; a database reward engine turns the grades into GlowPoints with a full ledger, client breakdown, My Rewards, and an Admin Needs Review queue.

**Architecture:** Migration `052_review_rewards.sql` adds settings, evaluations, a points ledger, reward totals, overrides and review tags. A trigger creates a `pending` evaluation when a review is first submitted. `POST /api/reviews/evaluate` (client call right after submit, or pg_cron ping every 5 min) claims the evaluation, sends review text/tags/photos to Gemini with a JSON schema, validates the answer and calls `apply_review_evaluation`, which computes points from the settings (rating and photo criteria are decided by the database, never by stars) and writes the ledger.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, Supabase (Postgres, RLS, Storage, pg_cron, pg_net, Vault), Google Gemini REST (`gemini-2.5-flash-lite`), Vitest, Tailwind 4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-30-ai-review-rewards-design.md`

## Global Constraints

- Never push; never run SQL against the live DB (the user applies migrations in the Supabase SQL Editor). Work on branch `feat/ai-review-rewards`.
- Commit trailer exactly: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Files are CRLF: edit with the Edit/Write tools, not sed/node string replacement.
- AGENTS.md: this Next.js differs from training data — read `node_modules/next/dist/docs/` before using unfamiliar APIs (route handlers, params/searchParams are Promises).
- Lint baseline 31 errors / 34 warnings (`npm run lint`); changed files add no new errors.
- Log Supabase query errors with `logQueryError(label, error)`; before 052 is applied every page must still render (rewards UI hidden or empty), never crash.
- Default rubric: Rating 10, Meaningful 10, Specific 10, Relevant 10, Photo 10, partial = 50% of the criterion, max 50 per review, rewards enabled.
- Results: `pass`, `partial`, `fail`, `needs_review`, `not_provided`; confidence `high`, `medium`, `low`; low confidence ⇒ `needs_review` (0 points until Admin decides).
- Star level and positivity never change points. One reward per appointment. Edits never re-evaluate or add points.
- Tiers use lifetime points earned (`client_rewards.lifetime_earned`, fallback `profiles.loyalty_points`).
- Tags (max 6 per service part): `Professional, Relaxing, Clean, Friendly, Good Value, Great Service`; massage services also `Skilled Therapist, Comfortable, Effective` (service name contains "massage", case-insensitive).
- Nothing personal goes to Gemini: no client/staff names, emails, phones, ids — only service names, stars, texts, tags, photos.
- UI tokens: `coral`, `coral-dark`, `gold`, `blush`, `rose`, `ink`; rounded-2xl/3xl white cards; lucide icons.

## Review Focus

1. Gemini times out after the evaluation was claimed (route killed or slow): the evaluation stays `pending`, the cron retries it, and after 5 attempts it becomes `failed` instead of staying stuck. (Task 1 SQL cases 6–7; Task 3 test "timeout → fail recorded".)
2. Rating neutrality: a detailed 1★ review and the same text at 5★ get identical points; the prompt never mentions rewarding stars. (Task 1 case 3; Task 2 prompt test.)
3. Double evaluation (client double-submit + cron at the same moment): exactly one ledger row. (Task 1 case 4; Task 3 test "apply returns applied:false → no second award".)
4. Editing a rewarded review (or adding photos) creates no new evaluation and no points. (Task 1 case 9.)
5. Admin overriding the same criterion twice, or pushing past the max: second call rejected; total capped. (Task 1 cases 11–12.)

---

### Task 1: Migration 052 — reward tables, engine, tags, retry job + check script

**Files:**
- Create: `supabase/migrations/052_review_rewards.sql`
- Create: `supabase/tests/052_review_rewards_check.sql`

**Interfaces:**
- Consumes (051): `reviews` (target_type, appointment_id, client_id, service_position, status, first_submitted_at default now()), `appointment_services`, `review_photos`, `branch_services`, `client_notifications` (049; kind check `client_notifications_kind_check`), `current_user_role()`.
- Produces:
  - tables `review_reward_settings`, `review_evaluations`, `points_transactions`, `client_rewards`, `review_evaluation_overrides`; `reviews.tags text[]`
  - `claim_review_evaluation(p_appointment_id uuid) returns jsonb` (service_role) → `{ evaluationId, appointmentId, parts: [{ target, position, service, rating, text, tags, photos[] }] }` or null
  - `due_review_evaluations(p_limit int) returns setof uuid` (service_role; appointment ids)
  - `apply_review_evaluation(p_evaluation_id uuid, p_result jsonb, p_model text) returns jsonb` (service_role) → `{ status, points, balance, applied }`; `p_result` = `{ rating|meaningful|specific|relevant|photo: { result, confidence, reason }, summary }`
  - `fail_review_evaluation(p_evaluation_id uuid, p_error text) returns void` (service_role)
  - `override_review_criterion(p_evaluation_id uuid, p_criterion text, p_decision text, p_reason text) returns jsonb` (admin) → `{ delta }`
  - `retry_review_evaluation(p_evaluation_id uuid) returns void` (admin)
  - `update_review_reward_settings(p_rating int, p_meaningful int, p_specific int, p_relevant int, p_photo int, p_partial_ratio numeric, p_max int, p_enabled boolean) returns void` (admin)
  - `set_visit_review_tags(p_appointment_id uuid, p_tags jsonb) returns void` (owner) — `p_tags` = `[{ "position": 0, "tags": ["Clean", …] }]`
  - errors: `REVIEW_NOT_ALLOWED`, `REVIEW_INVALID`, `REVIEW_FORBIDDEN`, `EVAL_NOT_FOUND`, `EVAL_INVALID`, `EVAL_BAD_STATE`
  - bell kind `review_reward`, link `/my-glow#rewards`; Vault secrets `review_eval_url`, `review_eval_secret`

- [ ] **Step 1: Write the migration**

```sql
-- 052_review_rewards.sql
-- Requires 048, 049, 051. AI-graded review rewards (GlowPoints): rubric
-- settings, one evaluation per reviewed appointment, a points ledger with
-- running totals, Admin overrides for "needs review" criteria, review tags,
-- and a pg_cron retry ping (same Vault pattern as 047 Messenger).
--
-- After applying, add two Vault secrets:
--   select vault.create_secret('https://<site>/api/reviews/evaluate', 'review_eval_url');
--   select vault.create_secret('<same value as REVIEW_EVAL_SECRET>', 'review_eval_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ── Settings ──────────────────────────────────────────────────────────

create table if not exists review_reward_settings (
  id smallint primary key default 1 check (id = 1),
  rating_points integer not null default 10 check (rating_points between 0 and 1000),
  meaningful_points integer not null default 10 check (meaningful_points between 0 and 1000),
  specific_points integer not null default 10 check (specific_points between 0 and 1000),
  relevant_points integer not null default 10 check (relevant_points between 0 and 1000),
  photo_points integer not null default 10 check (photo_points between 0 and 1000),
  partial_ratio numeric(3,2) not null default 0.5 check (partial_ratio between 0 and 1),
  max_points integer not null default 50 check (max_points between 0 and 5000),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

insert into review_reward_settings (id) values (1) on conflict (id) do nothing;

alter table review_reward_settings enable row level security;
drop policy if exists "read reward settings" on review_reward_settings;
create policy "read reward settings" on review_reward_settings for select to authenticated using (true);
revoke insert, update, delete on review_reward_settings from anon, authenticated;
grant select on review_reward_settings to authenticated;

create or replace function update_review_reward_settings(
  p_rating integer, p_meaningful integer, p_specific integer, p_relevant integer, p_photo integer,
  p_partial_ratio numeric, p_max integer, p_enabled boolean
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'REVIEW_FORBIDDEN';
  end if;
  update review_reward_settings
     set rating_points = p_rating, meaningful_points = p_meaningful, specific_points = p_specific,
         relevant_points = p_relevant, photo_points = p_photo, partial_ratio = p_partial_ratio,
         max_points = p_max, enabled = p_enabled, updated_at = now(), updated_by = auth.uid()
   where id = 1;
exception
  when check_violation or not_null_violation then
    raise exception 'REVIEW_INVALID';
end;
$$;

revoke execute on function update_review_reward_settings(integer, integer, integer, integer, integer, numeric, integer, boolean) from public, anon;
grant execute on function update_review_reward_settings(integer, integer, integer, integer, integer, numeric, integer, boolean) to authenticated;

-- ── Evaluations ───────────────────────────────────────────────────────

create table if not exists review_evaluations (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references appointments(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'evaluated', 'needs_review', 'failed', 'skipped')),
  rating_result text check (rating_result in ('pass', 'partial', 'fail', 'needs_review', 'not_provided')),
  rating_confidence text check (rating_confidence in ('high', 'medium', 'low')),
  rating_reason text,
  meaningful_result text check (meaningful_result in ('pass', 'partial', 'fail', 'needs_review', 'not_provided')),
  meaningful_confidence text check (meaningful_confidence in ('high', 'medium', 'low')),
  meaningful_reason text,
  specific_result text check (specific_result in ('pass', 'partial', 'fail', 'needs_review', 'not_provided')),
  specific_confidence text check (specific_confidence in ('high', 'medium', 'low')),
  specific_reason text,
  relevant_result text check (relevant_result in ('pass', 'partial', 'fail', 'needs_review', 'not_provided')),
  relevant_confidence text check (relevant_confidence in ('high', 'medium', 'low')),
  relevant_reason text,
  photo_result text check (photo_result in ('pass', 'partial', 'fail', 'needs_review', 'not_provided')),
  photo_confidence text check (photo_confidence in ('high', 'medium', 'low')),
  photo_reason text,
  ai_summary text,
  model text,
  attempts integer not null default 0,
  last_error text,
  settings_snapshot jsonb,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default (now() + interval '1 minute'),
  evaluated_at timestamptz
);

create index if not exists review_evaluations_due_idx on review_evaluations (status, next_attempt_at);
create index if not exists review_evaluations_client_idx on review_evaluations (client_id);

alter table review_evaluations enable row level security;
drop policy if exists "read review evaluations" on review_evaluations;
create policy "read review evaluations" on review_evaluations for select using (
  client_id = auth.uid() or coalesce(public.current_user_role()::text, '') = 'admin'
);
revoke insert, update, delete on review_evaluations from anon, authenticated;
grant select on review_evaluations to authenticated;

-- ── Ledger ────────────────────────────────────────────────────────────

create table if not exists client_rewards (
  client_id uuid primary key references profiles(id) on delete cascade,
  current_points integer not null default 0 check (current_points >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  lifetime_redeemed integer not null default 0 check (lifetime_redeemed >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists points_transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('opening_balance', 'review_reward', 'admin_adjustment')),
  points integer not null,
  balance_after integer not null,
  appointment_id uuid references appointments(id) on delete set null,
  review_evaluation_id uuid references review_evaluations(id) on delete set null,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists points_one_review_reward
  on points_transactions (review_evaluation_id) where type = 'review_reward';
create unique index if not exists points_one_opening_balance
  on points_transactions (client_id) where type = 'opening_balance';
create index if not exists points_transactions_client_idx on points_transactions (client_id, created_at desc);

alter table client_rewards enable row level security;
alter table points_transactions enable row level security;

drop policy if exists "read client rewards" on client_rewards;
create policy "read client rewards" on client_rewards for select using (
  client_id = auth.uid() or coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk')
);
drop policy if exists "read points transactions" on points_transactions;
create policy "read points transactions" on points_transactions for select using (
  client_id = auth.uid() or coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk')
);

revoke insert, update, delete on client_rewards from anon, authenticated;
revoke insert, update, delete on points_transactions from anon, authenticated;
grant select on client_rewards to authenticated;
grant select on points_transactions to authenticated;

create table if not exists review_evaluation_overrides (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references review_evaluations(id) on delete cascade,
  criterion text not null check (criterion in ('rating', 'meaningful', 'specific', 'relevant', 'photo')),
  original_result text not null,
  decision text not null check (decision in ('pass', 'partial', 'fail')),
  reason text not null check (length(reason) between 1 and 500),
  admin_id uuid references profiles(id) on delete set null,
  points_delta integer not null,
  created_at timestamptz not null default now()
);

alter table review_evaluation_overrides enable row level security;
drop policy if exists "admin read overrides" on review_evaluation_overrides;
create policy "admin read overrides" on review_evaluation_overrides for select using (
  coalesce(public.current_user_role()::text, '') = 'admin'
);
revoke insert, update, delete on review_evaluation_overrides from anon, authenticated;
grant select on review_evaluation_overrides to authenticated;

-- Adds points (negative for Part B redemptions) and keeps
-- profiles.loyalty_points equal to the balance. Internal only.
create or replace function add_points(
  p_client uuid, p_type text, p_points integer, p_appointment uuid,
  p_evaluation uuid, p_note text, p_actor uuid
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
  insert into points_transactions (client_id, type, points, balance_after, appointment_id, review_evaluation_id, note, created_by)
  values (p_client, p_type, p_points, v_balance, p_appointment, p_evaluation, p_note, p_actor);
  update profiles set loyalty_points = v_balance where id = p_client;
  return v_balance;
end;
$$;

revoke execute on function add_points(uuid, text, integer, uuid, uuid, text, uuid) from public, anon, authenticated;

-- Opening balances: existing loyalty_points become the first ledger entry.
insert into client_rewards (client_id, current_points, lifetime_earned)
select p.id, p.loyalty_points, p.loyalty_points
  from profiles p
 where p.loyalty_points > 0
   and not exists (select 1 from client_rewards c where c.client_id = p.id);

insert into points_transactions (client_id, type, points, balance_after, note)
select p.id, 'opening_balance', p.loyalty_points, p.loyalty_points, 'Starting balance'
  from profiles p
 where p.loyalty_points > 0
   and not exists (select 1 from points_transactions t where t.client_id = p.id and t.type = 'opening_balance');

-- ── Review tags ───────────────────────────────────────────────────────

alter table reviews add column if not exists tags text[] not null default '{}';
alter table reviews drop constraint if exists reviews_tags_check;
alter table reviews add constraint reviews_tags_check check (
  cardinality(tags) <= 6
  and tags <@ array['Professional', 'Relaxing', 'Clean', 'Friendly', 'Good Value', 'Great Service',
                    'Skilled Therapist', 'Comfortable', 'Effective']::text[]
);

create or replace function set_visit_review_tags(p_appointment_id uuid, p_tags jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_part jsonb;
  v_tags text[];
begin
  if v_uid is null or not exists (
    select 1 from reviews where appointment_id = p_appointment_id and client_id = v_uid and target_type = 'service'
  ) then
    raise exception 'REVIEW_NOT_ALLOWED';
  end if;
  if jsonb_typeof(p_tags) is distinct from 'array' then
    raise exception 'REVIEW_INVALID';
  end if;
  for v_part in select value from jsonb_array_elements(p_tags) loop
    select coalesce(array_agg(distinct x), '{}') into v_tags
      from jsonb_array_elements_text(coalesce(v_part -> 'tags', '[]'::jsonb)) as t(x);
    update reviews set tags = v_tags
     where appointment_id = p_appointment_id and client_id = v_uid and target_type = 'service'
       and service_position = (v_part ->> 'position')::smallint
       and status in ('visible', 'flagged');
  end loop;
exception
  when check_violation or invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range then
    raise exception 'REVIEW_INVALID';
end;
$$;

revoke execute on function set_visit_review_tags(uuid, jsonb) from public, anon;
grant execute on function set_visit_review_tags(uuid, jsonb) to authenticated;

-- ── Start an evaluation on first submission only ─────────────────────

-- submit_visit_review (051) inserts service parts with first_submitted_at
-- defaulting to now(); edit_visit_review inserts with the original
-- first_submitted_at, so edits never start (or restart) an evaluation.
create or replace function start_review_evaluation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_enabled boolean;
begin
  if new.target_type <> 'service' or new.appointment_id is null or new.client_id is null
     or new.first_submitted_at is distinct from now() then
    return new;
  end if;
  select enabled into v_enabled from review_reward_settings where id = 1;
  insert into review_evaluations (appointment_id, client_id, status)
  values (new.appointment_id, new.client_id, case when coalesce(v_enabled, false) then 'pending' else 'skipped' end)
  on conflict (appointment_id) do nothing;
  return new;
end;
$$;

revoke execute on function start_review_evaluation() from public, anon, authenticated;

drop trigger if exists reviews_start_evaluation_trigger on reviews;
create trigger reviews_start_evaluation_trigger
  after insert on reviews
  for each row execute function start_review_evaluation();

-- ── Engine (service role only) ────────────────────────────────────────

create or replace function claim_review_evaluation(p_appointment_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_eval review_evaluations;
  v_parts jsonb;
begin
  select * into v_eval from review_evaluations where appointment_id = p_appointment_id for update skip locked;
  if v_eval.id is null or v_eval.status not in ('pending', 'failed') then
    return null;
  end if;
  if v_eval.attempts >= 5 then
    update review_evaluations set status = 'failed' where id = v_eval.id;
    return null;
  end if;
  update review_evaluations
     set attempts = attempts + 1, status = 'pending', next_attempt_at = now() + interval '5 minutes'
   where id = v_eval.id;

  select jsonb_agg(jsonb_build_object(
           'target', r.target_type,
           'position', r.service_position,
           'service', coalesce(x.service_name, s.name),
           'rating', r.rating,
           'text', r.text,
           'tags', to_jsonb(r.tags),
           'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position)
                                 from review_photos ph where ph.review_id = r.id), '[]'::jsonb))
         order by r.target_type desc, r.service_position)
    into v_parts
    from reviews r
    left join appointment_services x
      on r.target_type = 'service' and x.appointment_id = r.appointment_id and x.position = r.service_position
    left join branch_services s on s.id = r.service_id
   where r.appointment_id = p_appointment_id and r.status <> 'removed';

  return jsonb_build_object('evaluationId', v_eval.id, 'appointmentId', p_appointment_id,
                            'parts', coalesce(v_parts, '[]'::jsonb));
end;
$$;

create or replace function due_review_evaluations(p_limit integer) returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select appointment_id from review_evaluations
   where status = 'pending' and next_attempt_at <= now()
   order by created_at
   limit least(greatest(coalesce(p_limit, 10), 1), 20)
$$;

create or replace function apply_review_evaluation(p_evaluation_id uuid, p_result jsonb, p_model text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_eval review_evaluations;
  v_set review_reward_settings;
  v_crit text;
  v_res text;
  v_conf text;
  v_reason text;
  v_norm jsonb := '{}'::jsonb;
  v_full integer;
  v_points integer := 0;
  v_needs boolean := false;
  v_has_photo boolean;
  v_status text;
  v_balance integer;
begin
  select * into v_eval from review_evaluations where id = p_evaluation_id for update;
  if v_eval.id is null then
    raise exception 'EVAL_NOT_FOUND';
  end if;
  if v_eval.status not in ('pending', 'failed') then
    return jsonb_build_object('status', v_eval.status, 'points', v_eval.points_awarded, 'applied', false);
  end if;
  select * into v_set from review_reward_settings where id = 1;
  select exists (
    select 1 from review_photos ph join reviews r on r.id = ph.review_id
     where r.appointment_id = v_eval.appointment_id and r.status <> 'removed'
  ) into v_has_photo;

  foreach v_crit in array array['rating', 'meaningful', 'specific', 'relevant', 'photo'] loop
    v_res := p_result -> v_crit ->> 'result';
    v_conf := p_result -> v_crit ->> 'confidence';
    v_reason := left(btrim(coalesce(p_result -> v_crit ->> 'reason', '')), 300);
    if v_res is null or v_res not in ('pass', 'partial', 'fail', 'needs_review', 'not_provided')
       or v_conf is null or v_conf not in ('high', 'medium', 'low') then
      raise exception 'EVAL_INVALID';
    end if;
    -- Decided by the database, never by the AI or the star level:
    if v_crit = 'rating' then
      v_res := 'pass'; v_conf := 'high'; v_reason := 'A star rating was provided.';
    elsif v_crit = 'photo' and not v_has_photo then
      v_res := 'not_provided'; v_conf := 'high'; v_reason := 'No photo was uploaded.';
    elsif v_conf = 'low' and v_res <> 'not_provided' then
      v_res := 'needs_review';
    end if;
    v_full := case v_crit
      when 'rating' then v_set.rating_points
      when 'meaningful' then v_set.meaningful_points
      when 'specific' then v_set.specific_points
      when 'relevant' then v_set.relevant_points
      else v_set.photo_points end;
    v_points := v_points + case v_res
      when 'pass' then v_full
      when 'partial' then round(v_full * v_set.partial_ratio)::integer
      else 0 end;
    if v_res = 'needs_review' then
      v_needs := true;
    end if;
    v_norm := v_norm || jsonb_build_object(v_crit, jsonb_build_object('result', v_res, 'confidence', v_conf, 'reason', v_reason));
  end loop;

  v_points := least(v_points, v_set.max_points);
  v_status := case when v_needs then 'needs_review' else 'evaluated' end;

  update review_evaluations set
    rating_result = v_norm -> 'rating' ->> 'result',
    rating_confidence = v_norm -> 'rating' ->> 'confidence',
    rating_reason = v_norm -> 'rating' ->> 'reason',
    meaningful_result = v_norm -> 'meaningful' ->> 'result',
    meaningful_confidence = v_norm -> 'meaningful' ->> 'confidence',
    meaningful_reason = v_norm -> 'meaningful' ->> 'reason',
    specific_result = v_norm -> 'specific' ->> 'result',
    specific_confidence = v_norm -> 'specific' ->> 'confidence',
    specific_reason = v_norm -> 'specific' ->> 'reason',
    relevant_result = v_norm -> 'relevant' ->> 'result',
    relevant_confidence = v_norm -> 'relevant' ->> 'confidence',
    relevant_reason = v_norm -> 'relevant' ->> 'reason',
    photo_result = v_norm -> 'photo' ->> 'result',
    photo_confidence = v_norm -> 'photo' ->> 'confidence',
    photo_reason = v_norm -> 'photo' ->> 'reason',
    ai_summary = left(btrim(coalesce(p_result ->> 'summary', '')), 1000),
    model = left(coalesce(p_model, ''), 100),
    settings_snapshot = to_jsonb(v_set),
    points_awarded = v_points,
    status = v_status,
    last_error = null,
    evaluated_at = now()
  where id = v_eval.id;

  if v_points > 0 then
    v_balance := add_points(v_eval.client_id, 'review_reward', v_points, v_eval.appointment_id, v_eval.id, 'Review reward', null);
  else
    select current_points into v_balance from client_rewards where client_id = v_eval.client_id;
  end if;

  insert into client_notifications (client_id, appointment_id, kind, title, body, link_path)
  values (
    v_eval.client_id, v_eval.appointment_id, 'review_reward', 'Review evaluated',
    case when v_points > 0 then 'You earned +' || v_points || ' GlowPoints for your review.'
         else 'Thanks for your review!' end ||
    case when v_needs then ' Some points are waiting for our team to check.' else '' end,
    '/my-glow#rewards'
  );

  return jsonb_build_object('status', v_status, 'points', v_points, 'balance', coalesce(v_balance, 0), 'applied', true);
end;
$$;

create or replace function fail_review_evaluation(p_evaluation_id uuid, p_error text) returns void
language sql security definer set search_path = public, pg_temp as $$
  update review_evaluations
     set last_error = left(coalesce(p_error, ''), 500),
         status = case when attempts >= 5 then 'failed' else 'pending' end
   where id = p_evaluation_id and status in ('pending', 'failed')
$$;

revoke execute on function claim_review_evaluation(uuid) from public, anon, authenticated;
revoke execute on function due_review_evaluations(integer) from public, anon, authenticated;
revoke execute on function apply_review_evaluation(uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function fail_review_evaluation(uuid, text) from public, anon, authenticated;
grant execute on function claim_review_evaluation(uuid) to service_role;
grant execute on function due_review_evaluations(integer) to service_role;
grant execute on function apply_review_evaluation(uuid, jsonb, text) to service_role;
grant execute on function fail_review_evaluation(uuid, text) to service_role;

-- ── Admin decisions ───────────────────────────────────────────────────

create or replace function override_review_criterion(
  p_evaluation_id uuid, p_criterion text, p_decision text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_eval review_evaluations;
  v_orig text;
  v_full integer;
  v_delta integer;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'REVIEW_FORBIDDEN';
  end if;
  if p_criterion not in ('rating', 'meaningful', 'specific', 'relevant', 'photo')
     or p_decision not in ('pass', 'partial', 'fail')
     or length(v_reason) not between 1 and 500 then
    raise exception 'REVIEW_INVALID';
  end if;

  select * into v_eval from review_evaluations where id = p_evaluation_id for update;
  if v_eval.id is null or v_eval.status <> 'needs_review' then
    raise exception 'EVAL_BAD_STATE';
  end if;
  v_orig := case p_criterion
    when 'rating' then v_eval.rating_result
    when 'meaningful' then v_eval.meaningful_result
    when 'specific' then v_eval.specific_result
    when 'relevant' then v_eval.relevant_result
    else v_eval.photo_result end;
  if v_orig is distinct from 'needs_review' then
    raise exception 'EVAL_BAD_STATE';
  end if;

  -- Point values as they were when the review was evaluated.
  v_full := (v_eval.settings_snapshot ->> (p_criterion || '_points'))::integer;
  v_delta := case p_decision
    when 'pass' then v_full
    when 'partial' then round(v_full * (v_eval.settings_snapshot ->> 'partial_ratio')::numeric)::integer
    else 0 end;
  v_delta := greatest(0, least(v_delta, (v_eval.settings_snapshot ->> 'max_points')::integer - v_eval.points_awarded));

  update review_evaluations set
    rating_result = case when p_criterion = 'rating' then p_decision else rating_result end,
    meaningful_result = case when p_criterion = 'meaningful' then p_decision else meaningful_result end,
    specific_result = case when p_criterion = 'specific' then p_decision else specific_result end,
    relevant_result = case when p_criterion = 'relevant' then p_decision else relevant_result end,
    photo_result = case when p_criterion = 'photo' then p_decision else photo_result end,
    points_awarded = points_awarded + v_delta
  where id = v_eval.id;

  insert into review_evaluation_overrides (evaluation_id, criterion, original_result, decision, reason, admin_id, points_delta)
  values (v_eval.id, p_criterion, v_orig, p_decision, v_reason, auth.uid(), v_delta);

  if v_delta > 0 then
    perform add_points(v_eval.client_id, 'admin_adjustment', v_delta, v_eval.appointment_id, v_eval.id,
                       'Review check: ' || p_criterion, auth.uid());
  end if;

  update review_evaluations set status = 'evaluated'
   where id = v_eval.id
     and 'needs_review' <> all (array[rating_result, meaningful_result, specific_result, relevant_result, photo_result]);

  return jsonb_build_object('delta', v_delta);
end;
$$;

create or replace function retry_review_evaluation(p_evaluation_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'REVIEW_FORBIDDEN';
  end if;
  update review_evaluations
     set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null
   where id = p_evaluation_id and status = 'failed';
  if not found then
    raise exception 'EVAL_BAD_STATE';
  end if;
end;
$$;

revoke execute on function override_review_criterion(uuid, text, text, text) from public, anon;
grant execute on function override_review_criterion(uuid, text, text, text) to authenticated;
revoke execute on function retry_review_evaluation(uuid) from public, anon;
grant execute on function retry_review_evaluation(uuid) to authenticated;

-- ── Bell kind ─────────────────────────────────────────────────────────

alter table client_notifications drop constraint if exists client_notifications_kind_check;
alter table client_notifications add constraint client_notifications_kind_check
  check (kind in ('confirmed', 'cancelled', 'review_request', 'review_reward'));

-- ── Retry ping ────────────────────────────────────────────────────────

create or replace function review_eval_ping() returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from review_evaluations where status = 'pending' and next_attempt_at <= now()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'review_eval_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'review_eval_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function review_eval_ping() from public, anon, authenticated;

select cron.unschedule('review-evaluations') where exists (select 1 from cron.job where jobname = 'review-evaluations');
select cron.schedule('review-evaluations', '*/5 * * * *', $$select public.review_eval_ping()$$);

-- ── Realtime ──────────────────────────────────────────────────────────

do $$ begin
  alter publication supabase_realtime add table review_evaluations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table client_rewards;
exception when duplicate_object then null; end $$;
```

Before writing, read `supabase/migrations/047_messenger.sql` lines ~295–325 to confirm the Vault/pg_net/cron pattern and whether 047 guards `cron.schedule` against re-runs the same way; match it.

- [ ] **Step 2: Write the check script**

Create `supabase/tests/052_review_rewards_check.sql` in the style of `supabase/tests/051_review_photos_reports_check.sql` (placeholders, `begin; … rollback;`, NOTICE PASS / WARNING FAIL, `sqlerrm` exact matches, role switching with `set_config('request.jwt.claims', …)` + `set local role authenticated` / `service_role`; parenthesize concatenations inside IF). Placeholders: `:CLIENT_ID`, `:OTHER_ID`, `:ADMIN_ID`, `:BRANCH_ID`, `:SVC_ID`. Seed (as postgres) a completed appointment for `:CLIENT_ID` with one `appointment_services` row and one storage object, then as the client call `submit_visit_review` with one photo. Cases:
1. After submit: exactly one `review_evaluations` row, status `pending`.
2. As the client: `insert into points_transactions …`, `update client_rewards …`, `select apply_review_evaluation(...)` → each errors (permission denied / RLS).
3. As `service_role`: `claim_review_evaluation` returns parts with `rating` and the photo path; `apply_review_evaluation` with all criteria `pass`/`high` → `points` = 50; then repeat the whole flow on a second appointment with a 1★ rating and identical text → also 50 (rating neutrality).
4. Call `apply_review_evaluation` again for the first evaluation → `applied` false; still exactly one `review_reward` row; balance unchanged.
5. `client_rewards.current_points`, `lifetime_earned` and `profiles.loyalty_points` all equal 100 after both rewards.
6. Timeout path: third appointment; claim 5 times with `fail_review_evaluation` after each → status `failed`; a 6th claim returns null.
7. A `pending` evaluation whose attempts reached 5 without a fail call → next claim sets `failed` and returns null.
8. Low confidence: apply with `specific` = `pass`/`low` → that criterion stored `needs_review`, status `needs_review`, points exclude it; with no photos → `photo_result` `not_provided`.
9. As the client: `edit_visit_review` on the first appointment → no new evaluation, no new transaction.
10. Tags: `set_visit_review_tags(appt, '[{"position":0,"tags":["Clean","Relaxing"]}]')` succeeds; `["Bad Tag"]` → `REVIEW_INVALID`; as `:OTHER_ID` → `REVIEW_NOT_ALLOWED`.
11. As admin: `override_review_criterion(<case 8 eval>, 'specific', 'pass', 'Detailed enough')` → delta 10, one `admin_adjustment` row, status `evaluated`; calling it again → `EVAL_BAD_STATE`.
12. Cap: set a snapshot where `points_awarded` = max − 5 and override `pass` worth 10 → delta 5.
13. As the client: `override_review_criterion` → `REVIEW_FORBIDDEN`; `update_review_reward_settings` → `REVIEW_FORBIDDEN`; as admin with `p_max = -1` → `REVIEW_INVALID`.
14. Settings `enabled = false` (as admin) then submit a fourth review → evaluation status `skipped`.
15. As `service_role`: `due_review_evaluations(10)` returns only pending, due ids.

- [ ] **Step 3: Self-check syntax** — re-read the whole migration once (balanced `$$`, every trigger after its function, grants after functions). No database is available.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/052_review_rewards.sql supabase/tests/052_review_rewards_check.sql
git commit -m "feat: review reward engine, GlowPoints ledger, tags and retry job (052)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared reward helpers (types, AI schema/validation, prompt, breakdown)

**Files:**
- Create: `src/lib/reviewRewards.ts`
- Test: `src/lib/reviewRewards.test.ts`

**Interfaces:**
- Produces:
```ts
export const CRITERIA: readonly ["rating", "meaningful", "specific", "relevant", "photo"];
export type Criterion = (typeof CRITERIA)[number];
export type CriterionResult = "pass" | "partial" | "fail" | "needs_review" | "not_provided";
export type Confidence = "high" | "medium" | "low";
export type CriterionGrade = { result: CriterionResult; confidence: Confidence; reason: string };
export type AiEvaluation = Record<Criterion, CriterionGrade> & { summary: string };
export type EvaluationPart = { target: "service" | "staff" | "branch"; position: number | null; service: string | null; rating: number; text: string | null; tags: string[]; photos: string[] };
export type SettingsSnapshot = { rating_points: number; meaningful_points: number; specific_points: number; relevant_points: number; photo_points: number; partial_ratio: number; max_points: number };
export type EvaluationRow = { status: string; points_awarded: number; ai_summary: string | null; settings_snapshot: SettingsSnapshot | null } & Record<`${Criterion}_result`, CriterionResult | null> & Record<`${Criterion}_reason`, string | null> & Record<`${Criterion}_confidence`, Confidence | null>;
export type BreakdownRow = { criterion: Criterion; label: string; result: CriterionResult; reason: string; points: number };
export const CRITERION_LABELS: Record<Criterion, string>;
export const REVIEW_TAGS: readonly string[]; export const MASSAGE_TAGS: readonly string[];
export function tagsForService(name: string | null): string[];
export const AI_RESPONSE_SCHEMA: object;   // Gemini responseSchema
export function parseAiEvaluation(raw: unknown): AiEvaluation | null;
export function buildEvaluationPrompt(parts: EvaluationPart[]): { system: string; text: string };
export function pointsFor(criterion: Criterion, result: CriterionResult, s: SettingsSnapshot): number;
export function breakdownRows(row: EvaluationRow): BreakdownRow[];
```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  breakdownRows,
  buildEvaluationPrompt,
  parseAiEvaluation,
  pointsFor,
  tagsForService,
  type EvaluationRow,
  type SettingsSnapshot,
} from "./reviewRewards";

const S: SettingsSnapshot = {
  rating_points: 10, meaningful_points: 10, specific_points: 10, relevant_points: 10, photo_points: 10,
  partial_ratio: 0.5, max_points: 50,
};
const grade = (result: string, confidence = "high") => ({ result, confidence, reason: "because" });

describe("parseAiEvaluation", () => {
  const ok = {
    rating: grade("pass"), meaningful: grade("pass"), specific: grade("partial", "medium"),
    relevant: grade("pass"), photo: grade("not_provided"), summary: "Relaxing massage.",
  };
  it("accepts a complete answer", () => expect(parseAiEvaluation(ok)).toEqual(ok));
  it("accepts a JSON string", () => expect(parseAiEvaluation(JSON.stringify(ok))).toEqual(ok));
  it("rejects missing criteria, bad values and junk", () => {
    expect(parseAiEvaluation({ ...ok, specific: undefined })).toBeNull();
    expect(parseAiEvaluation({ ...ok, relevant: grade("great") })).toBeNull();
    expect(parseAiEvaluation({ ...ok, meaningful: grade("pass", "sure") })).toBeNull();
    expect(parseAiEvaluation("not json")).toBeNull();
    expect(parseAiEvaluation(null)).toBeNull();
  });
  it("trims long reasons and summaries", () => {
    const long = parseAiEvaluation({ ...ok, summary: "x".repeat(2000), rating: { ...grade("pass"), reason: "y".repeat(900) } });
    expect(long?.summary.length).toBe(1000);
    expect(long?.rating.reason.length).toBe(300);
  });
});

describe("buildEvaluationPrompt", () => {
  const parts = [
    { target: "service" as const, position: 0, service: "Deep Tissue Massage", rating: 2, text: "Waited 30 minutes but the massage was great.", tags: ["Relaxing"], photos: ["u/a/p.jpg"] },
    { target: "staff" as const, position: null, service: null, rating: 5, text: "Very professional.", tags: [], photos: [] },
  ];
  it("tells the model stars and positivity never matter and to use needs_review when unsure", () => {
    const { system } = buildEvaluationPrompt(parts);
    expect(system).toMatch(/do not (reward|consider) the star/i);
    expect(system).toMatch(/negative feedback/i);
    expect(system).toMatch(/needs_review/);
    expect(system).toMatch(/identity|appearance/i);
  });
  it("includes the review content but no storage paths or ids", () => {
    const { text } = buildEvaluationPrompt(parts);
    expect(text).toContain("Deep Tissue Massage");
    expect(text).toContain("Waited 30 minutes");
    expect(text).toContain("Relaxing");
    expect(text).not.toContain("u/a/p.jpg");
  });
});

describe("pointsFor", () => {
  it("full, partial (rounded), zero", () => {
    expect(pointsFor("specific", "pass", S)).toBe(10);
    expect(pointsFor("specific", "partial", { ...S, partial_ratio: 0.33 })).toBe(3);
    for (const r of ["fail", "needs_review", "not_provided"] as const) expect(pointsFor("photo", r, S)).toBe(0);
  });
});

describe("breakdownRows", () => {
  it("maps each criterion with label, reason and points", () => {
    const row = {
      status: "evaluated", points_awarded: 35, ai_summary: "ok", settings_snapshot: S,
      rating_result: "pass", rating_reason: "A star rating was provided.", rating_confidence: "high",
      meaningful_result: "pass", meaningful_reason: "Clear", meaningful_confidence: "high",
      specific_result: "partial", specific_reason: "Some detail", specific_confidence: "medium",
      relevant_result: "pass", relevant_reason: "About the massage", relevant_confidence: "high",
      photo_result: "not_provided", photo_reason: "No photo was uploaded.", photo_confidence: "high",
    } as EvaluationRow;
    const rows = breakdownRows(row);
    expect(rows.map((r) => r.points)).toEqual([10, 10, 5, 10, 0]);
    expect(rows[2]).toMatchObject({ label: "Specific feedback", result: "partial" });
  });
});

it("offers massage tags only for massage services", () => {
  expect(tagsForService("Deep Tissue Massage")).toContain("Skilled Therapist");
  expect(tagsForService("Signature Facial")).not.toContain("Skilled Therapist");
  expect(tagsForService(null)).toHaveLength(6);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/reviewRewards.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement `src/lib/reviewRewards.ts`**

```ts
export const CRITERIA = ["rating", "meaningful", "specific", "relevant", "photo"] as const;
export type Criterion = (typeof CRITERIA)[number];
export type CriterionResult = "pass" | "partial" | "fail" | "needs_review" | "not_provided";
export type Confidence = "high" | "medium" | "low";
export type CriterionGrade = { result: CriterionResult; confidence: Confidence; reason: string };
export type AiEvaluation = Record<Criterion, CriterionGrade> & { summary: string };
export type EvaluationPart = {
  target: "service" | "staff" | "branch";
  position: number | null;
  service: string | null;
  rating: number;
  text: string | null;
  tags: string[];
  photos: string[];
};
export type SettingsSnapshot = {
  rating_points: number;
  meaningful_points: number;
  specific_points: number;
  relevant_points: number;
  photo_points: number;
  partial_ratio: number;
  max_points: number;
};
export type EvaluationRow = {
  status: string;
  points_awarded: number;
  ai_summary: string | null;
  settings_snapshot: SettingsSnapshot | null;
} & Record<`${Criterion}_result`, CriterionResult | null> &
  Record<`${Criterion}_reason`, string | null> &
  Record<`${Criterion}_confidence`, Confidence | null>;
export type BreakdownRow = { criterion: Criterion; label: string; result: CriterionResult; reason: string; points: number };

export const CRITERION_LABELS: Record<Criterion, string> = {
  rating: "Rating",
  meaningful: "Meaningful feedback",
  specific: "Specific feedback",
  relevant: "Relevant service feedback",
  photo: "Photo",
};

export const REVIEW_TAGS = ["Professional", "Relaxing", "Clean", "Friendly", "Good Value", "Great Service"] as const;
export const MASSAGE_TAGS = ["Skilled Therapist", "Comfortable", "Effective"] as const;

export function tagsForService(name: string | null): string[] {
  return /massage/i.test(name ?? "") ? [...REVIEW_TAGS, ...MASSAGE_TAGS] : [...REVIEW_TAGS];
}

const RESULTS = new Set<CriterionResult>(["pass", "partial", "fail", "needs_review", "not_provided"]);
const CONFIDENCES = new Set<Confidence>(["high", "medium", "low"]);

const gradeSchema = {
  type: "object",
  properties: {
    result: { type: "string", enum: [...RESULTS] },
    confidence: { type: "string", enum: [...CONFIDENCES] },
    reason: { type: "string" },
  },
  required: ["result", "confidence", "reason"],
};

export const AI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    rating: gradeSchema,
    meaningful: gradeSchema,
    specific: gradeSchema,
    relevant: gradeSchema,
    photo: gradeSchema,
    summary: { type: "string" },
  },
  required: [...CRITERIA, "summary"],
};

export function parseAiEvaluation(raw: unknown): AiEvaluation | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const out: Partial<AiEvaluation> = {};
  for (const c of CRITERIA) {
    const g = obj[c] as Record<string, unknown> | undefined;
    if (!g || typeof g !== "object") return null;
    const result = g.result as CriterionResult;
    const confidence = g.confidence as Confidence;
    if (!RESULTS.has(result) || !CONFIDENCES.has(confidence)) return null;
    out[c] = { result, confidence, reason: String(g.reason ?? "").trim().slice(0, 300) };
  }
  if (typeof obj.summary !== "string") return null;
  return { ...(out as Record<Criterion, CriterionGrade>), summary: obj.summary.trim().slice(0, 1000) };
}

const SYSTEM = `You grade the QUALITY of a spa client's review for a rewards program. You do not decide points.
Grade each criterion as "pass", "partial", "fail", "needs_review" or "not_provided", with confidence "high", "medium" or "low" and a one-sentence reason.
- rating: always "pass" (the system checks it).
- meaningful: does the client explain their experience in a useful way? One or two generic words ("Good.") is "partial" or "fail".
- specific: concrete details about the actual visit (therapist, treatment, cleanliness, comfort, atmosphere, waiting time, staff, booking, results).
- relevant: is the feedback about this visit and these services? Long text that is off-topic must not pass.
- photo: are the photos relevant to the visit or service? Use "not_provided" when there are none.
Rules:
- Do not reward or consider the star level. A 1-star and a 5-star review with the same quality get the same grades.
- Useful negative feedback and complaints count exactly like praise. Never lower a grade because the review is negative.
- Never comment on people's identity, appearance, age, gender or any sensitive trait in photos.
- If you cannot tell, answer "needs_review" with confidence "low".
- summary: one or two neutral sentences describing what the review talks about.`;

export function buildEvaluationPrompt(parts: EvaluationPart[]): { system: string; text: string } {
  const lines: string[] = ["Review of one completed spa visit:"];
  for (const p of parts) {
    const label =
      p.target === "service" ? `Service: ${p.service ?? "Service"}` : p.target === "staff" ? "About the therapist" : "About the branch";
    lines.push(`\n[${label}]`);
    lines.push(`Stars: ${p.rating}/5`);
    lines.push(`Comment: ${p.text?.trim() ? p.text.trim() : "(no comment)"}`);
    if (p.tags.length) lines.push(`Tags: ${p.tags.join(", ")}`);
    if (p.target === "service") lines.push(`Photos attached: ${p.photos.length}`);
  }
  return { system: SYSTEM, text: lines.join("\n") };
}

export function pointsFor(criterion: Criterion, result: CriterionResult, s: SettingsSnapshot): number {
  const full = s[`${criterion}_points`];
  if (result === "pass") return full;
  if (result === "partial") return Math.round(full * s.partial_ratio);
  return 0;
}

export function breakdownRows(row: EvaluationRow): BreakdownRow[] {
  return CRITERIA.map((criterion) => {
    const result = row[`${criterion}_result`] ?? "needs_review";
    return {
      criterion,
      label: CRITERION_LABELS[criterion],
      result,
      reason: row[`${criterion}_reason`] ?? "",
      points: row.settings_snapshot ? pointsFor(criterion, result, row.settings_snapshot) : 0,
    };
  });
}
```

- [ ] **Step 4: Run** the test file — PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `feat: review reward helpers — AI schema, validation, prompt and breakdown`.

---

### Task 3: Gemini client + `/api/reviews/evaluate` route

**Files:**
- Create: `src/lib/ai/gemini.ts`, `src/lib/reviewEvaluation.ts`, `src/app/api/reviews/evaluate/route.ts`
- Test: `src/lib/reviewEvaluation.test.ts`

**Interfaces:**
- Consumes: Task 1 RPCs (`claim_review_evaluation`, `apply_review_evaluation`, `fail_review_evaluation`, `due_review_evaluations`), Task 2 (`buildEvaluationPrompt`, `parseAiEvaluation`, `AI_RESPONSE_SCHEMA`, `EvaluationPart`).
- Produces:
```ts
// gemini.ts
export const GEMINI_REVIEW_MODEL = "gemini-2.5-flash-lite";
export type GeminiImage = { mimeType: string; base64: string };
export async function geminiJson(opts: { system: string; text: string; images: GeminiImage[]; schema: object; timeoutMs: number }): Promise<unknown>; // throws on HTTP error/timeout/missing key
// reviewEvaluation.ts
export type EvaluateDeps = {
  claim(appointmentId: string): Promise<{ evaluationId: string; parts: EvaluationPart[] } | null>;
  downloadPhoto(path: string): Promise<GeminiImage | null>;
  grade(input: { system: string; text: string; images: GeminiImage[] }): Promise<unknown>;
  apply(evaluationId: string, result: AiEvaluation): Promise<{ status: string; points: number; balance: number; applied: boolean }>;
  fail(evaluationId: string, error: string): Promise<void>;
};
export type EvaluateOutcome = { status: "evaluated" | "needs_review" | "pending" | "not_found"; points?: number; balance?: number };
export async function evaluateAppointment(appointmentId: string, deps: EvaluateDeps): Promise<EvaluateOutcome>;
export const MAX_PHOTOS_TO_AI = 8;
// route: POST /api/reviews/evaluate
//   client: body { appointmentId } → 200 { status, points?, balance?, evaluation?: EvaluationRow }
//   cron:   header Authorization: Bearer <REVIEW_EVAL_SECRET>, body {} → 200 { processed: n }
```

- [ ] **Step 1: Failing tests for `evaluateAppointment`** (fake deps):
  - happy path: claim returns parts with 2 photos → downloadPhoto called twice, grade called with images, apply called with the parsed result → returns `{ status: "evaluated", points, balance }`;
  - `claim` returns null → `{ status: "not_found" }`, nothing else called;
  - `grade` throws (timeout) → `fail(evaluationId, message)` called, returns `{ status: "pending" }`;
  - `grade` returns junk → `fail` called with "invalid AI response", returns `pending`;
  - `apply` returns `applied: false` (already applied by a concurrent call) → returns its `status` and never calls `fail`;
  - more than `MAX_PHOTOS_TO_AI` photos → only the first 8 downloaded; a photo download returning null is skipped.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`src/lib/ai/gemini.ts`:
```ts
export const GEMINI_REVIEW_MODEL = "gemini-2.5-flash-lite";
export type GeminiImage = { mimeType: string; base64: string };

export async function geminiJson(opts: {
  system: string;
  text: string;
  images: GeminiImage[];
  schema: object;
  timeoutMs: number;
}): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_REVIEW_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: opts.system }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: opts.text },
                ...opts.images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json", responseSchema: opts.schema, temperature: 0 },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(`Gemini ${res.status}: ${body?.error?.message ?? "request failed"}`);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } finally {
    clearTimeout(timer);
  }
}
```

`src/lib/reviewEvaluation.ts`:
```ts
import { AI_RESPONSE_SCHEMA, buildEvaluationPrompt, parseAiEvaluation, type AiEvaluation, type EvaluationPart } from "@/lib/reviewRewards";
import type { GeminiImage } from "@/lib/ai/gemini";

export const MAX_PHOTOS_TO_AI = 8;
export { AI_RESPONSE_SCHEMA };

export type EvaluateDeps = {
  claim(appointmentId: string): Promise<{ evaluationId: string; parts: EvaluationPart[] } | null>;
  downloadPhoto(path: string): Promise<GeminiImage | null>;
  grade(input: { system: string; text: string; images: GeminiImage[] }): Promise<unknown>;
  apply(evaluationId: string, result: AiEvaluation): Promise<{ status: string; points: number; balance: number; applied: boolean }>;
  fail(evaluationId: string, error: string): Promise<void>;
};

export type EvaluateOutcome = {
  status: "evaluated" | "needs_review" | "pending" | "not_found";
  points?: number;
  balance?: number;
};

export async function evaluateAppointment(appointmentId: string, deps: EvaluateDeps): Promise<EvaluateOutcome> {
  const claimed = await deps.claim(appointmentId);
  if (!claimed) return { status: "not_found" };
  const { evaluationId, parts } = claimed;
  try {
    const paths = parts.flatMap((p) => p.photos).slice(0, MAX_PHOTOS_TO_AI);
    const images = (await Promise.all(paths.map((p) => deps.downloadPhoto(p)))).filter((i): i is GeminiImage => !!i);
    const prompt = buildEvaluationPrompt(parts);
    const parsed = parseAiEvaluation(await deps.grade({ ...prompt, images }));
    if (!parsed) {
      await deps.fail(evaluationId, "invalid AI response");
      return { status: "pending" };
    }
    const applied = await deps.apply(evaluationId, parsed);
    const status = applied.status === "needs_review" ? "needs_review" : applied.status === "evaluated" ? "evaluated" : "pending";
    return { status, points: applied.points, balance: applied.balance };
  } catch (err) {
    await deps.fail(evaluationId, err instanceof Error ? err.message : String(err)).catch(() => {});
    return { status: "pending" };
  }
}
```

`src/app/api/reviews/evaluate/route.ts` (read `node_modules/next/dist/docs/` route handler guide and `src/app/api/messenger/dispatch/route.ts` first; copy its `safeEqual` Bearer check and `maxDuration`):
- `export const maxDuration = 60;`
- Build `EvaluateDeps` with `createAdminClient()`:
  - `claim`: `rpc("claim_review_evaluation", { p_appointment_id })` → null or `{ evaluationId: data.evaluationId, parts: data.parts }`.
  - `downloadPhoto`: `storage.from("review-photos").download(path)` → `{ mimeType: blob.type || "image/jpeg", base64: Buffer.from(await blob.arrayBuffer()).toString("base64") }`, null on error (log via logQueryError).
  - `grade`: `geminiJson({ ...input, schema: AI_RESPONSE_SCHEMA, timeoutMs })`.
  - `apply`: `rpc("apply_review_evaluation", { p_evaluation_id, p_result, p_model: GEMINI_REVIEW_MODEL })`; throw on error.
  - `fail`: `rpc("fail_review_evaluation", …)`; log errors.
- Cron mode (Authorization header present): must equal `Bearer ${process.env.REVIEW_EVAL_SECRET}` via `safeEqual` (401 otherwise); `rpc("due_review_evaluations", { p_limit: 10 })`, evaluate each sequentially with `timeoutMs: 20000`, stop when 45 s elapsed; return `{ processed }`.
- Client mode: `createClient()` (server) → user required (401); body `{ appointmentId }` must be a UUID (400); verify with the user's client that `review_evaluations` row for that appointment has `client_id = user.id` (RLS already limits it; 404 if none); `evaluateAppointment(appointmentId, deps)` with `timeoutMs: 15000`; then read the evaluation row (admin client, `select` all `*_result/_reason/_confidence`, `status, points_awarded, ai_summary, settings_snapshot`) and the client's `client_rewards.current_points`; return `{ status, points, balance, evaluation }`. If status is `not_found` but the row exists (already evaluated or skipped), return the row's current status and data instead.

- [ ] **Step 4: Run** tests — PASS; `npx tsc --noEmit`; eslint changed files; `npm test`.

- [ ] **Step 5: Commit** — `feat: AI review evaluation route with Gemini and retries`.

---

### Task 4: Review form — tags, evaluation call, reward result, My Services points

**Files:**
- Modify: `src/lib/supabase/queries/visitReviews.ts`, `src/components/reviews/VisitReviewModal.tsx`, `src/components/my-glow/MyServicesList.tsx`
- Create: `src/components/reviews/ReviewTagPicker.tsx`, `src/components/reviews/RewardResultPanel.tsx`
- Test: `src/lib/supabase/queries/visitReviews.test.ts` (extend)

**Interfaces:**
- Consumes: `set_visit_review_tags` (Task 1), `/api/reviews/evaluate` (Task 3), Task 2 (`tagsForService`, `breakdownRows`, `EvaluationRow`, `CriterionResult`).
- Produces: `ServiceDraft.tags: string[]`; `ServicePart.tags: string[]`; `VisitReview.reward: { status: string; points: number } | null`; `requestReviewEvaluation(appointmentId: string, timeoutMs?: number): Promise<{ status: string; points?: number; balance?: number; evaluation?: EvaluationRow } | null>` exported from `visitReviews.ts`.

- [ ] **Step 1: Failing tests** (extend the fake client in `visitReviews.test.ts`): after a successful `submit_visit_review`, `saveVisitReview` calls `rpc("set_visit_review_tags", { p_appointment_id, p_tags: [{ position, tags }] })` only when some part has tags; a failing tags RPC is logged and does NOT turn the save into an error.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**
  - `visitReviews.ts`: `ServiceDraft` gains `tags: string[]`; after RPC success, if any draft part has tags, call `set_visit_review_tags` (log errors with `logQueryError`, ignore). `getVisitReviews` also selects `tags` per service part and, in a separate query, `review_evaluations(appointment_id, status, points_awarded)` for the client → `VisitReview.reward` (`null` when none or when the query fails pre-052). `requestReviewEvaluation`: `fetch("/api/reviews/evaluate", { method: "POST", body: JSON.stringify({ appointmentId }), signal })` with an `AbortController` timeout (default 20000 ms); any failure → `null`.
  - `ReviewTagPicker`: chip buttons (`aria-pressed`, rounded-full, selected = `bg-coral text-white`, else `border border-ink/15`), max 6, options from `tagsForService(serviceName)`; read-only mode renders selected chips only.
  - `VisitReviewModal`: a tag picker under each service comment (prefilled in edit/view). After a successful **submit** (not edit): show "Evaluating your review…" (spinner, `role="status"`), call `requestReviewEvaluation`; if it returns `evaluated`/`needs_review` with `evaluation`, show `RewardResultPanel`; otherwise show "Thanks! Your reward is being calculated — we'll notify you." Edits keep today's "Your review was updated." message.
  - `RewardResultPanel`: "🎉 Review Evaluated!", "Thank you for sharing your experience.", big "+{points} GlowPoints", "Your current balance: {balance} GlowPoints", the `breakdownRows` list (icons: `pass` ✓ green, `partial` ½ amber, `fail` ✗ ink/40, `needs_review` ⏳ amber "Our team will check this", `not_provided` — ink/40), total line, and when status is `needs_review`: "Some points are waiting for our team to check." Buttons **View My Rewards** (`/my-glow#rewards`, closes modal) and **Done**.
  - `MyServicesList`: a reviewed visit shows `+{points} GlowPoints` (gold) when `reward.status` is `evaluated`/`needs_review` and points > 0, "Reward pending" when `pending`, nothing otherwise.
- [ ] **Step 4: Verify** — tests, tsc, eslint changed files, `npm test`.
- [ ] **Step 5: Commit** — `feat: review tags and instant GlowPoints reward breakdown`.

---

### Task 5: My Rewards card and points history

**Files:**
- Create: `src/lib/supabase/queries/rewards.ts`, `src/components/my-glow/MyRewardsCard.tsx`
- Test: `src/lib/supabase/queries/rewards.test.ts`
- Modify: `src/app/my-glow/page.tsx` (replace `GlowRewardsCard` usage), `src/app/api/assistant/route.ts` (tier from lifetime points)
- Delete: `src/components/my-glow/GlowRewardsCard.tsx` if no other importer remains (`grep -rn GlowRewardsCard src`)

**Interfaces:**
- Consumes: `client_rewards`, `points_transactions` (Task 1), `getTierProgress` (`src/lib/myGlowTiers.ts`).
- Produces:
```ts
export type PointsEntry = { id: string; type: "opening_balance" | "review_reward" | "admin_adjustment"; points: number; balanceAfter: number; createdAt: string; label: string };
export type MyRewards = { balance: number; lifetimeEarned: number; history: PointsEntry[]; hasMore: boolean };
export function describeEntry(type: string, note: string | null, serviceName: string | null): string;
export async function getMyRewards(supabase, clientId: string, fallbackPoints: number, offset?: number): Promise<MyRewards>;
```

- [ ] **Step 1: Failing tests** for `describeEntry`: `review_reward` + "Deep Tissue Massage" → "Review — Deep Tissue Massage"; `review_reward` without service → "Review reward"; `admin_adjustment` → "Review check (team)"; `opening_balance` → "Starting balance".
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**
  - `getMyRewards`: read `client_rewards` (`current_points, lifetime_earned`); read 10 transactions from `offset` ordered newest first with `appointment:appointments(booked:appointment_services(service_name, position))` for the label (first booked service); on any error (pre-052) log via `logQueryError` and return `{ balance: fallbackPoints, lifetimeEarned: fallbackPoints, history: [], hasMore: false }`.
  - `MyRewardsCard` (client component, `id="rewards"`, same card style as the old `GlowRewardsCard`): "✨ GlowPoints" + big balance; tier line and progress bar from `getTierProgress(lifetimeEarned)` ("{tier} Member", "Earn {pointsToNext} more points to reach {nextTier}" or "Max tier reached"); "Points History" list (label, `toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" })`, `+N` green / `−N` red); **Show more** loads the next 10 with the browser client; empty state "No points yet — review a completed visit to earn GlowPoints."; **Redeem Rewards** button `disabled` with "Coming soon" helper text.
  - `my-glow/page.tsx`: fetch `getMyRewards(supabase, auth.user.id, profile.loyalty_points)` with the other queries; render `<MyRewardsCard initial={…} clientId={…} />` where `GlowRewardsCard` was.
  - `assistant/route.ts`: tier from `client_rewards.lifetime_earned` when available (select it; fall back to `loyalty_points`).
- [ ] **Step 4: Verify** — tests, tsc, eslint changed files, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** — `feat: My Rewards card with GlowPoints history and lifetime tiers`.

---

### Task 6: Admin Rewards page — Needs Review queue, retry, settings, stats; evaluation in review detail

**Files:**
- Create: `src/lib/supabase/queries/adminRewards.ts`, `src/app/admin/reviews/rewards/page.tsx`, `src/components/admin/reviews/RewardsManager.tsx`, `src/components/admin/reviews/EvaluationCard.tsx`
- Test: `src/lib/supabase/queries/adminRewards.test.ts`
- Modify: `src/components/admin/reviews/ReviewsManager.tsx` (link "Rewards" next to the page title), `src/components/admin/reviews/ReviewDetailPanel.tsx` (show `EvaluationCard` for the review's appointment)

**Interfaces:**
- Consumes: `review_evaluations`, `review_evaluation_overrides`, `review_reward_settings`, `points_transactions`, RPCs `override_review_criterion`, `retry_review_evaluation`, `update_review_reward_settings` (Task 1); Task 2 (`breakdownRows`, `CRITERION_LABELS`, `EvaluationRow`, `Criterion`).
- Produces:
```ts
export type RewardSettings = { ratingPoints: number; meaningfulPoints: number; specificPoints: number; relevantPoints: number; photoPoints: number; partialRatio: number; maxPoints: number; enabled: boolean };
export function validateSettings(s: RewardSettings): string | null; // message or null
export async function getRewardSettings(supabase): Promise<RewardSettings | null>;
export async function saveRewardSettings(supabase, s: RewardSettings): Promise<string | null>;
export async function listRewardQueue(supabase): Promise<QueueItem[]>; // needs_review + failed, oldest first, with appointment date, client name, visit review parts + photo paths
export async function getEvaluationForAppointment(supabase, appointmentId: string): Promise<(EvaluationRow & { id: string; overrides: … }) | null>;
export async function overrideCriterion(supabase, evaluationId: string, criterion: Criterion, decision: "pass" | "partial" | "fail", reason: string): Promise<string | null>;
export async function retryEvaluation(supabase, evaluationId: string): Promise<string | null>;
export async function getRewardStats(supabase): Promise<{ pointsThisMonth: number; reviewsRewarded: number; averagePoints: number }>;
```

- [ ] **Step 1: Failing tests** for `validateSettings`: each points value must be an integer 0–1000, `partialRatio` 0–1, `maxPoints` integer 0–5000 → exact messages "Points must be whole numbers from 0 to 1000.", "Partial must be between 0% and 100%.", "Max points must be a whole number from 0 to 5000."; valid defaults → null.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**
  - Queries as listed; RPC error codes mapped: `REVIEW_FORBIDDEN` → "Only admins can do this.", `EVAL_BAD_STATE` → "This review changed — refresh and try again.", `REVIEW_INVALID` → "Check the values and try again.", else "Couldn't save. Please try again."; all reads log via `logQueryError` and degrade to empty/null pre-052.
  - `/admin/reviews/rewards` page: admin guard the same way `src/app/admin/reviews/page.tsx` does; renders `RewardsManager`.
  - `RewardsManager`: stats row (points issued this month, reviews rewarded, average points); **Needs Review** list — each item: client first name + last initial, visit date, service names, stars/comments/tags per part, photo thumbnails (signed with `createSignedUrls(paths, 3600)`; click → `PhotoLightbox` from `src/components/reviews/PhotoLightbox.tsx`), and `EvaluationCard` in admin mode; **Failed** list with last error and **Retry**; **Reward Settings** form (7 number inputs with % for partial, enabled toggle, `validateSettings` inline errors, confirm dialog "New values apply to future reviews only.", success toast).
  - `EvaluationCard` (props `evaluation`, `admin: boolean`, `onChanged`): status pill, AI summary, `breakdownRows` with result icon, confidence, reason and points; for `needs_review` criteria in admin mode: Approve / Partial / Reject buttons + required reason input → `overrideCriterion`; overrides history (criterion, original → decision, points, reason, time).
  - `ReviewDetailPanel`: under the review, `EvaluationCard` (admin) for `review.appointmentId` when an evaluation exists.
- [ ] **Step 4: Verify** — tests, tsc, eslint changed files, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** — `feat: admin review rewards — needs-review queue, overrides, retry and settings`.

---

### Task 7: Final checks

- [ ] `npm test && npx tsc --noEmit -p . && npm run lint && npm run build` — all pass; lint at 31 errors / 34 warnings.
- [ ] `grep -rn "GEMINI_API_KEY" src` — only server files (`src/app/api/**`, `src/lib/ai/**`); no `NEXT_PUBLIC_` exposure.
- [ ] `grep -rn "createAdminClient" src/components` — none (service role never in client components).
- [ ] Add `REVIEW_EVAL_SECRET=` (empty placeholder with a comment) to `.env.example` if that file exists; never write real secrets.
- [ ] Deferred manual (after 048 → 049 → 051 → 052, Vault secrets, `REVIEW_EVAL_SECRET` env): detailed 2★ review with photo (up to 50), "Good." (low), long off-topic review (relevant fail), Admin override on a needs-review photo, remove `GEMINI_API_KEY` locally → "being calculated" → restore → cron awards and bell appears; check script all PASS.
