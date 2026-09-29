# Visit Reviews, Staff Profiles & Review Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One "Rate your visit" review (service + staff + optional branch) per completed appointment, public staff profile pages with ratings, an admin Reviews moderation page with audit log, and a server-side profanity filter (EN/TL/CEB) — with hides reflected everywhere.

**Architecture:** Extend the existing `reviews` table to one row per target (`service`/`staff`/`branch`) per appointment with a `status`. All writes go through SECURITY DEFINER functions (`submit_visit_review`, `moderate_review`, `mark_reviews_seen`); direct client inserts are removed. Public pages read owner-privileged views that expose only visible reviews and non-sensitive staff columns. The admin page and My Glow subscribe to Realtime on `reviews`.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, Supabase (Postgres, RLS, Realtime), Tailwind, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-reviews-moderation-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` before using a Next API you're unsure of (AGENTS.md). Page `params`/`searchParams` are Promises and must be awaited.
- Migration file: `supabase/migrations/048_review_moderation.sql`. The user applies it in the Supabase SQL Editor; implementers never run SQL against the live DB.
- Completed visit = `appointments.status::text = 'completed'` OR `session_status in ('completed','paid')`.
- `reviews.target_type in ('service','staff','branch')`; `reviews.status in ('visible','hidden','removed')`; at most one row per `(appointment_id, target_type)`.
- Client-facing messages (exact): blocked words → `Please keep your review respectful and appropriate.`; duplicate → `You've already reviewed this visit.`; not allowed → `You can only review completed visits.`; other → `Couldn't submit your review. Please try again.`
- RPC error messages are the stable codes `REVIEW_NOT_ALLOWED`, `REVIEW_DUPLICATE`, `REVIEW_INVALID`, `REVIEW_INAPPROPRIATE`, `REVIEW_FORBIDDEN`, `REVIEW_BAD_TRANSITION`.
- `reviews` gains a second FK to `profiles` (`status_changed_by`), so any embed of the client from `reviews` MUST be `profiles!reviews_client_id_fkey(...)`.
- Review text is rendered only as React text nodes; never `dangerouslySetInnerHTML`.
- Public pages never read `staff_members` directly — only the `public_staff_profiles` / `public_staff_reviews` views (no phone, no full client names).
- Comment max length 1000 characters (after cleaning).
- Style: Tailwind with `ink`, `coral`, `coral-dark`, `gold`, `rose`, `blush` tokens; `lucide-react` icons; `one()` helper for embeds.
- Commits: message, blank line, then exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Adding `status_changed_by` makes existing `profiles(...)` embeds from `reviews` ambiguous** → Reports "Client Reviews" would break the moment 048 is applied. Task 2 qualifies every such embed (grep step) before any UI work.
2. **An honest negative review in Tagalog/Bisaya ("pangit ang serbisyo", "bati kaayo ang massage") or containing a blocked word inside an innocent word (Scunthorpe, class, shitake)** must pass → covered by the SQL check script in Task 1 Step 4.
3. **Double-click / two tabs submitting the same visit** → second call must fail `REVIEW_DUPLICATE` and the UI refetches, never showing a half-saved review (RPC single transaction + unique index; Task 1 check + Task 3 handling).
4. **A client whose review part was hidden** must see "Hidden by the spa" rather than the part silently disappearing or the whole review vanishing (Task 3 display + test on status mapping).
5. **Admin hides a review while another admin tab is open, or the staff page is open** → the admin list updates live via Realtime; the public staff page shows the change on next load because it's dynamic (Task 4 `dynamic = "force-dynamic"`, Task 6 subscription).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/048_review_moderation.sql` | Schema, backfill, word list, functions, RLS, views, realtime |
| `supabase/tests/048_reviews_check.sql` | Rolled-back verification script the user runs |
| `src/lib/reviews.ts` (+ test) | Shared review types, error-code → message, rating summary |
| `src/lib/supabase/queries/reports.ts` | Visible-only summary, qualified embed |
| `src/lib/supabase/queries/myGlow.ts` | `getVisitReviews`, `submitVisitReview`, `getMyReviews` (rewritten) |
| `src/components/my-glow/MyServicesList.tsx` | "Rate your visit" form + per-part display |
| `src/components/my-glow/ReviewsPanel.tsx` | My Reviews list only |
| `src/lib/supabase/queries/staffProfiles.ts` | Public staff list/profile reads |
| `src/components/home/Team.tsx`, `src/app/team/[id]/page.tsx` | Public team + profile |
| `src/components/staff/StaffRatingBlock.tsx` | Rating block for staff panels |
| `src/lib/supabase/queries/adminReviews.ts` | Admin list/detail/stats/moderate |
| `src/app/admin/reviews/page.tsx`, `src/components/admin/reviews/*` | Admin Reviews page |

---

### Task 1: Migration 048 and SQL verification script

**Files:**
- Create: `supabase/migrations/048_review_moderation.sql`, `supabase/tests/048_reviews_check.sql`

**Interfaces — Produces:**
- `reviews` columns: `target_type, staff_id, service_id, status, status_changed_at, status_changed_by, admin_seen_at`
- tables `blocked_review_terms(id, term, language, category, created_at)`, `review_moderation_log(id, review_id, action, from_status, to_status, reason, actor_id, created_at)`
- functions: `clean_review_text(text) → text`, `normalize_review_text(text) → text`, `review_text_is_clean(text) → boolean`, `submit_visit_review(uuid, smallint, text, smallint, text, smallint, text) → void`, `moderate_review(uuid, text, text) → void`, `mark_reviews_seen(uuid[]) → void`
- views: `public_staff_profiles(id, full_name, department, branch_id, branch_name, avatar_url)`, `public_staff_reviews(id, staff_id, rating, text, created_at, reviewer)`

- [ ] **Step 1: Write the migration**

```sql
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
             staff_id = (
               select sm.id
                 from professionals p
                 join staff_members sm on lower(trim(sm.full_name)) = lower(trim(p.name))
                where p.id = r.professional_id
                limit 1)
       where r.target_type is null and r.professional_id is not null
    $q$;
  else
    update reviews set target_type = 'staff'
     where target_type is null and professional_id is not null;
  end if;
end $$;

update reviews set target_type = 'branch' where target_type is null;
update reviews set admin_seen_at = coalesce(admin_seen_at, created_at);

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
  created_at timestamptz not null default now()
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
  ('cunt','en','abusive'),('twat','en','abusive'),('wanker','en','abusive'),('prick','en','abusive'),
  ('slut','en','abusive'),('whore','en','abusive'),('retard','en','discriminatory'),('retarded','en','discriminatory'),
  ('porn','en','sexual'),('pussy','en','sexual'),('cock','en','sexual'),('dick','en','sexual'),
  ('blowjob','en','sexual'),('dildo','en','sexual'),('horny','en','sexual'),('nudes','en','sexual'),
  ('boobs','en','sexual'),('tits','en','sexual'),('rape','en','threat'),
  ('kill you','en','threat'),('i will kill','en','threat'),('burn this place','en','threat'),
  ('nigger','en','discriminatory'),('nigga','en','discriminatory'),('faggot','en','discriminatory'),
  ('fag','en','discriminatory'),('chink','en','discriminatory'),('tranny','en','discriminatory'),
  -- Tagalog
  ('putangina','tl','abusive'),('putang ina','tl','abusive'),('tangina','tl','abusive'),
  ('tanginamo','tl','abusive'),('tangina mo','tl','abusive'),('puta','tl','abusive'),
  ('gago','tl','abusive'),('gaga','tl','abusive'),('tarantado','tl','abusive'),('tarantada','tl','abusive'),
  ('ulol','tl','abusive'),('ulul','tl','abusive'),('tanga','tl','abusive'),('bobo','tl','abusive'),
  ('punyeta','tl','abusive'),('pakshet','tl','abusive'),('pakyu','tl','abusive'),
  ('kupal','tl','abusive'),('hayop ka','tl','abusive'),('hindot','tl','sexual'),('kantot','tl','sexual'),
  ('jakol','tl','sexual'),('tite','tl','sexual'),('puke','tl','sexual'),('pekpek','tl','sexual'),
  ('burat','tl','sexual'),('bayag','tl','sexual'),('papatayin kita','tl','threat'),('patayin kita','tl','threat'),
  -- Bisaya / Cebuano
  ('yawa','ceb','abusive'),('yawaa','ceb','abusive'),('piste','ceb','abusive'),('pisti','ceb','abusive'),
  ('buang','ceb','abusive'),('boang','ceb','abusive'),('giatay','ceb','abusive'),
  ('animal ka','ceb','abusive'),('bilat','ceb','sexual'),('oten','ceb','sexual'),('iyot','ceb','sexual'),
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
        regexp_replace(coalesce(p, ''), '<[^>]*>', '', 'g'),     -- HTML tags
        '[\x00-\x09\x0B-\x1F\x7F]', '', 'g'),                     -- control chars (keep \n)
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
```

