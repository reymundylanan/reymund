-- 048_review_moderation.sql
-- Visit reviews (service / staff / branch per completed appointment),
-- review moderation (visible/hidden/removed + audit log), a server-side
-- word filter (English, Tagalog, Bisaya/Cebuano), and public views for
-- staff profiles. All review writes go through SECURITY DEFINER
-- functions; clients can no longer insert into reviews directly.

-- ── Columns ───────────────────────────────────────────────────────────

alter table reviews add column if not exists target_type text;
alter table reviews add column if not exists staff_id uuid references staff_members(id) on delete set null;
alter table reviews add column if not exists service_id uuid references branch_services(id) on delete set null;
alter table reviews add column if not exists status text not null default 'visible';
alter table reviews add column if not exists status_changed_at timestamptz;
alter table reviews add column if not exists status_changed_by uuid references profiles(id) on delete set null;
alter table reviews add column if not exists admin_seen_at timestamptz;

-- ── Backfill existing rows ────────────────────────────────────────────

-- Only rows not yet backfilled (target_type null) count as pre-existing;
-- this must run before the target_type backfills below, and a re-run
-- must not mark newer unseen reviews as seen.
update reviews set admin_seen_at = coalesce(admin_seen_at, created_at) where target_type is null;

update reviews r
   set target_type = 'service',
       service_id = a.service_id
  from appointments a
 where r.target_type is null and r.appointment_id is not null and a.id = r.appointment_id;

do $$
begin
  if to_regclass('public.professionals') is not null then
    execute $q$
      update reviews r
         set target_type = 'staff',
             staff_id = coalesce(
               (select sm.id from staff_members sm where sm.id = r.professional_id),
               (select sm.id
                 from professionals p
                 join staff_members sm on lower(trim(sm.full_name)) = lower(trim(p.name))
                where p.id = r.professional_id
                limit 1))
       where r.target_type is null and r.professional_id is not null
    $q$;
  else
    update reviews r
       set target_type = 'staff',
           staff_id = (select sm.id from staff_members sm where sm.id = r.professional_id)
     where r.target_type is null and r.professional_id is not null;
  end if;
end $$;

update reviews set target_type = 'branch' where target_type is null;

alter table reviews alter column target_type set not null;

-- ── Constraints & indexes ─────────────────────────────────────────────

alter table reviews drop constraint if exists reviews_target_type_check;
alter table reviews add constraint reviews_target_type_check
  check (target_type in ('service', 'staff', 'branch'));

alter table reviews drop constraint if exists reviews_status_check;
alter table reviews add constraint reviews_status_check
  check (status in ('visible', 'hidden', 'removed'));

alter table reviews drop constraint if exists reviews_target_check;
alter table reviews add constraint reviews_target_check check (
  (target_type = 'service' and appointment_id is not null)
  or target_type = 'staff'
  or (target_type = 'branch' and branch_id is not null)
);

drop index if exists reviews_client_professional_uniq;
drop index if exists reviews_client_appointment_uniq;
create unique index if not exists reviews_appointment_target_uniq
  on reviews (appointment_id, target_type) where appointment_id is not null;

create index if not exists reviews_type_status_created_idx on reviews (target_type, status, created_at desc);
create index if not exists reviews_staff_idx on reviews (staff_id);
create index if not exists reviews_service_idx on reviews (service_id);
create index if not exists reviews_branch_idx on reviews (branch_id);
create index if not exists reviews_unseen_idx on reviews (created_at desc) where admin_seen_at is null;

-- ── Word list ─────────────────────────────────────────────────────────

create table if not exists blocked_review_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  language text not null check (language in ('en', 'tl', 'ceb')),
  category text not null check (category in ('abusive', 'sexual', 'threat', 'discriminatory')),
  created_at timestamptz not null default now(),
  constraint blocked_review_terms_term_format check (term ~ '^[a-z]+( [a-z]+)*$')
);

alter table blocked_review_terms enable row level security;

