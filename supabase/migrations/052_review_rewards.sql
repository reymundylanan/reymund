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
   and not exists (select 1 from points_transactions t where t.client_id = p.id);

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