- [ ] **Step 2: Write the verification script `supabase/tests/048_reviews_check.sql`**

```sql
-- Run in the Supabase SQL Editor AFTER applying 048. Everything is rolled
-- back. Replace the two placeholders first:
--   :CLIENT_ID   a customer profile id
--   :DONE_APPT   one of that customer's COMPLETED appointments with NO review yet
begin;

do $$
declare
  ok int := 0; bad int := 0;
  procedure_check text;
  function_check boolean;
begin
  -- Word filter: must be blocked
  foreach procedure_check in array array[
    'you are a fuck', 'f*ck this', 'f.u.c.k', 'sh1t service', 'fuuuck', 'f u c k you',
    'PUTANGINA', 'putang ina mo', 'gago ka', 'yawa ka', 'i will kill you', '<b>bitch</b>'
  ] loop
    if review_text_is_clean(procedure_check) then
      raise warning 'FAIL (should block): %', procedure_check; bad := bad + 1;
    else ok := ok + 1; end if;
  end loop;

  -- Must pass: honest negatives and innocent embeds
  foreach procedure_check in array array[
    'The massage was terrible, rushed and the staff was rude.',
    'Pangit ang serbisyo, dili ko balik.', 'Bati kaayo ang massage.',
    'Worst facial ever. Dirty towels.', 'Great class, Scunthorpe style assessment of my skin',
    'Shitake mushroom tea was nice', 'Gagawin ko ulit!', 'Mabuti naman.'
  ] loop
    if review_text_is_clean(procedure_check) then ok := ok + 1;
    else raise warning 'FAIL (should pass): %', procedure_check; bad := bad + 1; end if;
  end loop;

  -- Cleaning
  if clean_review_text('  <script>alert(1)</script>Nice   place  ') = 'alert(1)Nice place' then ok := ok + 1;
  else raise warning 'FAIL clean_review_text: %', clean_review_text('  <script>alert(1)</script>Nice   place  '); bad := bad + 1; end if;

  raise notice 'word filter + cleaning: % passed, % failed', ok, bad;
end $$;

-- Submission as the client
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Blocked word rejected, nothing saved
do $$ begin
  perform submit_visit_review(':DONE_APPT'::uuid, 5::smallint, 'gago', null, null, null, null);
  raise warning 'FAIL: inappropriate review accepted';
exception when others then
  if sqlerrm = 'REVIEW_INAPPROPRIATE' then raise notice 'PASS inappropriate'; else raise warning 'FAIL got %', sqlerrm; end if;
end $$;

-- 2. Valid submit (service + staff + branch)
select submit_visit_review(':DONE_APPT'::uuid, 4::smallint, 'Nice but a bit rushed', 5::smallint, 'Very gentle', 3::smallint, null);
select target_type, rating, status from reviews where appointment_id = ':DONE_APPT'::uuid order by target_type;

-- 3. Duplicate rejected
do $$ begin
  perform submit_visit_review(':DONE_APPT'::uuid, 5::smallint, null, null, null, null, null);
  raise warning 'FAIL: duplicate accepted';
exception when others then
  if sqlerrm = 'REVIEW_DUPLICATE' then raise notice 'PASS duplicate'; else raise warning 'FAIL got %', sqlerrm; end if;
end $$;

-- 4. Moderation forbidden for a customer
do $$ begin
  perform moderate_review((select id from reviews where appointment_id = ':DONE_APPT'::uuid limit 1), 'hide', null);
  raise warning 'FAIL: customer moderated';
exception when others then
  if sqlerrm = 'REVIEW_FORBIDDEN' then raise notice 'PASS forbidden'; else raise warning 'FAIL got %', sqlerrm; end if;
end $$;

reset role;

-- 5. Anonymous sees only visible rows
update reviews set status = 'hidden' where appointment_id = ':DONE_APPT'::uuid and target_type = 'staff';
set local role anon;
select 'anon sees hidden rows (must be 0):' as check, count(*) from reviews where status <> 'visible';
reset role;

rollback;
```

- [ ] **Step 3: Self-review the SQL**

Check against the spec §1–3 and against existing schema: `appointments.status` is an enum (compare via `::text`), `appointments.professional_id → staff_members`, `appointments.service_id → branch_services`, `public.current_user_role()` exists (003) and returns the `user_role` enum. Confirm every `security definer` function sets `search_path` and has explicit revoke/grant.

- [ ] **Step 4: Deferred manual verification (user)**

User applies `048_review_moderation.sql`, then runs `048_reviews_check.sql` with placeholders filled. Expected: `word filter + cleaning: 21 passed, 0 failed`, PASS lines for 1/3/4, three rows (branch/service/staff) for step 2, and `0` for step 5.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/048_review_moderation.sql supabase/tests/048_reviews_check.sql
git commit -m "feat: visit reviews schema, moderation functions, and word filter (048)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared review helpers + Reports fix

**Files:**
- Create: `src/lib/reviews.ts`, `src/lib/reviews.test.ts`
- Modify: `src/lib/supabase/queries/reports.ts` (`getReviewsSummary`), `src/components/admin/reports/ClientReviewsCard.tsx`

**Interfaces — Produces:**
- `type ReviewTarget = "service" | "staff" | "branch"`; `type ReviewStatus = "visible" | "hidden" | "removed"`
- `reviewErrorMessage(err: { message?: string } | null | undefined): string`
- `summarizeRatings(ratings: number[]): { average: number; count: number; breakdown: { stars: number; count: number }[] }`
- `ReviewsSummary` gains `byType: Record<ReviewTarget, { average: number; count: number }>`

- [ ] **Step 1: Failing tests `src/lib/reviews.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { reviewErrorMessage, summarizeRatings } from "./reviews";

describe("reviewErrorMessage", () => {
  it.each([
    ["REVIEW_INAPPROPRIATE", "Please keep your review respectful and appropriate."],
    ["REVIEW_DUPLICATE", "You've already reviewed this visit."],
    ["REVIEW_NOT_ALLOWED", "You can only review completed visits."],
    ["REVIEW_INVALID", "Please give a 1–5 star rating and keep comments under 1000 characters."],
    ["something else", "Couldn't submit your review. Please try again."],
  ])("%s", (code, message) => {
    expect(reviewErrorMessage({ message: code })).toBe(message);
  });

  it("handles a missing error", () => {
    expect(reviewErrorMessage(null)).toBe("Couldn't submit your review. Please try again.");
  });
});

describe("summarizeRatings", () => {
  it("averages to one decimal with a 5→1 breakdown", () => {
    expect(summarizeRatings([5, 4, 4, 1])).toEqual({
      average: 3.5,
      count: 4,
      breakdown: [
        { stars: 5, count: 1 },
        { stars: 4, count: 2 },
        { stars: 3, count: 0 },
        { stars: 2, count: 0 },
        { stars: 1, count: 1 },
      ],
    });
  });

  it("returns zeros for no ratings", () => {
    expect(summarizeRatings([]).average).toBe(0);
    expect(summarizeRatings([]).count).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure** — `npm test` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/reviews.ts`**

```ts
export type ReviewTarget = "service" | "staff" | "branch";
export type ReviewStatus = "visible" | "hidden" | "removed";

const MESSAGES: Record<string, string> = {
  REVIEW_INAPPROPRIATE: "Please keep your review respectful and appropriate.",
  REVIEW_DUPLICATE: "You've already reviewed this visit.",
  REVIEW_NOT_ALLOWED: "You can only review completed visits.",
  REVIEW_INVALID: "Please give a 1–5 star rating and keep comments under 1000 characters.",
};

/** Maps a Supabase RPC error (whose message is a REVIEW_* code) to client text. */
export function reviewErrorMessage(err: { message?: string } | null | undefined): string {
  const code = err?.message?.trim() ?? "";
  return MESSAGES[code] ?? "Couldn't submit your review. Please try again.";
}

export function summarizeRatings(ratings: number[]) {
  const counts = new Map<number, number>([5, 4, 3, 2, 1].map((s) => [s, 0]));
  let total = 0;
  for (const r of ratings) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
    total += r;
  }
  return {
    average: ratings.length ? Math.round((total / ratings.length) * 10) / 10 : 0,
    count: ratings.length,
    breakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.get(stars) ?? 0 })),
  };
}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS.

- [ ] **Step 5: Rewrite `getReviewsSummary` (reports.ts ~357-394)**

Replace the function body so it (a) filters `status = 'visible'`, (b) uses the qualified client embed, (c) reuses `summarizeRatings`, (d) adds `byType`:

```ts
export type ReviewsSummary = {
  average: number;
  count: number;
  breakdown: { stars: number; count: number }[];
  byType: Record<ReviewTarget, { average: number; count: number }>;
  recent: { clientName: string; rating: number; text: string | null; date: string }[];
};