drop policy if exists "admin manage blocked_review_terms" on blocked_review_terms;
create policy "admin manage blocked_review_terms" on blocked_review_terms for all
  using (public.current_user_role()::text = 'admin')
  with check (public.current_user_role()::text = 'admin');

-- Terms are stored already normalized (lowercase letters, single spaces).
-- Never add words that only express dissatisfaction (bad, terrible, rude,
-- worst, rushed, dirty, pangit, bati, etc.).
insert into blocked_review_terms (term, language, category) values
  -- English
  ('fuck','en','abusive'),('fucking','en','abusive'),('fucked','en','abusive'),('fucker','en','abusive'),
  ('motherfucker','en','abusive'),('fck','en','abusive'),('fk','en','abusive'),('fuk','en','abusive'),
  ('fuq','en','abusive'),('fking','en','abusive'),('fcking','en','abusive'),('stfu','en','abusive'),
  ('shit','en','abusive'),('bullshit','en','abusive'),('sht','en','abusive'),
  ('bitch','en','abusive'),('btch','en','abusive'),('bitches','en','abusive'),
  ('bastard','en','abusive'),('asshole','en','abusive'),('dickhead','en','abusive'),
  ('cunt','en','abusive'),('twat','en','abusive'),('wanker','en','abusive'),
  ('slut','en','abusive'),('whore','en','abusive'),('retard','en','discriminatory'),('retarded','en','discriminatory'),
  ('porn','en','sexual'),('pussy','en','sexual'),('cock','en','sexual'),
  ('blowjob','en','sexual'),('dildo','en','sexual'),('horny','en','sexual'),
  ('boobs','en','sexual'),('tits','en','sexual'),('rape','en','threat'),
  ('kill you','en','threat'),('burn this place','en','threat'),
  ('nigger','en','discriminatory'),('nigga','en','discriminatory'),('faggot','en','discriminatory'),
  ('fag','en','discriminatory'),('chink','en','discriminatory'),('tranny','en','discriminatory'),
  -- Tagalog
  ('putangina','tl','abusive'),('putang ina','tl','abusive'),('tangina','tl','abusive'),
  ('tanginamo','tl','abusive'),('tangina mo','tl','abusive'),('puta','tl','abusive'),
  ('gago','tl','abusive'),('tarantado','tl','abusive'),('tarantada','tl','abusive'),
  ('ulol','tl','abusive'),('ulul','tl','abusive'),('tanga','tl','abusive'),('bobo','tl','abusive'),
  ('punyeta','tl','abusive'),('pakshet','tl','abusive'),('pakyu','tl','abusive'),
  ('kupal','tl','abusive'),('hindot','tl','sexual'),('kantot','tl','sexual'),
  ('jakol','tl','sexual'),('tite','tl','sexual'),('pekpek','tl','sexual'),
  ('burat','tl','sexual'),('bayag','tl','sexual'),('papatayin kita','tl','threat'),('patayin kita','tl','threat'),
  -- Bisaya / Cebuano
  ('yawa','ceb','abusive'),('yawaa','ceb','abusive'),('piste','ceb','abusive'),('pisti','ceb','abusive'),
  ('giatay','ceb','abusive'),
  ('bilat','ceb','sexual'),('oten','ceb','sexual'),('iyot','ceb','sexual'),
  ('libog','ceb','sexual'),('patyon tika','ceb','threat'),('patyon ta ka','ceb','threat')
on conflict (term) do nothing;

-- ── Moderation log ────────────────────────────────────────────────────

create table if not exists review_moderation_log (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  action text not null check (action in ('hide', 'show', 'remove', 'restore')),
  from_status text not null,
  to_status text not null,
  reason text,
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists review_moderation_log_review_idx on review_moderation_log (review_id, created_at desc);

alter table review_moderation_log enable row level security;

drop policy if exists "admin read review_moderation_log" on review_moderation_log;
create policy "admin read review_moderation_log" on review_moderation_log for select
  using (public.current_user_role()::text = 'admin');

-- ── Text helpers ──────────────────────────────────────────────────────

create or replace function clean_review_text(p text) returns text
language sql immutable as $$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p, ''), '</?[a-zA-Z][^>]*>', '', 'g'),     -- HTML tags
        '[\x00-\x08\x0B-\x1F\x7F]', '', 'g'),                     -- control chars (keep \t, \n)
      '[ \t]+', ' ', 'g')),                                        -- collapse spaces
    '')