export async function getReviewsSummary(supabase: SupabaseClient, branchId: string | null): Promise<ReviewsSummary> {
  let query = supabase
    .from("reviews")
    .select("rating, text, created_at, target_type, client:profiles!reviews_client_id_fkey(full_name)")
    .eq("status", "visible")
    .order("created_at", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) console.error("getReviewsSummary failed:", error);

  const rows =
    (data as unknown as {
      rating: number;
      text: string | null;
      created_at: string;
      target_type: ReviewTarget;
      client: { full_name: string } | { full_name: string }[] | null;
    }[]) ?? [];

  const overall = summarizeRatings(rows.map((r) => r.rating));
  const byType = Object.fromEntries(
    (["service", "staff", "branch"] as ReviewTarget[]).map((t) => {
      const s = summarizeRatings(rows.filter((r) => r.target_type === t).map((r) => r.rating));
      return [t, { average: s.average, count: s.count }];
    })
  ) as ReviewsSummary["byType"];

  return {
    ...overall,
    byType,
    recent: rows.slice(0, 5).map((r) => {
      const client = Array.isArray(r.client) ? r.client[0] : r.client;
      return {
        clientName: client?.full_name ?? "Anonymous",
        rating: r.rating,
        text: r.text,
        date: new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      };
    }),
  };
}
```

Add imports at the top of reports.ts: `import { summarizeRatings, type ReviewTarget } from "@/lib/reviews";`

- [ ] **Step 6: Update `ClientReviewsCard.tsx`**

Under the header row add a link and a per-type line. Replace line 7 (`<h2 …>Client Reviews</h2>`) with:

```tsx
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Client Reviews</h2>
        <Link href="/admin/reviews" className="text-sm font-medium text-coral-dark hover:underline">
          Manage reviews →
        </Link>
      </div>
      <p className="mt-1 text-xs text-ink/50">
        Service ★ {reviews.byType.service.average} ({reviews.byType.service.count}) · Staff ★ {reviews.byType.staff.average} (
        {reviews.byType.staff.count}) · Branch ★ {reviews.byType.branch.average} ({reviews.byType.branch.count})
      </p>
```

Add `import Link from "next/link";`.

- [ ] **Step 7: Grep for other ambiguous embeds**

Run: `grep -rn "from(\"reviews\")" src` and inspect each select. Any `profiles(` embed must be `profiles!reviews_client_id_fkey(`. (After Task 3 rewrites myGlow.ts, the only other reader is reports.ts.)

- [ ] **Step 8: Verify & commit**

Run: `npm test && npx tsc --noEmit -p .` — PASS.

```bash
git add src/lib/reviews.ts src/lib/reviews.test.ts src/lib/supabase/queries/reports.ts src/components/admin/reports/ClientReviewsCard.tsx
git commit -m "feat: shared review helpers; Reports counts visible reviews only" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client review flow (My Services + My Reviews)

**Files:**
- Modify: `src/lib/supabase/queries/myGlow.ts`, `src/components/my-glow/MyServicesList.tsx`, `src/components/my-glow/ReviewsPanel.tsx`, `src/app/my-glow/page.tsx`

**Interfaces:**
- Consumes: `reviewErrorMessage`, `ReviewTarget`, `ReviewStatus` (Task 2); RPC `submit_visit_review` (Task 1).
- Produces:
  - `type ReviewPart = { rating: number; text: string | null; status: ReviewStatus }`
  - `type VisitReview = Partial<Record<ReviewTarget, ReviewPart>>`
  - `getVisitReviews(supabase, clientId): Promise<Record<string, VisitReview>>`
  - `submitVisitReview(supabase, input: VisitReviewInput): Promise<{ error: string | null; duplicate: boolean }>` where `VisitReviewInput = { appointmentId: string; service: { rating: number; text: string }; staff: { rating: number; text: string } | null; branch: { rating: number; text: string } | null }`
  - `RecentAppointment` gains `branchName: string | null`
  - `MyReview = { id; rating; text; createdAt; targetType: ReviewTarget; targetName: string; status: ReviewStatus }`

- [ ] **Step 1: Update `myGlow.ts`**

1. In `RawAppointmentRow` add `branch?: Rel<{ name: string }>` (already present) and in `getRecentAppointments` change the select to include `branch:branches(name)` and map `branchName: one(row.branch)?.name ?? null`. Add `branchName: string | null;` to `RecentAppointment`.
2. Delete `ServiceReview`, `getServiceReviews`, `submitServiceReview`, `ReviewableProfessional`, `getReviewableProfessionals`, `submitReview`.
3. Replace `MyReview` and `getMyReviews`, and add the new helpers:

```ts
import type { ReviewStatus, ReviewTarget } from "@/lib/reviews";

export type ReviewPart = { rating: number; text: string | null; status: ReviewStatus };
export type VisitReview = Partial<Record<ReviewTarget, ReviewPart>>;

/** This client's reviews grouped by appointment — every status, so the
 * client can see "Hidden by the spa" on parts an admin hid. */
export async function getVisitReviews(
  supabase: SupabaseClient,
  clientId: string
): Promise<Record<string, VisitReview>> {
  const { data, error } = await supabase
    .from("reviews")
    .select("appointment_id, target_type, rating, text, status")
    .eq("client_id", clientId)
    .not("appointment_id", "is", null);
  if (error) {
    console.error("getVisitReviews failed:", error);
    return {};
  }
  const map: Record<string, VisitReview> = {};
  for (const row of (data ?? []) as {
    appointment_id: string;
    target_type: ReviewTarget;
    rating: number;
    text: string | null;
    status: ReviewStatus;
  }[]) {
    (map[row.appointment_id] ??= {})[row.target_type] = { rating: row.rating, text: row.text, status: row.status };
  }
  return map;
}

export type VisitReviewInput = {
  appointmentId: string;
  service: { rating: number; text: string };
  staff: { rating: number; text: string } | null;
  branch: { rating: number; text: string } | null;
};

export async function submitVisitReview(
  supabase: SupabaseClient,
  input: VisitReviewInput
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc("submit_visit_review", {
    p_appointment_id: input.appointmentId,
    p_service_rating: input.service.rating,
    p_service_text: input.service.text,
    p_staff_rating: input.staff?.rating ?? null,
    p_staff_text: input.staff?.text ?? null,
    p_branch_rating: input.branch?.rating ?? null,
    p_branch_text: input.branch?.text ?? null,
  });
  return { error: error ? { message: error.message } : null };
}

export type MyReview = {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  targetType: ReviewTarget;
  targetName: string;
  status: ReviewStatus;
};

export async function getMyReviews(supabase: SupabaseClient, clientId: string): Promise<MyReview[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, rating, text, created_at, target_type, status, staff:staff_members(full_name), branch:branches(name), service:branch_services(name), appointment:appointments(notes)"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) console.error("getMyReviews failed:", error);

  type Row = {
    id: string;
    rating: number;
    text: string | null;
    created_at: string;
    target_type: ReviewTarget;
    status: ReviewStatus;
    staff: Rel<{ full_name: string }>;
    branch: Rel<{ name: string }>;
    service: Rel<{ name: string }>;
    appointment: Rel<{ notes: string | null }>;
  };

  return ((data as unknown as Row[]) ?? []).map((row) => ({
    id: row.id,
    rating: row.rating,
    text: row.text,
    createdAt: row.created_at,
    targetType: row.target_type,
    status: row.status,
    targetName:
      row.target_type === "staff"
        ? one(row.staff)?.full_name ?? "Your therapist"
        : row.target_type === "branch"
          ? one(row.branch)?.name ?? "Blush Spa"
          : one(row.service)?.name ?? one(row.appointment)?.notes ?? "Service",
  }));
}
```

- [ ] **Step 2: Replace `MyServicesList.tsx` review parts**

Keep the file's status helpers and `Stars`. Replace `ReviewForm` and the review rendering; change props from `initialReviews: Record<string, ServiceReview>` to `initialReviews: Record<string, VisitReview>`; drop `clientId` use for submission (the RPC uses `auth.uid()`) but keep the prop for the Realtime filter.

```tsx
import { useEffect, useState } from "react";
import {
  getVisitReviews,
  submitVisitReview,
  type RecentAppointment,
  type ReviewPart,
  type VisitReview,
} from "@/lib/supabase/queries/myGlow";
import { reviewErrorMessage } from "@/lib/reviews";

function PartInput({
  label,
  rating,
  text,
  onRating,
  onText,
}: {
  label: string;
  rating: number;
  text: string;
  onRating: (n: number) => void;
  onText: (t: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-ink/70">{label}</p>
      <Stars value={rating} onChange={onRating} />
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Tell us more (optional)"
        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-coral"
      />
    </div>
  );
}

function VisitReviewForm({
  appointment,
  onDone,
  onDuplicate,
  onCancel,
}: {
  appointment: RecentAppointment;
  onDone: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
}) {
  const [service, setService] = useState({ rating: 0, text: "" });
  const [staff, setStaff] = useState({ rating: 0, text: "" });
  const [branch, setBranch] = useState({ rating: 0, text: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (service.rating === 0) {
      setError("Tap a star to rate the service.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: rpcError } = await submitVisitReview(createClient(), {
      appointmentId: appointment.id,
      service,
      staff: appointment.professionalName && staff.rating > 0 ? staff : null,
      branch: branch.rating > 0 ? branch : null,
    });
    setSaving(false);
    if (rpcError) {
      setError(reviewErrorMessage(rpcError));
      if (rpcError.message === "REVIEW_DUPLICATE") onDuplicate();
      return;
    }
    onDone();
  }

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-ink/10 bg-blush/30 p-3">
      <PartInput
        label={`Service — ${appointment.serviceName ?? "your service"}`}
        rating={service.rating}
        text={service.text}
        onRating={(rating) => setService((s) => ({ ...s, rating }))}
        onText={(text) => setService((s) => ({ ...s, text }))}
      />
      {appointment.professionalName && (
        <PartInput
          label={`Your therapist — ${appointment.professionalName}`}
          rating={staff.rating}
          text={staff.text}
          onRating={(rating) => setStaff((s) => ({ ...s, rating }))}
          onText={(text) => setStaff((s) => ({ ...s, text }))}
        />
      )}
      <PartInput
        label={`Branch — ${appointment.branchName ?? "Blush Spa"} (optional)`}
        rating={branch.rating}
        text={branch.text}
        onRating={(rating) => setBranch((s) => ({ ...s, rating }))}
        onText={(text) => setBranch((s) => ({ ...s, text }))}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-full border border-ink/15 bg-white py-1.5 text-xs text-ink/60 hover:border-ink/30"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="flex-1 rounded-full bg-coral py-1.5 text-xs font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
        >
          {saving ? "Submitting..." : "Submit Review"}
        </button>
      </div>
    </div>
  );
}

function ReviewPartView({ label, part }: { label: string; part: ReviewPart | undefined }) {
  if (!part) return null;
  return (
    <div className="mt-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">{label}</p>
      {part.status === "visible" ? (
        <>
          <Stars value={part.rating} size="h-3.5 w-3.5" />
          {part.text && <p className="mt-0.5 text-xs italic text-ink/50">&ldquo;{part.text}&rdquo;</p>}
        </>
      ) : (
        <p className="text-xs text-ink/40">Hidden by the spa</p>
      )}
    </div>
  );
}
```

In `MyServicesList`:

```tsx
export default function MyServicesList({
  appointments,
  clientId,
  initialReviews,
}: {
  appointments: RecentAppointment[];
  clientId: string;
  initialReviews: Record<string, VisitReview>;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function refresh() {
    setReviews(await getVisitReviews(createClient(), clientId));
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`my-reviews-${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reviews", filter: `client_id=eq.${clientId}` },
        () => {
          getVisitReviews(supabase, clientId).then(setReviews);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);
```

Per appointment, replace the three review blocks with:

```tsx
              {completed && review && (
                <div className="mt-1.5 pl-[60px]">
                  <ReviewPartView label="Service" part={review.service} />
                  <ReviewPartView label="Therapist" part={review.staff} />
                  <ReviewPartView label="Branch" part={review.branch} />
                </div>
              )}

              {completed && !review && reviewingId !== a.id && (
                <div className="mt-1.5 pl-[60px]">
                  <button
                    onClick={() => setReviewingId(a.id)}
                    className="flex items-center gap-1 text-xs font-semibold text-coral-dark hover:underline"
                  >
                    <Star className="h-3.5 w-3.5" /> Rate your visit
                  </button>
                </div>
              )}

              {completed && !review && reviewingId === a.id && (
                <VisitReviewForm
                  appointment={a}
                  onCancel={() => setReviewingId(null)}
                  onDuplicate={() => {
                    setReviewingId(null);
                    refresh();
                  }}
                  onDone={() => {
                    setReviewingId(null);
                    refresh();
                  }}
                />
              )}
```

(`const review = reviews[a.id];` stays; `review` is now a `VisitReview`, truthy when any part exists.)

- [ ] **Step 3: Simplify `ReviewsPanel.tsx`**

Replace the whole file:

```tsx
import { Star } from "lucide-react";
import type { MyReview } from "@/lib/supabase/queries/myGlow";

const TYPE_LABEL = { service: "Service", staff: "Therapist", branch: "Branch" } as const;

export default function ReviewsPanel({ myReviews }: { myReviews: MyReview[] }) {
  return (
    <div id="reviews" className="rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="text-lg font-semibold text-ink">My Reviews</h3>
      <p className="mt-1 text-sm text-ink/50">
        Rate your completed visits in <a href="#services" className="font-medium text-coral-dark hover:underline">My Services</a>.
      </p>

      <div className="mt-4 space-y-3">
        {myReviews.length === 0 && <p className="py-6 text-center text-sm text-ink/40">No reviews yet.</p>}
        {myReviews.map((r) => (
          <div key={r.id} className="rounded-2xl border border-ink/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                <span className="mr-1.5 rounded-full bg-blush px-2 py-0.5 text-[11px] font-semibold text-coral-dark">
                  {TYPE_LABEL[r.targetType]}
                </span>
                {r.targetName}
              </p>
              <div className="flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`h-4 w-4 ${n <= r.rating ? "fill-gold text-gold" : "text-ink/20"}`} />
                ))}
              </div>
            </div>
            {r.status === "visible" ? (
              r.text && <p className="mt-1 text-sm text-ink/60">{r.text}</p>
            ) : (
              <p className="mt-1 text-xs text-ink/40">Hidden by the spa</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update `src/app/my-glow/page.tsx`**

- Imports: drop `getReviewableProfessionals`, `getServiceReviews`; add `getVisitReviews`.
- In the `Promise.all`, replace `getReviewableProfessionals(...)` with nothing and `getServiceReviews(...)` with `getVisitReviews(supabase, auth.user.id)`; keep `getVisitedBranches` (used for recommendations) and `getMyReviews`.
- `<ReviewsPanel myReviews={myReviews} />` (remove `clientId`, `reviewable`, `visitedBranches` props).
- `<MyServicesList appointments={recent} clientId={auth.user.id} initialReviews={visitReviews} />`.

- [ ] **Step 5: Verify**

Run: `npm test && npx tsc --noEmit -p . && npx eslint src/components/my-glow src/lib/supabase/queries/myGlow.ts src/app/my-glow` — no errors in these files.
Run: `grep -rn "getServiceReviews\|submitServiceReview\|getReviewableProfessionals\|submitReview\b" src` → no results.
Deferred manual (needs 048 applied): rate a completed visit; try a blocked word; double-submit; admin hides a part → client shows "Hidden by the spa" live.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/queries/myGlow.ts src/components/my-glow/MyServicesList.tsx src/components/my-glow/ReviewsPanel.tsx src/app/my-glow/page.tsx
git commit -m "feat: rate-your-visit form with service, therapist and branch reviews" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Public team section and staff profile page

**Files:**
- Create: `src/lib/supabase/queries/staffProfiles.ts`, `src/app/team/[id]/page.tsx`
- Modify: `src/components/home/Team.tsx`

**Interfaces — Produces:**
- `type PublicStaff = { id: string; fullName: string; department: string; branchName: string | null; avatarUrl: string | null; average: number; count: number }`
- `getPublicStaffList(supabase): Promise<PublicStaff[]>`
- `getPublicStaffProfile(supabase, id): Promise<{ staff: PublicStaff; summary: ReturnType<typeof summarizeRatings>; reviews: { id: string; rating: number; text: string | null; createdAt: string; reviewer: string }[] } | null>`

- [ ] **Step 1: `src/lib/supabase/queries/staffProfiles.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeRatings } from "@/lib/reviews";

export type PublicStaff = {
  id: string;
  fullName: string;
  department: string;
  branchName: string | null;
  avatarUrl: string | null;
  average: number;
  count: number;
};

type ProfileRow = {
  id: string;
  full_name: string;
  department: string;
  branch_name: string | null;
  avatar_url: string | null;
};

function toStaff(row: ProfileRow, ratings: number[]): PublicStaff {
  const s = summarizeRatings(ratings);
  return {
    id: row.id,
    fullName: row.full_name,
    department: row.department,
    branchName: row.branch_name,
    avatarUrl: row.avatar_url,
    average: s.average,
    count: s.count,
  };
}

export async function getPublicStaffList(supabase: SupabaseClient): Promise<PublicStaff[]> {
  const [{ data: staff, error }, { data: reviews }] = await Promise.all([
    supabase.from("public_staff_profiles").select("id, full_name, department, branch_name, avatar_url").order("full_name"),
    supabase.from("public_staff_reviews").select("staff_id, rating"),
  ]);
  if (error) console.error("getPublicStaffList failed:", error);

  const ratingsByStaff = new Map<string, number[]>();
  for (const r of (reviews ?? []) as { staff_id: string; rating: number }[]) {
    const list = ratingsByStaff.get(r.staff_id) ?? [];
    list.push(r.rating);
    ratingsByStaff.set(r.staff_id, list);
  }
  return ((staff ?? []) as ProfileRow[]).map((row) => toStaff(row, ratingsByStaff.get(row.id) ?? []));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPublicStaffProfile(supabase: SupabaseClient, id: string) {
  if (!UUID_RE.test(id)) return null;
  const [{ data: row }, { data: reviews, error }] = await Promise.all([
    supabase.from("public_staff_profiles").select("id, full_name, department, branch_name, avatar_url").eq("id", id).maybeSingle(),
    supabase
      .from("public_staff_reviews")
      .select("id, rating, text, created_at, reviewer")
      .eq("staff_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (error) console.error("getPublicStaffProfile reviews failed:", error);
  if (!row) return null;

  const list = (reviews ?? []) as { id: string; rating: number; text: string | null; created_at: string; reviewer: string }[];
  return {
    staff: toStaff(row as ProfileRow, list.map((r) => r.rating)),
    summary: summarizeRatings(list.map((r) => r.rating)),
    reviews: list.map((r) => ({ id: r.id, rating: r.rating, text: r.text, createdAt: r.created_at, reviewer: r.reviewer })),
  };
}
```

- [ ] **Step 2: Replace `Team.tsx`**

```tsx
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPublicStaffList } from "@/lib/supabase/queries/staffProfiles";

export default async function Team() {
  const supabase = await createClient();
  const staff = await getPublicStaffList(supabase);

  return (
    <section id="team" className="mx-auto max-w-7xl px-6 py-20">
      <h2 className="mb-10 text-3xl font-semibold text-ink">
        Meet the <span className="text-coral">Team</span>
      </h2>

      {staff.length === 0 ? (
        <p className="text-sm text-ink/50">Our team will be introduced here soon.</p>
      ) : (
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {staff.map((m) => (
            <Link key={m.id} href={`/team/${m.id}`} className="group flex flex-col items-center gap-2 text-center">
              <span className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-blush text-2xl font-bold text-coral-dark">
                {m.avatarUrl ? (
                  <Image src={m.avatarUrl} alt={m.fullName} fill sizes="80px" className="object-cover" />
                ) : (
                  m.fullName.charAt(0).toUpperCase()
                )}
              </span>
              <span className="font-medium text-ink group-hover:text-coral-dark">{m.fullName}</span>
              <span className="text-sm text-ink/50">
                {m.department}
                {m.branchName && <> · {m.branchName}</>}
              </span>
              <span className="flex items-center gap-1 text-xs text-ink/60">
                {m.count > 0 ? (
                  <>
                    <Star className="h-3.5 w-3.5 fill-gold text-gold" /> {m.average} · {m.count} review{m.count === 1 ? "" : "s"}
                  </>
                ) : (
                  "No reviews yet"
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
```

In `src/app/page.tsx` add `export const dynamic = "force-dynamic";` so ratings are fresh.

- [ ] **Step 3: `src/app/team/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import { getPublicStaffProfile } from "@/lib/supabase/queries/staffProfiles";

export const dynamic = "force-dynamic";

function StarRow({ value, size = "h-4 w-4" }: { value: number; size?: string }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= Math.round(value) ? "fill-gold text-gold" : "text-ink/15"}`} />
      ))}
    </span>
  );
}

export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const profile = await getPublicStaffProfile(supabase, id);
  if (!profile) notFound();
  const { staff, summary, reviews } = profile;

  return (
    <>
      <Header />
      <main className="flex-1 bg-blush/30 px-6 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link href="/#team" className="text-sm font-medium text-coral-dark hover:underline">
            &larr; Back to the team
          </Link>

          <div className="flex flex-col items-center gap-3 rounded-3xl bg-white p-8 text-center shadow-sm sm:flex-row sm:text-left">
            <span className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-3xl font-bold text-coral-dark">
              {staff.avatarUrl ? (
                <Image src={staff.avatarUrl} alt={staff.fullName} fill sizes="96px" className="object-cover" />
              ) : (
                staff.fullName.charAt(0).toUpperCase()
              )}
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-ink">{staff.fullName}</h1>
              <p className="text-sm text-ink/60">
                {staff.department}
                {staff.branchName && <> · {staff.branchName}</>}
              </p>
              <div className="mt-2 flex items-center justify-center gap-2 sm:justify-start">
                <StarRow value={summary.average} />
                <span className="text-sm text-ink/60">
                  {summary.count > 0 ? `${summary.average} · ${summary.count} review${summary.count === 1 ? "" : "s"}` : "No reviews yet"}
                </span>
              </div>
            </div>
          </div>

          {summary.count > 0 && (
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="font-semibold text-ink">Rating breakdown</h2>
              <div className="mt-3 space-y-1">
                {summary.breakdown.map((b) => (
                  <div key={b.stars} className="flex items-center gap-2 text-xs">
                    <span className="w-8 text-ink/50">{b.stars}★</span>
                    <div className="h-1.5 flex-1 rounded-full bg-ink/5">
                      <div className="h-1.5 rounded-full bg-gold" style={{ width: `${(b.count / summary.count) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right text-ink/40">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <h2 className="font-semibold text-ink">Client reviews</h2>
            {reviews.length === 0 ? (
              <p className="mt-3 text-sm text-ink/50">No reviews yet.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="border-b border-ink/5 pb-4 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{r.reviewer}</span>
                      <StarRow value={r.rating} size="h-3.5 w-3.5" />
                    </div>
                    {r.text && <p className="mt-1 text-sm text-ink/70">{r.text}</p>}
                    <p className="mt-1 text-xs text-ink/40">
                      {new Date(r.createdAt).toLocaleDateString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 4: Verify & commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/home/Team.tsx "src/app/team" src/lib/supabase/queries/staffProfiles.ts src/app/page.tsx`.
Deferred manual (needs 048): home Teams shows real staff; `/team/<id>` shows only visible reviews; bad id → 404.

```bash
git add src/lib/supabase/queries/staffProfiles.ts src/components/home/Team.tsx "src/app/team/[id]/page.tsx" src/app/page.tsx
git commit -m "feat: public team section and staff profile pages with ratings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Staff panel ratings (Admin + Front Desk)

**Files:**
- Create: `src/components/staff/StaffRatingBlock.tsx`
- Modify: `src/components/admin/users/StaffMembersPanel.tsx`, `src/components/frontdesk/staff/StaffDetailPanel.tsx`

Deviation from spec (deliberate): the Admin staff panel is a table without a detail view, so it gets a **Rating column** linking to `/admin/reviews?staff=<id>`; the Front Desk detail panel gets the full block.

- [ ] **Step 1: `src/components/staff/StaffRatingBlock.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { summarizeRatings, type ReviewStatus } from "@/lib/reviews";

type Row = { id: string; rating: number; text: string | null; status: ReviewStatus; created_at: string };

export default function StaffRatingBlock({ staffId, showManageLink }: { staffId: string; showManageLink: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .from("reviews")
      .select("id, rating, text, status, created_at")
      .eq("target_type", "staff")
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("StaffRatingBlock load failed:", error);
        if (!cancelled) setRows((data as Row[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  if (rows === null) return <div className="rounded-2xl bg-white p-5 text-sm text-ink/40 shadow-sm">Loading rating…</div>;

  const visible = summarizeRatings(rows.filter((r) => r.status === "visible").map((r) => r.rating));

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Rating</h3>
        {showManageLink && (
          <Link href={`/admin/reviews?staff=${staffId}`} className="text-xs font-medium text-coral-dark hover:underline">
            View all reviews →
          </Link>
        )}
      </div>
      <p className="mt-2 flex items-center gap-1 text-sm text-ink">
        <Star className="h-4 w-4 fill-gold text-gold" />
        {visible.count > 0 ? `${visible.average} · ${visible.count} review${visible.count === 1 ? "" : "s"}` : "No reviews yet"}
      </p>
      <ul className="mt-3 space-y-2">
        {rows.slice(0, 5).map((r) => (
          <li key={r.id} className="rounded-xl border border-ink/10 p-2 text-xs">
            <div className="flex items-center justify-between">
              <span>{"★".repeat(r.rating)}</span>
              {r.status !== "visible" && (
                <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-ink/50">{r.status}</span>
              )}
            </div>
            {r.text && <p className="mt-1 text-ink/60">{r.text}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Front Desk — `StaffDetailPanel.tsx`**

Add `import StaffRatingBlock from "@/components/staff/StaffRatingBlock";` and, immediately before the `Status Legend` block (`<div className="rounded-2xl bg-white p-5 shadow-sm">` containing `Status Legend`), insert:

```tsx
      {selectedStaffId && <StaffRatingBlock staffId={selectedStaffId} showManageLink={false} />}
```

- [ ] **Step 3: Admin — `StaffMembersPanel.tsx`**

1. Add state + load of visible staff ratings next to `load()`:

```ts
  const [ratings, setRatings] = useState<Record<string, { average: number; count: number }>>({});

  async function loadRatings() {
    const { data, error } = await supabase
      .from("reviews")
      .select("staff_id, rating")
      .eq("target_type", "staff")
      .eq("status", "visible")
      .not("staff_id", "is", null);
    if (error) console.error("loadRatings failed:", error);
    const byStaff: Record<string, number[]> = {};
    for (const r of (data ?? []) as { staff_id: string; rating: number }[]) (byStaff[r.staff_id] ??= []).push(r.rating);
    setRatings(
      Object.fromEntries(Object.entries(byStaff).map(([id, list]) => [id, (({ average, count }) => ({ average, count }))(summarizeRatings(list))]))
    );
  }
```

Call `loadRatings()` wherever `load()` is first called (the initial `useEffect`). Import `summarizeRatings` from `@/lib/reviews` and `Link` from `next/link`.

2. Add a header cell after "Phone": `<th className="px-4 py-3 text-left">Rating</th>` and a body cell after the phone cell:

```tsx
                  <td className="px-4 py-4 text-ink/60">
                    {ratings[m.id] ? (
                      <Link href={`/admin/reviews?staff=${m.id}`} className="hover:text-coral-dark hover:underline">
                        ★ {ratings[m.id].average} · {ratings[m.id].count}
                      </Link>
                    ) : (
                      <span className="text-ink/30">—</span>
                    )}
                  </td>
```

- [ ] **Step 4: Verify & commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/staff src/components/admin/users/StaffMembersPanel.tsx src/components/frontdesk/staff/StaffDetailPanel.tsx` (no new errors).

```bash
git add src/components/staff/StaffRatingBlock.tsx src/components/admin/users/StaffMembersPanel.tsx src/components/frontdesk/staff/StaffDetailPanel.tsx
git commit -m "feat: staff ratings in Admin and Front Desk staff panels" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Admin Reviews page

**Files:**
- Create: `src/lib/supabase/queries/adminReviews.ts`, `src/app/admin/reviews/page.tsx`, `src/components/admin/reviews/ReviewsManager.tsx`, `src/components/admin/reviews/ReviewDetailPanel.tsx`, `src/components/admin/dashboard/NewReviewsCard.tsx`
- Modify: `src/components/admin/AdminSidebar.tsx`, `src/app/admin/page.tsx`

**Interfaces — Produces:**
- `type ReviewFilters = { type?: ReviewTarget; staff?: string; branch?: string; service?: string; rating?: number; from?: string; to?: string; status?: ReviewStatus | "new"; q?: string; page?: number }`
- `parseReviewFilters(sp: Record<string, string | string[] | undefined>): ReviewFilters`
- `type AdminReviewRow = { id; targetType; rating; text; status; createdAt; isNew: boolean; clientName; targetName; appointmentId: string | null }`
- `listAdminReviews(supabase, f): Promise<{ rows: AdminReviewRow[]; total: number }>`
- `getAdminReviewStats(supabase): Promise<{ byType: Record<ReviewTarget, { average: number; count: number }>; newCount: number; hiddenCount: number; removedCount: number }>`
- `getReviewFilterOptions(supabase): Promise<{ staff: {id;name}[]; branches: {id;name}[]; services: {id;name}[] }>`
- `getAdminReviewDetail(supabase, id)`
- `moderateReview(supabase, id, action, reason): Promise<string | null>` (error text or null)
- `markReviewsSeen(supabase, ids): Promise<void>`
- `PAGE_SIZE = 25`

- [ ] **Step 1: `src/lib/supabase/queries/adminReviews.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeRatings, type ReviewStatus, type ReviewTarget } from "@/lib/reviews";

export const PAGE_SIZE = 25;

export type ReviewFilters = {
  type?: ReviewTarget;
  staff?: string;
  branch?: string;
  service?: string;
  rating?: number;
  from?: string;
  to?: string;
  status?: ReviewStatus | "new";
  q?: string;
  page?: number;
};

const TYPES = new Set(["service", "staff", "branch"]);
const STATUSES = new Set(["visible", "hidden", "removed", "new"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseReviewFilters(sp: Record<string, string | string[] | undefined>): ReviewFilters {
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const rating = Number(get("rating"));
  const page = Number(get("page"));
  return {
    type: TYPES.has(get("type") ?? "") ? (get("type") as ReviewTarget) : undefined,
    staff: UUID_RE.test(get("staff") ?? "") ? get("staff") : undefined,
    branch: UUID_RE.test(get("branch") ?? "") ? get("branch") : undefined,
    service: UUID_RE.test(get("service") ?? "") ? get("service") : undefined,
    rating: rating >= 1 && rating <= 5 ? rating : undefined,
    from: DATE_RE.test(get("from") ?? "") ? get("from") : undefined,
    to: DATE_RE.test(get("to") ?? "") ? get("to") : undefined,
    status: STATUSES.has(get("status") ?? "") ? (get("status") as ReviewFilters["status"]) : undefined,
    q: get("q")?.trim().slice(0, 100) || undefined,
    page: page >= 1 ? Math.floor(page) : 1,
  };
}

export type AdminReviewRow = {
  id: string;
  targetType: ReviewTarget;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  createdAt: string;
  isNew: boolean;
  clientName: string;
  targetName: string;
  appointmentId: string | null;
};

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (!v ? null : Array.isArray(v) ? (v[0] ?? null) : v);

const LIST_SELECT =
  "id, target_type, rating, text, status, created_at, admin_seen_at, appointment_id, client:profiles!reviews_client_id_fkey(full_name), staff:staff_members(full_name), branch:branches(name), service:branch_services(name)";

type RawRow = {
  id: string;
  target_type: ReviewTarget;
  rating: number;
  text: string | null;
  status: ReviewStatus;
  created_at: string;
  admin_seen_at: string | null;
  appointment_id: string | null;
  client: Rel<{ full_name: string | null }>;
  staff: Rel<{ full_name: string }>;
  branch: Rel<{ name: string }>;
  service: Rel<{ name: string }>;
};

function toRow(r: RawRow): AdminReviewRow {
  return {
    id: r.id,
    targetType: r.target_type,
    rating: r.rating,
    text: r.text,
    status: r.status,
    createdAt: r.created_at,
    isNew: r.admin_seen_at === null,
    clientName: one(r.client)?.full_name ?? "Client",
    targetName:
      r.target_type === "staff"
        ? one(r.staff)?.full_name ?? "Former staff"
        : r.target_type === "branch"
          ? one(r.branch)?.name ?? "Branch"
          : one(r.service)?.name ?? "Service",
    appointmentId: r.appointment_id,
  };
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listAdminReviews(supabase: SupabaseClient, f: ReviewFilters) {
  let q = supabase.from("reviews").select(LIST_SELECT, { count: "exact" }).order("created_at", { ascending: false });
  if (f.type) q = q.eq("target_type", f.type);
  if (f.staff) q = q.eq("staff_id", f.staff);
  if (f.branch) q = q.eq("branch_id", f.branch);
  if (f.service) q = q.eq("service_id", f.service);
  if (f.rating) q = q.eq("rating", f.rating);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+08:00`);
  if (f.to) q = q.lte("created_at", `${f.to}T23:59:59.999+08:00`);
  if (f.status === "new") q = q.is("admin_seen_at", null);
  else if (f.status) q = q.eq("status", f.status);
  if (f.q) q = q.ilike("text", `%${escapeLike(f.q)}%`);
  const page = f.page ?? 1;
  q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await q;
  if (error) console.error("listAdminReviews failed:", error);
  return { rows: ((data as unknown as RawRow[]) ?? []).map(toRow), total: count ?? 0 };
}

export async function getAdminReviewStats(supabase: SupabaseClient) {
  const [visible, fresh, hidden, removed] = await Promise.all([
    supabase.from("reviews").select("target_type, rating").eq("status", "visible"),
    supabase.from("reviews").select("id", { count: "exact", head: true }).is("admin_seen_at", null),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "hidden"),
    supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "removed"),
  ]);
  const rows = (visible.data ?? []) as { target_type: ReviewTarget; rating: number }[];
  const byType = Object.fromEntries(
    (["service", "staff", "branch"] as ReviewTarget[]).map((t) => {
      const s = summarizeRatings(rows.filter((r) => r.target_type === t).map((r) => r.rating));
      return [t, { average: s.average, count: s.count }];
    })
  ) as Record<ReviewTarget, { average: number; count: number }>;
  return { byType, newCount: fresh.count ?? 0, hiddenCount: hidden.count ?? 0, removedCount: removed.count ?? 0 };
}

export async function getReviewFilterOptions(supabase: SupabaseClient) {
  const [staff, branches, services] = await Promise.all([
    supabase.from("staff_members").select("id, full_name").order("full_name"),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("branch_services").select("id, name").order("name"),
  ]);
  const uniqByName = (list: { id: string; name: string }[]) => {
    const seen = new Set<string>();
    return list.filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true)));
  };
  return {
    staff: ((staff.data ?? []) as { id: string; full_name: string }[]).map((s) => ({ id: s.id, name: s.full_name })),
    branches: (branches.data ?? []) as { id: string; name: string }[],
    services: uniqByName((services.data ?? []) as { id: string; name: string }[]),
  };
}

export type AdminReviewDetail = {
  review: AdminReviewRow;
  appointment: {
    id: string;
    bookingCode: string | null;
    scheduledDate: string;
    startTime: string;
    serviceName: string | null;
    therapistName: string | null;
    branchName: string | null;
  } | null;
  siblings: AdminReviewRow[];
  history: { id: string; action: string; fromStatus: string; toStatus: string; reason: string | null; createdAt: string; actorName: string }[];
};

export async function getAdminReviewDetail(supabase: SupabaseClient, id: string): Promise<AdminReviewDetail | null> {
  const { data } = await supabase.from("reviews").select(LIST_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const review = toRow(data as unknown as RawRow);

  const [appt, siblings, history] = await Promise.all([
    review.appointmentId
      ? supabase
          .from("appointments")
          .select("id, booking_code, scheduled_date, start_time, notes, service:branch_services(name), professional:staff_members(full_name), branch:branches(name)")
          .eq("id", review.appointmentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    review.appointmentId
      ? supabase.from("reviews").select(LIST_SELECT).eq("appointment_id", review.appointmentId).neq("id", id)
      : Promise.resolve({ data: [] }),
    supabase
      .from("review_moderation_log")
      .select("id, action, from_status, to_status, reason, created_at, actor:profiles(full_name)")
      .eq("review_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const a = appt.data as unknown as {
    id: string;
    booking_code: string | null;
    scheduled_date: string;
    start_time: string;
    notes: string | null;
    service: Rel<{ name: string }>;
    professional: Rel<{ full_name: string }>;
    branch: Rel<{ name: string }>;
  } | null;

  return {
    review,
    appointment: a
      ? {
          id: a.id,
          bookingCode: a.booking_code,
          scheduledDate: a.scheduled_date,
          startTime: a.start_time,
          serviceName: one(a.service)?.name ?? a.notes,
          therapistName: one(a.professional)?.full_name ?? null,
          branchName: one(a.branch)?.name ?? null,
        }
      : null,
    siblings: ((siblings.data as unknown as RawRow[]) ?? []).map(toRow),
    history: (
      (history.data as unknown as {
        id: string;
        action: string;
        from_status: string;
        to_status: string;
        reason: string | null;
        created_at: string;
        actor: Rel<{ full_name: string | null }>;
      }[]) ?? []
    ).map((h) => ({
      id: h.id,
      action: h.action,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      reason: h.reason,
      createdAt: h.created_at,
      actorName: one(h.actor)?.full_name ?? "Admin",
    })),
  };
}

export async function moderateReview(
  supabase: SupabaseClient,
  id: string,
  action: "hide" | "show" | "remove" | "restore",
  reason: string
): Promise<string | null> {
  const { error } = await supabase.rpc("moderate_review", { p_review_id: id, p_action: action, p_reason: reason });
  if (!error) return null;
  if (error.message === "REVIEW_BAD_TRANSITION") return "That review changed in the meantime — refresh and try again.";
  if (error.message === "REVIEW_FORBIDDEN") return "Only admins can moderate reviews.";
  return "Couldn't update the review. Please try again.";
}

export async function markReviewsSeen(supabase: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.rpc("mark_reviews_seen", { p_ids: ids });
  if (error) console.error("markReviewsSeen failed:", error);
}
```

- [ ] **Step 2: `src/app/admin/reviews/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getAdminReviewStats,
  getReviewFilterOptions,
  listAdminReviews,
  parseReviewFilters,
} from "@/lib/supabase/queries/adminReviews";
import ReviewsManager from "@/components/admin/reviews/ReviewsManager";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || profile.role !== "admin") redirect("/admin");

  const filters = parseReviewFilters(await searchParams);
  const [list, stats, options] = await Promise.all([
    listAdminReviews(supabase, filters),
    getAdminReviewStats(supabase),
    getReviewFilterOptions(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Reviews</h1>
        <p className="text-sm text-ink/50">Service, staff and branch reviews from completed visits.</p>
      </div>
      <ReviewsManager initialFilters={filters} initialList={list} initialStats={stats} options={options} />
    </div>
  );
}
```

- [ ] **Step 3: `src/components/admin/reviews/ReviewsManager.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  PAGE_SIZE,
  getAdminReviewStats,
  listAdminReviews,
  type AdminReviewRow,
  type ReviewFilters,
} from "@/lib/supabase/queries/adminReviews";
import ReviewDetailPanel from "./ReviewDetailPanel";

type Stats = Awaited<ReturnType<typeof getAdminReviewStats>>;
type Options = { staff: { id: string; name: string }[]; branches: { id: string; name: string }[]; services: { id: string; name: string }[] };

const TYPE_LABEL = { service: "Service", staff: "Staff", branch: "Branch" } as const;
const STATUS_STYLE = {
  visible: "bg-green-100 text-green-700",
  hidden: "bg-amber-100 text-amber-700",
  removed: "bg-red-100 text-red-600",
} as const;

function toQuery(f: ReviewFilters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default function ReviewsManager({
  initialFilters,
  initialList,
  initialStats,
  options,
}: {
  initialFilters: ReviewFilters;
  initialList: { rows: AdminReviewRow[]; total: number };
  initialStats: Stats;
  options: Options;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const [list, setList] = useState(initialList);
  const [stats, setStats] = useState(initialStats);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState(initialFilters.q ?? "");

  const reload = useCallback(async (f: ReviewFilters) => {
    const supabase = createClient();
    const [l, s] = await Promise.all([listAdminReviews(supabase, f), getAdminReviewStats(supabase)]);
    setList(l);
    setStats(s);
  }, []);

  function apply(next: ReviewFilters) {
    const f = { ...next, page: next.page ?? 1 };
    setFilters(f);
    router.replace(`${pathname}${toQuery(f)}`, { scroll: false });
    reload(f);
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-reviews")
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews" }, () => reload(filters))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [filters, reload]);

  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const select = "rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {(["service", "staff", "branch"] as const).map((t) => (
          <div key={t} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-ink/40">{TYPE_LABEL[t]}</p>
            <p className="mt-1 flex items-center gap-1 text-xl font-semibold text-ink">
              <Star className="h-4 w-4 fill-gold text-gold" /> {stats.byType[t].average}
            </p>
            <p className="text-xs text-ink/40">{stats.byType[t].count} visible</p>
          </div>
        ))}
        <button onClick={() => apply({ ...filters, status: "new" })} className="rounded-2xl bg-white p-4 text-left shadow-sm">
          <p className="text-xs font-semibold uppercase text-ink/40">New</p>
          <p className="mt-1 text-xl font-semibold text-coral-dark">{stats.newCount}</p>
        </button>
        <button onClick={() => apply({ ...filters, status: "hidden" })} className="rounded-2xl bg-white p-4 text-left shadow-sm">
          <p className="text-xs font-semibold uppercase text-ink/40">Hidden</p>
          <p className="mt-1 text-xl font-semibold text-ink">{stats.hiddenCount}</p>
        </button>
        <button onClick={() => apply({ ...filters, status: "removed" })} className="rounded-2xl bg-white p-4 text-left shadow-sm">
          <p className="text-xs font-semibold uppercase text-ink/40">Removed</p>
          <p className="mt-1 text-xl font-semibold text-ink">{stats.removedCount}</p>
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex gap-4 border-b border-ink/10 text-sm font-medium">
          {([undefined, "service", "staff", "branch"] as const).map((t) => (
            <button
              key={t ?? "all"}
              onClick={() => apply({ ...filters, type: t })}
              className={`pb-2 ${filters.type === t ? "border-b-2 border-coral text-coral-dark" : "text-ink/50"}`}
            >
              {t ? TYPE_LABEL[t] : "All"}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <select className={select} value={filters.service ?? ""} onChange={(e) => apply({ ...filters, service: e.target.value || undefined })}>
            <option value="">All services</option>
            {options.services.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select className={select} value={filters.staff ?? ""} onChange={(e) => apply({ ...filters, staff: e.target.value || undefined })}>
            <option value="">All staff</option>
            {options.staff.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select className={select} value={filters.branch ?? ""} onChange={(e) => apply({ ...filters, branch: e.target.value || undefined })}>
            <option value="">All branches</option>
            {options.branches.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select className={select} value={filters.rating ?? ""} onChange={(e) => apply({ ...filters, rating: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Any rating</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★</option>)}
          </select>
          <select className={select} value={filters.status ?? ""} onChange={(e) => apply({ ...filters, status: (e.target.value || undefined) as ReviewFilters["status"] })}>
            <option value="">Any status</option>
            <option value="new">New</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
            <option value="removed">Removed</option>
          </select>
          <input type="date" className={select} value={filters.from ?? ""} onChange={(e) => apply({ ...filters, from: e.target.value || undefined })} />
          <input type="date" className={select} value={filters.to ?? ""} onChange={(e) => apply({ ...filters, to: e.target.value || undefined })} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply({ ...filters, q: search.trim() || undefined });
            }}
          >
            <input className={select} placeholder="Search comments…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          <button onClick={() => { setSearch(""); apply({}); }} className="text-sm text-ink/50 hover:text-ink">
            Clear
          </button>
        </div>

        <div className="mt-4 divide-y divide-ink/5">
          {list.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink/40">No reviews match these filters.</p>
          ) : (
            list.rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className={`flex w-full items-start gap-3 py-3 text-left hover:bg-blush/40 ${r.isNew ? "bg-amber-50/60" : ""}`}
              >
                <span className="w-16 shrink-0 text-sm text-gold">{"★".repeat(r.rating)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    <span className="mr-1.5 rounded-full bg-blush px-2 py-0.5 text-[11px] font-semibold text-coral-dark">{TYPE_LABEL[r.targetType]}</span>
                    {r.targetName}
                    {r.isNew && <span className="ml-2 text-[11px] font-semibold uppercase text-amber-600">New</span>}
                  </p>
                  {r.text && <p className="mt-0.5 truncate text-sm text-ink/60">{r.text}</p>}
                  <p className="mt-0.5 text-xs text-ink/40">
                    {r.clientName} · {new Date(r.createdAt).toLocaleDateString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" })}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              </button>
            ))
          )}
        </div>

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <button disabled={(filters.page ?? 1) <= 1} onClick={() => apply({ ...filters, page: (filters.page ?? 1) - 1 })} className="rounded-full border border-ink/15 px-3 py-1 disabled:opacity-40">
              Previous
            </button>
            <span className="text-ink/50">Page {filters.page ?? 1} of {pages}</span>
            <button disabled={(filters.page ?? 1) >= pages} onClick={() => apply({ ...filters, page: (filters.page ?? 1) + 1 })} className="rounded-full border border-ink/15 px-3 py-1 disabled:opacity-40">
              Next
            </button>
          </div>
        )}
      </div>

      {openId && (
        <ReviewDetailPanel
          reviewId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => reload(filters)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: `src/components/admin/reviews/ReviewDetailPanel.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getAdminReviewDetail,
  markReviewsSeen,
  moderateReview,
  type AdminReviewDetail,
} from "@/lib/supabase/queries/adminReviews";
import { formatAppointmentDate, formatAppointmentTime } from "@/lib/appointmentFormat";

const ACTIONS = {
  visible: [
    { action: "hide", label: "Hide" },
    { action: "remove", label: "Remove" },
  ],
  hidden: [
    { action: "show", label: "Show" },
    { action: "remove", label: "Remove" },
  ],
  removed: [{ action: "restore", label: "Restore" }],
} as const;

export default function ReviewDetailPanel({
  reviewId,
  onClose,
  onChanged,
}: {
  reviewId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminReviewDetail | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function load() {
    const supabase = createClient();
    const d = await getAdminReviewDetail(supabase, reviewId);
    setDetail(d);
    if (d?.review.isNew) {
      await markReviewsSeen(supabase, [reviewId]);
      onChanged();
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewId]);

  async function act(action: "hide" | "show" | "remove" | "restore") {
    if (action === "remove" && !confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setBusy(true);
    setError(null);
    const err = await moderateReview(createClient(), reviewId, action, reason);
    setBusy(false);
    setConfirmRemove(false);
    if (err) {
      setError(err);
      return;
    }
    setReason("");
    await load();
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Review details</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink/50 hover:bg-blush">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!detail ? (
          <p className="mt-6 text-sm text-ink/40">Loading…</p>
        ) : (
          <div className="mt-4 space-y-5 text-sm">
            <div>
              <p className="text-gold">{"★".repeat(detail.review.rating)}</p>
              <p className="mt-1 font-medium text-ink">{detail.review.targetName}</p>
              <p className="text-xs text-ink/50">
                {detail.review.clientName} ·{" "}
                {new Date(detail.review.createdAt).toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-ink/80">{detail.review.text ?? <span className="text-ink/40">No comment.</span>}</p>
              <p className="mt-2 text-xs capitalize text-ink/50">Status: {detail.review.status}</p>
            </div>

            {detail.appointment && (
              <div className="rounded-xl border border-ink/10 p-3">
                <p className="text-xs font-semibold uppercase text-ink/40">Appointment</p>
                <p className="mt-1 text-ink">
                  {formatAppointmentDate(detail.appointment.scheduledDate)} · {formatAppointmentTime(detail.appointment.startTime)}
                </p>
                <p className="text-ink/60">
                  {detail.appointment.serviceName ?? "Service"}
                  {detail.appointment.therapistName && <> · {detail.appointment.therapistName}</>}
                  {detail.appointment.branchName && <> · {detail.appointment.branchName}</>}
                </p>
                {detail.appointment.bookingCode && <p className="text-xs text-ink/40">Ref: {detail.appointment.bookingCode}</p>}
                <Link href="/admin/bookings" className="mt-1 inline-block text-xs font-medium text-coral-dark hover:underline">
                  Open Bookings Management →
                </Link>
              </div>
            )}

            {detail.siblings.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-ink/40">Same visit</p>
                <ul className="mt-1 space-y-1">
                  {detail.siblings.map((s) => (
                    <li key={s.id} className="text-ink/70">
                      <span className="capitalize">{s.targetType}</span> — {"★".repeat(s.rating)} <span className="text-xs text-ink/40">({s.status})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                maxLength={300}
                className="w-full rounded-lg border border-ink/15 px-3 py-2"
              />
              {confirmRemove && <p className="text-xs text-red-600">Click Remove again to confirm.</p>}
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                {ACTIONS[detail.review.status].map((a) => (
                  <button
                    key={a.action}
                    disabled={busy}
                    onClick={() => act(a.action)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                      a.action === "remove" ? "bg-red-600 text-white" : "bg-coral text-white"
                    }`}
                  >
                    {busy ? "Saving…" : a.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-ink/40">Moderation history</p>
              {detail.history.length === 0 ? (
                <p className="mt-1 text-ink/40">No actions yet.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {detail.history.map((h) => (
                    <li key={h.id} className="text-xs text-ink/60">
                      <span className="font-medium capitalize text-ink">{h.action}</span> by {h.actorName} ·{" "}
                      {new Date(h.createdAt).toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}
                      {h.reason && <> — {h.reason}</>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 5: Sidebar + dashboard card**

`AdminSidebar.tsx`: import `Star` from lucide-react and add after Notifications: `{ href: "/admin/reviews", label: "Reviews", icon: Star },`.

`src/components/admin/dashboard/NewReviewsCard.tsx`:

```tsx
import Link from "next/link";
import { Star } from "lucide-react";

export default function NewReviewsCard({ count }: { count: number }) {
  return (
    <Link href="/admin/reviews?status=new" className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm hover:bg-blush/40">
      <span className="flex items-center gap-2 font-semibold text-ink">
        <Star className="h-5 w-5 text-gold" /> New reviews
      </span>
      <span className={`text-2xl font-semibold ${count > 0 ? "text-coral-dark" : "text-ink/40"}`}>{count}</span>
    </Link>
  );
}
```

`src/app/admin/page.tsx`: add a sixth parallel query

```ts
    supabase.from("reviews").select("id", { count: "exact", head: true }).is("admin_seen_at", null),
```

destructure as `newReviews`, import `NewReviewsCard`, and render `<NewReviewsCard count={newReviews.count ?? 0} />` directly after `<StatsCards stats={stats} />`.

- [ ] **Step 6: Verify & commit**

Run: `npm test && npx tsc --noEmit -p . && npx eslint src/components/admin/reviews src/app/admin/reviews src/lib/supabase/queries/adminReviews.ts src/components/admin/AdminSidebar.tsx src/app/admin/page.tsx src/components/admin/dashboard/NewReviewsCard.tsx`.
Deferred manual (needs 048): filters + URL, hide/show/remove/restore with log entries, New badge clears on open, two tabs update live.

```bash
git add src/lib/supabase/queries/adminReviews.ts src/app/admin/reviews src/components/admin/reviews src/components/admin/AdminSidebar.tsx src/app/admin/page.tsx src/components/admin/dashboard/NewReviewsCard.tsx
git commit -m "feat: admin Reviews page with filters, moderation and audit history" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Final checks

- [ ] **Step 1:** `grep -rn "dangerouslySetInnerHTML" src` → no occurrence renders review text (report any found).
- [ ] **Step 2:** `grep -rn "from(\"reviews\")" src` → every `profiles(` embed is `profiles!reviews_client_id_fkey(`; every public-facing read filters `status = visible` or uses the public views.
- [ ] **Step 3:** `npm test && npx tsc --noEmit -p . && npm run lint && npm run build` → tests pass, no new lint errors vs baseline (31 errors / 34 warnings on main before this work), build OK.
- [ ] **Step 4:** Deferred manual end-to-end (spec §10) after the user applies 048 and runs the check script.