$$;

create or replace function normalize_review_text(p text) returns text
language sql immutable as $$
  select regexp_replace(
           regexp_replace(
             translate(lower(coalesce(p, '')), '130457@$', 'ieoastas'),
             '([a-z])[*._~-]+(?=[a-z])', '\1', 'g'),               -- f.u.c.k / f*ck
           '([a-z])\1\1+', '\1', 'g')                               -- fuuuck (3+ repeats)
$$;

create or replace function review_text_is_clean(p text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_tokens text[];
  v_joined text := ' ';
  v_run text := '';
  v_tok text;
begin
  if p is null or btrim(p) = '' then
    return true;
  end if;

  v_tokens := regexp_split_to_array(normalize_review_text(p), '[^a-z]+');

  -- Rebuild as ' w1 w2 … ' where runs of single letters ("f u c k") are
  -- merged into one word.
  foreach v_tok in array v_tokens loop
    if v_tok = '' then
      continue;
    elsif length(v_tok) = 1 then
      v_run := v_run || v_tok;
    else
      if v_run <> '' then
        v_joined := v_joined || v_run || ' ';
        v_run := '';
      end if;
      v_joined := v_joined || v_tok || ' ';
    end if;
  end loop;
  if v_run <> '' then
    v_joined := v_joined || v_run || ' ';
  end if;

  return not exists (
    select 1 from blocked_review_terms t
     where position(' ' || t.term || ' ' in v_joined) > 0
  );
end;
$$;

revoke execute on function review_text_is_clean(text) from public, anon, authenticated;

-- ── Submit ────────────────────────────────────────────────────────────

create or replace function submit_visit_review(
  p_appointment_id uuid,
  p_service_rating smallint, p_service_text text,
  p_staff_rating smallint,   p_staff_text text,
  p_branch_rating smallint,  p_branch_text text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_appt record;
  v_service_text text := clean_review_text(p_service_text);
  v_staff_text text := clean_review_text(p_staff_text);
  v_branch_text text := clean_review_text(p_branch_text);
begin
  select id, client_id, status::text as status, session_status, professional_id, branch_id, service_id
    into v_appt
    from appointments where id = p_appointment_id;

  if v_uid is null or v_appt.id is null or v_appt.client_id is distinct from v_uid
     or not (v_appt.status = 'completed' or coalesce(v_appt.session_status, '') in ('completed', 'paid')) then
    raise exception 'REVIEW_NOT_ALLOWED';
  end if;

  if exists (select 1 from reviews where appointment_id = p_appointment_id) then
    raise exception 'REVIEW_DUPLICATE';
  end if;

  if p_service_rating is null or p_service_rating not between 1 and 5
     or (p_staff_rating is not null and p_staff_rating not between 1 and 5)
     or (p_branch_rating is not null and p_branch_rating not between 1 and 5)
     or length(coalesce(v_service_text, '')) > 1000
     or length(coalesce(v_staff_text, '')) > 1000
     or length(coalesce(v_branch_text, '')) > 1000 then
    raise exception 'REVIEW_INVALID';
  end if;

  if not (review_text_is_clean(v_service_text) and review_text_is_clean(v_staff_text)
          and review_text_is_clean(v_branch_text)) then
    raise exception 'REVIEW_INAPPROPRIATE';
  end if;

  insert into reviews (client_id, appointment_id, target_type, rating, text, service_id, branch_id, status)
  values (v_uid, p_appointment_id, 'service', p_service_rating, v_service_text, v_appt.service_id, v_appt.branch_id, 'visible');

  if p_staff_rating is not null and v_appt.professional_id is not null then
    insert into reviews (client_id, appointment_id, target_type, rating, text, staff_id, service_id, branch_id, status)
    values (v_uid, p_appointment_id, 'staff', p_staff_rating, v_staff_text, v_appt.professional_id, v_appt.service_id, v_appt.branch_id, 'visible');
  end if;

  if p_branch_rating is not null and v_appt.branch_id is not null then
    insert into reviews (client_id, appointment_id, target_type, rating, text, service_id, branch_id, status)
    values (v_uid, p_appointment_id, 'branch', p_branch_rating, v_branch_text, v_appt.service_id, v_appt.branch_id, 'visible');
  end if;
exception
  when unique_violation then
    raise exception 'REVIEW_DUPLICATE';
end;
$$;

revoke execute on function submit_visit_review(uuid, smallint, text, smallint, text, smallint, text) from public, anon;
grant execute on function submit_visit_review(uuid, smallint, text, smallint, text, smallint, text) to authenticated;

-- ── Moderate ──────────────────────────────────────────────────────────

create or replace function moderate_review(p_review_id uuid, p_action text, p_reason text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_from text;
  v_to text;
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'REVIEW_FORBIDDEN';
  end if;

  select status into v_from from reviews where id = p_review_id for update;
  if v_from is null then
    raise exception 'REVIEW_BAD_TRANSITION';
  end if;

  v_to := case
    when p_action = 'hide' and v_from = 'visible' then 'hidden'
    when p_action = 'show' and v_from = 'hidden' then 'visible'
    when p_action = 'remove' and v_from in ('visible', 'hidden') then 'removed'
    when p_action = 'restore' and v_from = 'removed' then 'visible'
  end;
  if v_to is null then
    raise exception 'REVIEW_BAD_TRANSITION';
  end if;

  update reviews
     set status = v_to,
         status_changed_at = now(),
         status_changed_by = auth.uid(),
         admin_seen_at = coalesce(admin_seen_at, now())
   where id = p_review_id;

  insert into review_moderation_log (review_id, action, from_status, to_status, reason, actor_id)
  values (p_review_id, p_action, v_from, v_to, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());
end;
$$;

revoke execute on function moderate_review(uuid, text, text) from public, anon;
grant execute on function moderate_review(uuid, text, text) to authenticated;

create or replace function mark_reviews_seen(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'REVIEW_FORBIDDEN';
  end if;
  update reviews set admin_seen_at = now() where id = any(p_ids) and admin_seen_at is null;
end;
$$;

revoke execute on function mark_reviews_seen(uuid[]) from public, anon;
grant execute on function mark_reviews_seen(uuid[]) to authenticated;

-- ── RLS on reviews ────────────────────────────────────────────────────

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'reviews' loop
    execute format('drop policy %I on reviews', pol.policyname);
  end loop;
end $$;

alter table reviews enable row level security;

create policy "read reviews" on reviews for select using (
  status = 'visible'
  or client_id = auth.uid()
  or coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk', 'specialist')
);
-- No insert/update/delete policies: writes only via the functions above.

-- ── Public views (owner privileges; expose only safe columns) ─────────

create or replace view public_staff_profiles as
select sm.id, sm.full_name, sm.department, sm.branch_id, b.name as branch_name, sm.avatar_url
  from staff_members sm
  left join branches b on b.id = sm.branch_id;

create or replace view public_staff_reviews as
select r.id, r.staff_id, r.rating, r.text, r.created_at,
       coalesce(
         nullif(btrim(split_part(btrim(p.full_name), ' ', 1) || ' ' ||
                      coalesce(left(nullif(split_part(btrim(p.full_name), ' ', 2), ''), 1) || '.', '')), ''),
         'Client') as reviewer
  from reviews r
  left join profiles p on p.id = r.client_id
 where r.target_type = 'staff' and r.status = 'visible' and r.staff_id is not null;

grant select on public_staff_profiles to anon, authenticated;
grant select on public_staff_reviews to anon, authenticated;

-- ── Realtime ──────────────────────────────────────────────────────────

do $$ begin
  alter publication supabase_realtime add table reviews;
exception when duplicate_object then null; end $$;
