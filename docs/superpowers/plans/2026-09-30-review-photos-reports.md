# Review Photos, Service Pages, Edits & Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-service visit reviews with photos, 30-day edits, reports/Flagged moderation, public service pages, richer therapist pages, and a "rate your visit" bell + Messenger request.

**Architecture:** One migration `051_review_photos_reports.sql` (built in Tasks 1–2) adds `appointment_services`, `review_photos` (private bucket `review-photos`), `review_reports`, new SECURITY DEFINER functions, a public service-review view and a review-request trigger. The client uploads resized JPEGs to its own folder, then calls `submit_visit_review` / `edit_visit_review`. Public pages read RLS-limited rows and get 1-hour signed photo URLs generated server-side with the service role.

**Tech Stack:** Next.js 16.2.9 App Router (params/searchParams are Promises), React 19, Supabase (Postgres, RLS, Storage, Realtime), Tailwind 4, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-30-review-photos-reports-design.md`

## Global Constraints

- Never push; never run SQL against the live DB (the user applies migrations in the Supabase SQL Editor). Commit on branch `feat/review-photos`.
- Commit trailer exactly: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Files are CRLF: edit with the Edit/Write tools, not sed/node string replacement.
- AGENTS.md: this Next.js differs from training data — read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- Lint baseline is 31 errors / 34 warnings (`npm run lint`); changed files add no new errors.
- Log Supabase query errors with `logQueryError(label, error)` from `src/lib/supabase/logQueryError.ts` (never `console.error(…, error)`); before 051 is applied pages must degrade to "No reviews yet", not crash.
- Colours/components: existing Tailwind tokens (`coral`, `coral-dark`, `gold`, `blush`, `rose`, `ink`), rounded-2xl/3xl white cards, lucide icons, `Star` filled `fill-gold text-gold` on public pages.
- Photo rules: JPG/JPEG/PNG/WebP, ≤ 5 MB each before resizing, resized in the browser to max 1600 px (JPEG quality 0.85), ≤ 5 per service part, service parts only.
- Edit window: 30 days from first submission; hidden/removed parts lock editing.
- Public review statuses are `visible` and `flagged`; `hidden` and `removed` never appear publicly.
- Report reasons: `spam`, `offensive`, `inappropriate_photo`, `fake`, `other` (labels: Spam, Offensive content, Inappropriate photo, Fake/misleading review, Other).
- Service pages exist only for Active `branch_services` rows of the branch named `One Cecilia Center`.
- Reviewer display name: first name + last initial with a dot ("Maria C."), else "Client".

## Review Focus

1. A two-service booking where one name didn't match a `branch_services` row (service_id null): the form shows both blocks, submit succeeds, the unmatched part never appears on a service page. (Task 1 SQL check case; Task 3 parse test.)
2. Editing within 30 days: removing one photo and adding another replaces rows, returns the removed path, keeps ≤ 5. (Task 1 SQL check case.)
3. A photo upload failing midway: already-uploaded files are deleted, nothing is submitted, the form keeps its text and photos. (Task 5 test with a fake storage client.)
4. A hidden review with photos: neither the service page query nor the Load More API returns it or signs its photos. (Task 2 SQL check case on the view + review_photos RLS; Task 7 query test.)
5. Reporting twice / own review / signed out: correct message; status flips visible → flagged only once. (Task 2 SQL check case; Task 3 message test.)

---

### Task 1: Migration 051 part A — booked services, review parts, photos, submit/edit

**Files:**
- Create: `supabase/migrations/051_review_photos_reports.sql`
- Create: `supabase/tests/051_review_photos_reports_check.sql`

**Interfaces:**
- Consumes (from 048): `reviews`, `clean_review_text(text)`, `review_text_is_clean(text)`, `current_user_role()`.
- Produces:
  - table `appointment_services(appointment_id, position smallint, service_id uuid null, service_name text)`
  - `reviews.service_position smallint`, `reviews.edited_at`, `reviews.first_submitted_at`, status value `flagged`
  - table `review_photos(id, review_id, storage_path, position)`; bucket `review-photos`
  - `submit_visit_review(p_appointment_id uuid, p_services jsonb, p_staff_rating smallint, p_staff_text text, p_branch_rating smallint, p_branch_text text) returns void`
  - `edit_visit_review(same params) returns text[]` (storage paths no longer used)
  - `p_services` element: `{"position": 0, "rating": 5, "text": "…", "photos": ["<uid>/<appt>/<uuid>.jpg", …]}`
  - error codes: `REVIEW_NOT_ALLOWED`, `REVIEW_DUPLICATE`, `REVIEW_INVALID`, `REVIEW_INAPPROPRIATE`, `REVIEW_BAD_PHOTO`, `REVIEW_LOCKED`, `REVIEW_EDIT_EXPIRED`

- [ ] **Step 1: Write the migration (part A)**

```sql
-- 051_review_photos_reports.sql
-- Requires 048 (reviews moderation) and 049 (client notifications).
-- Part A: which services a booking contained (appointment_services),
-- one service review per booked service, review photos in a private
-- bucket, 30-day edits. Part B (below, Task 2): reports + Flagged,
-- public service review view, review-request notifications.

-- ── Booked services ───────────────────────────────────────────────────

create table if not exists appointment_services (
  appointment_id uuid not null references appointments(id) on delete cascade,
  position smallint not null check (position between 0 and 19),
  service_id uuid references branch_services(id) on delete set null,
  service_name text not null check (length(service_name) between 1 and 200),
  primary key (appointment_id, position)
);

create index if not exists appointment_services_service_idx on appointment_services (service_id);

-- service_id must be a service of the booking's branch; anything else
-- (spa packages, hair-size variants that don't resolve) is kept by name only.
create or replace function appointment_services_normalize() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.service_name := left(btrim(new.service_name), 200);
  if new.service_id is not null and not exists (
    select 1 from branch_services s join appointments a on a.id = new.appointment_id
     where s.id = new.service_id and s.branch_id = a.branch_id
  ) then
    new.service_id := null;
  end if;
  return new;
end;
$$;

revoke execute on function appointment_services_normalize() from public, anon, authenticated;

drop trigger if exists appointment_services_normalize_trigger on appointment_services;
create trigger appointment_services_normalize_trigger
  before insert on appointment_services
  for each row execute function appointment_services_normalize();

alter table appointment_services enable row level security;

drop policy if exists "read appointment services" on appointment_services;
create policy "read appointment services" on appointment_services for select using (
  exists (select 1 from appointments a where a.id = appointment_services.appointment_id and a.client_id = auth.uid())
  or coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk', 'specialist')
);

-- The booking form adds the list once, right after creating the booking.
drop policy if exists "client add own booking services" on appointment_services;
create policy "client add own booking services" on appointment_services for insert to authenticated with check (
  exists (
    select 1 from appointments a
     where a.id = appointment_services.appointment_id
       and a.client_id = auth.uid()
       and a.status::text in ('pending', 'confirmed')
       and a.created_at > now() - interval '15 minutes'
  )
  and not exists (select 1 from appointment_services x where x.appointment_id = appointment_services.appointment_id)
);

drop policy if exists "staff add booking services" on appointment_services;
create policy "staff add booking services" on appointment_services for insert to authenticated with check (
  coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk')
);

grant select, insert on appointment_services to authenticated;

-- Backfill 1: bookings that recorded a single service_id.
insert into appointment_services (appointment_id, position, service_id, service_name)
select a.id, 0, a.service_id, s.name
  from appointments a
  join branch_services s on s.id = a.service_id
 where not exists (select 1 from appointment_services x where x.appointment_id = a.id)
on conflict do nothing;

-- Backfill 2: online bookings store "<A>, <B> with <therapist> — ₱…" in notes.
insert into appointment_services (appointment_id, position, service_id, service_name)
select a.id,
       (t.ord - 1)::smallint,
       (select s.id from branch_services s
         where s.branch_id = a.branch_id and lower(btrim(s.name)) = lower(btrim(t.name))
         order by s.id limit 1),
       left(btrim(t.name), 200)
  from appointments a
 cross join lateral unnest(string_to_array(split_part(coalesce(a.notes, ''), ' with ', 1), ', '))
       with ordinality as t(name, ord)
 where a.service_id is null
   and btrim(t.name) <> ''
   and t.ord <= 20
   and not exists (select 1 from appointment_services x where x.appointment_id = a.id)
on conflict do nothing;

-- ── Review parts ──────────────────────────────────────────────────────

alter table reviews add column if not exists service_position smallint;
alter table reviews add column if not exists edited_at timestamptz;
alter table reviews add column if not exists first_submitted_at timestamptz;

update reviews set first_submitted_at = created_at where first_submitted_at is null;
alter table reviews alter column first_submitted_at set default now();
update reviews set service_position = 0 where target_type = 'service' and service_position is null;

alter table reviews drop constraint if exists reviews_status_check;
alter table reviews add constraint reviews_status_check
  check (status in ('visible', 'flagged', 'hidden', 'removed'));

drop index if exists reviews_appointment_target_uniq;
create unique index if not exists reviews_appointment_service_uniq
  on reviews (appointment_id, service_position)
  where appointment_id is not null and target_type = 'service';
create unique index if not exists reviews_appointment_other_uniq
  on reviews (appointment_id, target_type)
  where appointment_id is not null and target_type <> 'service';

drop policy if exists "read reviews" on reviews;
create policy "read reviews" on reviews for select using (
  status in ('visible', 'flagged')
  or client_id = auth.uid()
  or coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk', 'specialist')
);

-- ── Photos ────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "clients upload own review photos" on storage.objects;
create policy "clients upload own review photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "clients read own review photos" on storage.objects;
create policy "clients read own review photos" on storage.objects for select to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "clients delete own review photos" on storage.objects;
create policy "clients delete own review photos" on storage.objects for delete to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "staff read review photos" on storage.objects;
create policy "staff read review photos" on storage.objects for select to authenticated
  using (bucket_id = 'review-photos' and coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk'));

create table if not exists review_photos (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  storage_path text not null unique,
  position smallint not null check (position between 0 and 4),
  created_at timestamptz not null default now(),
  unique (review_id, position)
);

create index if not exists review_photos_review_idx on review_photos (review_id);

alter table review_photos enable row level security;

drop policy if exists "read review photos" on review_photos;
create policy "read review photos" on review_photos for select using (
  exists (
    select 1 from reviews r
     where r.id = review_photos.review_id
       and (r.status in ('visible', 'flagged') or r.client_id = auth.uid())
  )
  or coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk', 'specialist')
);

revoke insert, update, delete on review_photos from anon, authenticated;
grant select on review_photos to anon, authenticated;

-- ── Shared validation ─────────────────────────────────────────────────

create or replace function review_check_other_parts(
  p_staff_rating smallint, p_staff_text text, p_branch_rating smallint, p_branch_text text
) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if (p_staff_rating is not null and p_staff_rating not between 1 and 5)
     or (p_branch_rating is not null and p_branch_rating not between 1 and 5)
     or length(coalesce(p_staff_text, '')) > 1000
     or length(coalesce(p_branch_text, '')) > 1000 then
    raise exception 'REVIEW_INVALID';
  end if;
  if not (review_text_is_clean(p_staff_text) and review_text_is_clean(p_branch_text)) then
    raise exception 'REVIEW_INAPPROPRIATE';
  end if;
end;
$$;

-- Validates p_services against the booking's services and returns one
-- row per part. Raises before returning anything, so callers never
-- write a partial review.
create or replace function review_service_parts(p_uid uuid, p_appointment_id uuid, p_services jsonb)
returns table (pos smallint, svc_id uuid, stars smallint, body text, photos text[])
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_has_list boolean;
  v_expected integer;
  v_part jsonb;
  v_pos smallint;
  v_rating integer;
  v_seen smallint[] := '{}';
  v_all text[] := '{}';
  v_list text[];
  v_path text;
  v_pattern text := '^' || p_uid::text || '/' || p_appointment_id::text || '/[0-9a-f-]{36}\.jpg$';
begin
  if jsonb_typeof(p_services) is distinct from 'array' then
    raise exception 'REVIEW_INVALID';
  end if;

  select count(*) > 0, greatest(count(*), 1) into v_has_list, v_expected
    from appointment_services where appointment_id = p_appointment_id;
  if jsonb_array_length(p_services) <> v_expected then
    raise exception 'REVIEW_INVALID';
  end if;

  for v_part in select value from jsonb_array_elements(p_services) loop
    begin
      v_pos := (v_part ->> 'position')::smallint;
      v_rating := (v_part ->> 'rating')::integer;
    exception when others then
      raise exception 'REVIEW_INVALID';
    end;
    if v_pos is null or v_pos = any(v_seen) or v_rating is null or v_rating not between 1 and 5 then
      raise exception 'REVIEW_INVALID';
    end if;
    v_seen := v_seen || v_pos;

    if v_has_list then
      select s.service_id into svc_id from appointment_services s
       where s.appointment_id = p_appointment_id and s.position = v_pos;
      if not found then
        raise exception 'REVIEW_INVALID';
      end if;
    else
      if v_pos <> 0 then
        raise exception 'REVIEW_INVALID';
      end if;
      select a.service_id into svc_id from appointments a where a.id = p_appointment_id;
    end if;

    body := clean_review_text(v_part ->> 'text');
    if length(coalesce(body, '')) > 1000 then
      raise exception 'REVIEW_INVALID';
    end if;
    if not review_text_is_clean(body) then
      raise exception 'REVIEW_INAPPROPRIATE';
    end if;

    if (v_part ? 'photos') and jsonb_typeof(v_part -> 'photos') <> 'array' then
      raise exception 'REVIEW_BAD_PHOTO';
    end if;
    select coalesce(array_agg(x order by o), '{}') into v_list
      from jsonb_array_elements_text(coalesce(v_part -> 'photos', '[]'::jsonb)) with ordinality as t(x, o);
    if cardinality(v_list) > 5 then
      raise exception 'REVIEW_BAD_PHOTO';
    end if;
    foreach v_path in array v_list loop
      if v_path !~ v_pattern
         or v_path = any(v_all)
         or not exists (select 1 from storage.objects o where o.bucket_id = 'review-photos' and o.name = v_path) then
        raise exception 'REVIEW_BAD_PHOTO';
      end if;
      v_all := v_all || v_path;
    end loop;

    pos := v_pos;
    stars := v_rating;
    photos := v_list;
    return next;
  end loop;
end;
$$;

revoke execute on function review_check_other_parts(smallint, text, smallint, text) from public, anon, authenticated;
revoke execute on function review_service_parts(uuid, uuid, jsonb) from public, anon, authenticated;

-- ── Submit ────────────────────────────────────────────────────────────

drop function if exists submit_visit_review(uuid, smallint, text, smallint, text, smallint, text);

create or replace function submit_visit_review(
  p_appointment_id uuid, p_services jsonb,
  p_staff_rating smallint, p_staff_text text,
  p_branch_rating smallint, p_branch_text text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_appt record;
  v_part record;
  v_review_id uuid;
  v_staff_text text := clean_review_text(p_staff_text);
  v_branch_text text := clean_review_text(p_branch_text);
begin
  select id, client_id, status::text as status, session_status, professional_id, branch_id, service_id
    into v_appt from appointments where id = p_appointment_id;

  if v_uid is null or v_appt.id is null or v_appt.client_id is distinct from v_uid
     or not (v_appt.status = 'completed' or coalesce(v_appt.session_status, '') in ('completed', 'paid')) then
    raise exception 'REVIEW_NOT_ALLOWED';
  end if;

  if exists (select 1 from reviews where appointment_id = p_appointment_id) then
    raise exception 'REVIEW_DUPLICATE';
  end if;

  perform review_check_other_parts(p_staff_rating, v_staff_text, p_branch_rating, v_branch_text);

  for v_part in select * from review_service_parts(v_uid, p_appointment_id, p_services) loop
    insert into reviews (client_id, appointment_id, target_type, rating, text, service_id, service_position, branch_id, status)
    values (v_uid, p_appointment_id, 'service', v_part.stars, v_part.body, v_part.svc_id, v_part.pos, v_appt.branch_id, 'visible')
    returning id into v_review_id;

    insert into review_photos (review_id, storage_path, position)
    select v_review_id, p, (o - 1)::smallint from unnest(v_part.photos) with ordinality as t(p, o);
  end loop;

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

revoke execute on function submit_visit_review(uuid, jsonb, smallint, text, smallint, text) from public, anon;
grant execute on function submit_visit_review(uuid, jsonb, smallint, text, smallint, text) to authenticated;

-- ── Edit (30 days) ────────────────────────────────────────────────────

create or replace function edit_visit_review(
  p_appointment_id uuid, p_services jsonb,
  p_staff_rating smallint, p_staff_text text,
  p_branch_rating smallint, p_branch_text text
) returns text[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_appt record;
  v_first timestamptz;
  v_old text[];
  v_new text[] := '{}';
  v_part record;
  v_review_id uuid;
  v_staff_text text := clean_review_text(p_staff_text);
  v_branch_text text := clean_review_text(p_branch_text);
begin
  if v_uid is null then
    raise exception 'REVIEW_NOT_ALLOWED';
  end if;

  perform 1 from reviews where appointment_id = p_appointment_id for update;
  select min(first_submitted_at) into v_first
    from reviews where appointment_id = p_appointment_id and client_id = v_uid;
  if v_first is null then
    raise exception 'REVIEW_NOT_ALLOWED';
  end if;
  if exists (select 1 from reviews where appointment_id = p_appointment_id and status in ('hidden', 'removed')) then
    raise exception 'REVIEW_LOCKED';
  end if;
  if now() >= v_first + interval '30 days' then
    raise exception 'REVIEW_EDIT_EXPIRED';
  end if;

  select professional_id, branch_id, service_id into v_appt from appointments where id = p_appointment_id;

  perform review_check_other_parts(p_staff_rating, v_staff_text, p_branch_rating, v_branch_text);

  select coalesce(array_agg(ph.storage_path), '{}') into v_old
    from review_photos ph join reviews r on r.id = ph.review_id
   where r.appointment_id = p_appointment_id;

  for v_part in select * from review_service_parts(v_uid, p_appointment_id, p_services) loop
    v_review_id := null;
    update reviews set rating = v_part.stars, text = v_part.body, edited_at = now()
     where appointment_id = p_appointment_id and target_type = 'service' and service_position = v_part.pos
     returning id into v_review_id;
    if v_review_id is null then
      insert into reviews (client_id, appointment_id, target_type, rating, text, service_id, service_position,
                           branch_id, status, first_submitted_at, edited_at)
      values (v_uid, p_appointment_id, 'service', v_part.stars, v_part.body, v_part.svc_id, v_part.pos,
              v_appt.branch_id, 'visible', v_first, now())
      returning id into v_review_id;
    end if;
    delete from review_photos where review_id = v_review_id;
    insert into review_photos (review_id, storage_path, position)
    select v_review_id, p, (o - 1)::smallint from unnest(v_part.photos) with ordinality as t(p, o);
    v_new := v_new || v_part.photos;
  end loop;

  -- Therapist / branch parts: can be added or changed, not removed.
  if exists (select 1 from reviews where appointment_id = p_appointment_id and target_type = 'staff') then
    if p_staff_rating is null then
      raise exception 'REVIEW_INVALID';
    end if;
    update reviews set rating = p_staff_rating, text = v_staff_text, edited_at = now()
     where appointment_id = p_appointment_id and target_type = 'staff';
  elsif p_staff_rating is not null and v_appt.professional_id is not null then
    insert into reviews (client_id, appointment_id, target_type, rating, text, staff_id, service_id, branch_id,
                         status, first_submitted_at, edited_at)
    values (v_uid, p_appointment_id, 'staff', p_staff_rating, v_staff_text, v_appt.professional_id,
            v_appt.service_id, v_appt.branch_id, 'visible', v_first, now());
  end if;

  if exists (select 1 from reviews where appointment_id = p_appointment_id and target_type = 'branch') then
    if p_branch_rating is null then
      raise exception 'REVIEW_INVALID';
    end if;
    update reviews set rating = p_branch_rating, text = v_branch_text, edited_at = now()
     where appointment_id = p_appointment_id and target_type = 'branch';
  elsif p_branch_rating is not null and v_appt.branch_id is not null then
    insert into reviews (client_id, appointment_id, target_type, rating, text, service_id, branch_id,
                         status, first_submitted_at, edited_at)
    values (v_uid, p_appointment_id, 'branch', p_branch_rating, v_branch_text, v_appt.service_id,
            v_appt.branch_id, 'visible', v_first, now());
  end if;

  return array(select x from unnest(v_old) as x where not (x = any(v_new)));
end;
$$;

revoke execute on function edit_visit_review(uuid, jsonb, smallint, text, smallint, text) from public, anon;
grant execute on function edit_visit_review(uuid, jsonb, smallint, text, smallint, text) to authenticated;
```

- [ ] **Step 2: Write the check script (part A)**

Create `supabase/tests/051_review_photos_reports_check.sql`, run top to bottom inside `begin; … rollback;` by the user in the SQL Editor after replacing placeholders. Header:

```sql
-- 051 check script. Replace before running:
--   :CLIENT_ID   a customer profile id        :OTHER_ID  another customer profile id
--   :ADMIN_ID    an admin profile id          :BRANCH_ID the One Cecilia Center branch id
--   :SVC_ID      an Active branch_services id at :BRANCH_ID
--   :STAFF_ID    a staff_members id
-- Every check prints NOTICE 'PASS …' or WARNING 'FAIL …'. Everything is rolled back.
-- If the storage.objects inserts are rejected on your Supabase version, upload any
-- image files to the matching review-photos paths in the Storage dashboard and delete those lines.
begin;
```

Seed as postgres (fill the `appointments` NOT NULL columns by reading `supabase/schema.sql` + migrations: at least `booking_code, branch_id, client_id, professional_id, appointment_type, scheduled_date, start_time, duration_minutes, status, notes`), using fixed ids so later steps can reference them:

```sql
insert into appointments (id, booking_code, branch_id, client_id, professional_id, appointment_type,
                          scheduled_date, start_time, duration_minutes, status, notes)
values ('00000000-0000-4000-8000-000000000051', 'CHK051', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'online',
        current_date - 1, '10:00', 60, 'completed', 'Check Service, Not A Real Name with Tester — ₱1.00');
insert into appointment_services (appointment_id, position, service_id, service_name) values
  ('00000000-0000-4000-8000-000000000051', 0, ':SVC_ID', 'Check Service'),
  ('00000000-0000-4000-8000-000000000051', 1, null, 'Not A Real Name');
insert into storage.objects (bucket_id, name) values
  ('review-photos', ':CLIENT_ID/00000000-0000-4000-8000-000000000051/11111111-1111-4111-8111-111111111111.jpg'),
  ('review-photos', ':CLIENT_ID/00000000-0000-4000-8000-000000000051/22222222-2222-4222-8222-222222222222.jpg'),
  ('review-photos', ':OTHER_ID/00000000-0000-4000-8000-000000000051/33333333-3333-4333-8333-333333333333.jpg');
```

(If `appointment_type` has no `'online'` value, use whatever value `BookingModal.tsx` inserts.) Then switch to the client (`select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true); set local role authenticated;`) and add one `do $$ … $$` block per case, each checking `sqlerrm` exactly, in this style:

```sql
do $$ begin
  perform submit_visit_review('00000000-0000-4000-8000-000000000051',
    '[{"position":0,"rating":5,"text":"ok"}]'::jsonb, null, null, null, null);
  raise warning 'FAIL missing second service part accepted';
exception when others then
  if sqlerrm = 'REVIEW_INVALID' then raise notice 'PASS every booked service needs a part';
  else raise warning 'FAIL missing part got %', sqlerrm; end if;
end $$;
```

Cases (expected result in brackets):
1. Only one of two parts → `REVIEW_INVALID`.
2. Duplicate position `[{position 0},{position 0}]` → `REVIEW_INVALID`.
3. Rating 6 → `REVIEW_INVALID`.
4. Photo of another user (`:OTHER_ID/…/3333….jpg`) → `REVIEW_BAD_PHOTO`.
5. Photo path in own folder that does not exist in storage → `REVIEW_BAD_PHOTO`.
6. Six photos → `REVIEW_BAD_PHOTO`.
7. Same photo on both parts → `REVIEW_BAD_PHOTO`.
8. Success: part 0 rating 5 with photos 1111 and 2222, part 1 rating 4, staff 5, branch null. Then `select` and PASS/FAIL: 3 review rows for the appointment; service row at position 1 has `service_id is null`; 2 `review_photos` rows with positions 0 and 1.
9. Submit again → `REVIEW_DUPLICATE`.
10. `edit_visit_review` keeping only photo 2222 on part 0, rating 3 → returns `{…1111….jpg}`; PASS if the returned array equals exactly that path and part 0 rating is 3 and `edited_at is not null`.
11. Edit with staff rating null (staff part exists) → `REVIEW_INVALID`.
12. As postgres: `update reviews set first_submitted_at = now() - interval '31 days' where appointment_id = '…051'`; back as client: edit → `REVIEW_EDIT_EXPIRED`. Reset `first_submitted_at = now()`.
13. As postgres: set the staff part `status = 'hidden'`; as client: edit → `REVIEW_LOCKED`. Reset to `visible`.
14. As :OTHER_ID: `edit_visit_review` on the appointment → `REVIEW_NOT_ALLOWED`.
15. As :OTHER_ID: `insert into appointment_services (appointment_id, position, service_name) values ('…051', 5, 'x')` → any error (RLS) = PASS.
16. As postgres: `insert into appointment_services … service_id` of a `branch_services` row from a *different* branch (pick one with `select id from branch_services where branch_id <> ':BRANCH_ID' limit 1`) → the stored `service_id` is null (normalize trigger).

End with `rollback;`.

- [ ] **Step 3: Self-check syntax**

Re-read the whole migration once: balanced `$$`, every trigger created after its function, every `drop function` before a signature change. No database is available — do not try to run it.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/051_review_photos_reports.sql supabase/tests/051_review_photos_reports_check.sql
git commit -m "feat: review photos, per-service review parts and 30-day edits (051 part A)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 051 part B — reports, Flagged, public views, review request

**Files:**
- Modify: `supabase/migrations/051_review_photos_reports.sql` (append)
- Modify: `supabase/tests/051_review_photos_reports_check.sql` (append cases before `rollback;`)

**Interfaces:**
- Consumes: Task 1 objects.
- Produces:
  - `report_review(p_review_id uuid, p_reason text, p_note text) returns void` — errors `REVIEW_NOT_ALLOWED`, `REVIEW_INVALID`, `REVIEW_REPORTED`
  - table `review_reports(id, review_id, reporter_id, reason, note, created_at)`
  - `moderate_review(p_review_id, p_action, p_reason)` actions `hide | show | remove | restore | keep`
  - view `public_service_reviews(id, service_id, rating, text, created_at, edited_at, reviewer, staff_id, staff_name, service_date, photo_count)`
  - view `public_staff_reviews` gains trailing columns `service_name, service_date, edited_at`
  - `client_notifications.kind` value `review_request`, link `/my-glow?review=<appointment_id>`
  - `messenger_outbox.kind` value `review_request`

- [ ] **Step 1: Append part B to the migration**

```sql
-- ════════════════════════════════════════════════════════════════════
-- Part B: reports + Flagged, public review views, review requests.
-- ════════════════════════════════════════════════════════════════════

-- ── Reports ───────────────────────────────────────────────────────────

create table if not exists review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reviews(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason text not null check (reason in ('spam', 'offensive', 'inappropriate_photo', 'fake', 'other')),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);

create index if not exists review_reports_review_idx on review_reports (review_id, created_at desc);

alter table review_reports enable row level security;

drop policy if exists "read review reports" on review_reports;
create policy "read review reports" on review_reports for select using (
  reporter_id = auth.uid() or coalesce(public.current_user_role()::text, '') = 'admin'
);

revoke insert, update, delete on review_reports from anon, authenticated;
grant select on review_reports to authenticated;

alter table review_moderation_log drop constraint if exists review_moderation_log_action_check;
alter table review_moderation_log add constraint review_moderation_log_action_check
  check (action in ('hide', 'show', 'remove', 'restore', 'keep', 'flag'));

create or replace function report_review(p_review_id uuid, p_reason text, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_rev record;
  v_note text := clean_review_text(p_note);
begin
  if v_uid is null then
    raise exception 'REVIEW_NOT_ALLOWED';
  end if;
  select id, client_id, status into v_rev from reviews where id = p_review_id for update;
  if v_rev.id is null or v_rev.status not in ('visible', 'flagged') or v_rev.client_id = v_uid then
    raise exception 'REVIEW_NOT_ALLOWED';
  end if;
  if coalesce(p_reason, '') not in ('spam', 'offensive', 'inappropriate_photo', 'fake', 'other')
     or length(coalesce(v_note, '')) > 500 then
    raise exception 'REVIEW_INVALID';
  end if;

  insert into review_reports (review_id, reporter_id, reason, note) values (p_review_id, v_uid, p_reason, v_note);

  if v_rev.status = 'visible' then
    update reviews
       set status = 'flagged', status_changed_at = now(), status_changed_by = v_uid, admin_seen_at = null
     where id = p_review_id;
    insert into review_moderation_log (review_id, action, from_status, to_status, reason, actor_id)
    values (p_review_id, 'flag', 'visible', 'flagged', p_reason, v_uid);
  end if;
exception
  when unique_violation then
    raise exception 'REVIEW_REPORTED';
end;
$$;

revoke execute on function report_review(uuid, text, text) from public, anon;
grant execute on function report_review(uuid, text, text) to authenticated;

-- Same signature as 048; adds Flagged transitions and "keep".
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
    when p_action = 'hide' and v_from in ('visible', 'flagged') then 'hidden'
    when p_action = 'show' and v_from = 'hidden' then 'visible'
    when p_action = 'keep' and v_from = 'flagged' then 'visible'
    when p_action = 'remove' and v_from in ('visible', 'flagged', 'hidden') then 'removed'
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

-- ── Public views ──────────────────────────────────────────────────────

create or replace view public_staff_reviews as
select r.id, r.staff_id, r.rating, r.text, r.created_at,
       coalesce(
         nullif(btrim(split_part(btrim(p.full_name), ' ', 1) || ' ' ||
                      coalesce(left(nullif(split_part(btrim(p.full_name), ' ', 2), ''), 1) || '.', '')), ''),
         'Client') as reviewer,
       coalesce(
         (select string_agg(x.service_name, ', ' order by x.position)
            from appointment_services x where x.appointment_id = r.appointment_id),
         s.name) as service_name,
       a.scheduled_date as service_date,
       r.edited_at
  from reviews r
  left join profiles p on p.id = r.client_id
  left join appointments a on a.id = r.appointment_id
  left join branch_services s on s.id = r.service_id
 where r.target_type = 'staff' and r.status in ('visible', 'flagged') and r.staff_id is not null;

create or replace view public_service_reviews as
select r.id, r.service_id, r.rating, r.text, r.created_at, r.edited_at,
       coalesce(
         nullif(btrim(split_part(btrim(p.full_name), ' ', 1) || ' ' ||
                      coalesce(left(nullif(split_part(btrim(p.full_name), ' ', 2), ''), 1) || '.', '')), ''),
         'Client') as reviewer,
       a.professional_id as staff_id,
       sm.full_name as staff_name,
       a.scheduled_date as service_date,
       (select count(*) from review_photos ph where ph.review_id = r.id)::integer as photo_count
  from reviews r
  left join profiles p on p.id = r.client_id
  left join appointments a on a.id = r.appointment_id
  left join staff_members sm on sm.id = a.professional_id
 where r.target_type = 'service' and r.status in ('visible', 'flagged') and r.service_id is not null;

grant select on public_staff_reviews to anon, authenticated;
grant select on public_service_reviews to anon, authenticated;

-- ── Review request (bell + Messenger) ─────────────────────────────────

alter table client_notifications drop constraint if exists client_notifications_kind_check;
alter table client_notifications add constraint client_notifications_kind_check
  check (kind in ('confirmed', 'cancelled', 'review_request'));

create unique index if not exists client_notifications_one_review_request
  on client_notifications (appointment_id) where kind = 'review_request';

alter table messenger_outbox drop constraint if exists messenger_outbox_kind_check;
alter table messenger_outbox add constraint messenger_outbox_kind_check
  check (kind in ('reminder', 'appointment_update', 'promo', 'booking_invite', 'review_request'));

create or replace function notify_client_review_request() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_services text;
  v_staff text;
begin
  if new.client_id is null then
    return new;
  end if;
  if not (new.status::text = 'completed' or coalesce(new.session_status, '') in ('completed', 'paid')) then
    return new;
  end if;
  if old.status::text = 'completed' or coalesce(old.session_status, '') in ('completed', 'paid') then
    return new;
  end if;
  if exists (select 1 from reviews where appointment_id = new.id) then
    return new;
  end if;

  select string_agg(service_name, ', ' order by position) into v_services
    from appointment_services where appointment_id = new.id;
  v_services := coalesce(
    v_services,
    (select name from branch_services where id = new.service_id),
    nullif(btrim(split_part(coalesce(new.notes, ''), ' with ', 1)), ''),
    'visit');
  select full_name into v_staff from staff_members where id = new.professional_id;

  insert into client_notifications (client_id, appointment_id, kind, title, body, link_path)
  values (
    new.client_id, new.id, 'review_request',
    'How was your GlowSync experience?',
    'Your ' || v_services || coalesce(' with ' || v_staff, '') || ' has been completed. Tap to rate and review.',
    '/my-glow?review=' || new.id
  )
  on conflict do nothing;

  insert into messenger_outbox (profile_id, kind, appointment_id, link_path)
  select new.client_id, 'review_request', new.id, '/my-glow?review=' || new.id
   where exists (select 1 from messenger_subscriptions s where s.profile_id = new.client_id and s.opted_out_at is null)
     and not exists (select 1 from messenger_outbox o where o.appointment_id = new.id and o.kind = 'review_request');

  return new;
exception when others then
  -- Never block completing a service over a notification.
  raise warning 'notify_client_review_request failed: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function notify_client_review_request() from public, anon, authenticated;

drop trigger if exists appointments_review_request_trigger on appointments;
create trigger appointments_review_request_trigger
  after update of status, session_status on appointments
  for each row execute function notify_client_review_request();

do $$ begin
  alter publication supabase_realtime add table review_reports;
exception when duplicate_object then null; end $$;
```

Before writing, confirm the real constraint names with `grep -n "check (kind" supabase/migrations/047_messenger.sql supabase/migrations/049_client_notifications.sql` — inline column checks are auto-named `<table>_<column>_check`, which is what the `drop constraint if exists` lines assume.

- [ ] **Step 2: Append check cases (before `rollback;`)**

Continuing from Task 1's state (a submitted review for `…051`):
17. As :OTHER_ID: `report_review(<the service part id>, 'spam', 'test')` succeeds; PASS if its status is now `flagged` and one `review_moderation_log` row with action `flag` exists.
18. As :OTHER_ID again, same review → `REVIEW_REPORTED`.
19. As :CLIENT_ID on own review → `REVIEW_NOT_ALLOWED`.
20. Reason `'bad'` (as a third id — reuse :ADMIN_ID) → `REVIEW_INVALID`.
21. `select count(*) from public_service_reviews where id = <part 0 id>` = 1 (flagged still public); `photo_count` = 1.
22. As :ADMIN_ID: `moderate_review(<id>, 'keep', null)` → status `visible`; `moderate_review(<id>, 'hide', 'x')` → `hidden`.
23. As anon (`set local role anon; select set_config('request.jwt.claims', '{}', true);`): `public_service_reviews` count for that id = 0 **and** `select count(*) from review_photos where review_id = <id>` = 0 (hidden photos not readable). Back as admin: `show` it.
24. Notification: as postgres insert a second appointment for :CLIENT_ID with status `confirmed`, then `update … set session_status = 'completed'`; PASS if exactly one `client_notifications` row kind `review_request` with `link_path = '/my-glow?review=' || id`; update `status = 'completed'` too → still exactly one.
25. `select * from pg_policies where tablename = 'objects' and policyname like '%review photos%'` → 4 rows listed.

- [ ] **Step 3: Self-check syntax** (same as Task 1 Step 3).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/051_review_photos_reports.sql supabase/tests/051_review_photos_reports_check.sql
git commit -m "feat: review reports, flagged status, public review views and review requests (051 part B)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Shared review, photo and booked-service helpers

**Files:**
- Modify: `src/lib/reviews.ts`
- Create: `src/lib/reviewPhotos.ts`, `src/lib/bookedServices.ts`
- Test: `src/lib/reviews.test.ts` (create if missing; if it exists, append), `src/lib/reviewPhotos.test.ts`, `src/lib/bookedServices.test.ts`

**Interfaces:**
- Produces (`src/lib/reviews.ts`):
  - `type ReviewStatus = "visible" | "flagged" | "hidden" | "removed"`
  - `isPublicStatus(s: ReviewStatus): boolean`
  - `reviewErrorMessage(err)` — adds codes below
  - `EDIT_WINDOW_DAYS = 30`; `canEditReview(firstSubmittedAt: string, statuses: ReviewStatus[], now?: Date): boolean`
  - `reviewerName(fullName: string | null): string`
  - `REPORT_REASONS: { value: ReportReason; label: string }[]`; `type ReportReason`
  - `type StarFilter = "all" | 1 | 2 | 3 | 4 | 5 | "photos"`; `parseStarFilter(v: string | null): StarFilter`
- Produces (`src/lib/reviewPhotos.ts`): `MAX_REVIEW_PHOTOS = 5`, `validateReviewPhoto(file: { type: string; size: number }): string | null`, `fitWithin(w, h, max = 1600): { width: number; height: number }`, `resizeToJpeg(file: File, max = 1600): Promise<Blob>` (browser only), `reviewPhotoPath(uid, appointmentId, id): string`
- Produces (`src/lib/bookedServices.ts`): `bookedServiceId(id: string | undefined): string | null`, `parseNotesServiceNames(notes: string | null): string[]`, `toAppointmentServiceRows(appointmentId, services: { id?: string; name: string }[])`

- [ ] **Step 1: Write failing tests**

`src/lib/reviewPhotos.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { fitWithin, reviewPhotoPath, validateReviewPhoto } from "./reviewPhotos";

describe("validateReviewPhoto", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s up to 5 MB", (type) => {
    expect(validateReviewPhoto({ type, size: 5 * 1024 * 1024 })).toBeNull();
  });
  it("rejects other types and big files", () => {
    const msg = "Use JPG, PNG or WebP photos up to 5 MB each.";
    expect(validateReviewPhoto({ type: "image/gif", size: 10 })).toBe(msg);
    expect(validateReviewPhoto({ type: "image/jpeg", size: 5 * 1024 * 1024 + 1 })).toBe(msg);
  });
});

describe("fitWithin", () => {
  it("keeps small images", () => expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 }));
  it("scales the long side to 1600", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
});

it("builds the storage path", () => {
  expect(reviewPhotoPath("u1", "a1", "p1")).toBe("u1/a1/p1.jpg");
});
```

`src/lib/bookedServices.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { bookedServiceId, parseNotesServiceNames, toAppointmentServiceRows } from "./bookedServices";

const ID = "3f0c2a52-9d1e-4a8b-9d7f-0b1c2d3e4f50";

describe("bookedServiceId", () => {
  it("keeps a plain uuid", () => expect(bookedServiceId(ID)).toBe(ID));
  it("strips a hair-size suffix", () => expect(bookedServiceId(`${ID}·short`)).toBe(ID));
  it("drops package / missing ids", () => {
    expect(bookedServiceId("pkg-gold")).toBeNull();
    expect(bookedServiceId(undefined)).toBeNull();
  });
});

describe("parseNotesServiceNames", () => {
  it("splits the booking notes like the SQL backfill", () => {
    expect(parseNotesServiceNames("Facial, Eyebrow with Maria — ₱1,150.00")).toEqual(["Facial", "Eyebrow"]);
    expect(parseNotesServiceNames("Deep Tissue Massage with Any Professional — ₱1,500.00")).toEqual(["Deep Tissue Massage"]);
  });
  it("handles empty notes", () => {
    expect(parseNotesServiceNames(null)).toEqual([]);
    expect(parseNotesServiceNames("  ")).toEqual([]);
  });
});

it("builds ordered rows", () => {
  expect(toAppointmentServiceRows("a1", [{ id: ID, name: "Facial " }, { id: "pkg", name: "Gold Spa Package" }])).toEqual([
    { appointment_id: "a1", position: 0, service_id: ID, service_name: "Facial" },
    { appointment_id: "a1", position: 1, service_id: null, service_name: "Gold Spa Package" },
  ]);
});
```

`src/lib/reviews.test.ts` (append these `describe`s; keep existing tests):
```ts
import { canEditReview, parseStarFilter, reviewErrorMessage, reviewerName, isPublicStatus } from "./reviews";

describe("review helpers", () => {
  it("maps new error codes", () => {
    expect(reviewErrorMessage({ message: "REVIEW_BAD_PHOTO" })).toBe("One of your photos couldn't be used. Please remove it and try again.");
    expect(reviewErrorMessage({ message: "REVIEW_LOCKED" })).toBe("This review can no longer be edited.");
    expect(reviewErrorMessage({ message: "REVIEW_EDIT_EXPIRED" })).toBe("Reviews can only be edited within 30 days.");
    expect(reviewErrorMessage({ message: "REVIEW_REPORTED" })).toBe("You already reported this review.");
  });
  it("edit window is 30 days and locked by hidden/removed", () => {
    const now = new Date("2026-10-30T00:00:00Z");
    expect(canEditReview("2026-10-01T00:00:01Z", ["visible"], now)).toBe(true);
    expect(canEditReview("2026-09-30T00:00:00Z", ["visible"], now)).toBe(false);
    expect(canEditReview("2026-10-20T00:00:00Z", ["visible", "hidden"], now)).toBe(false);
    expect(canEditReview("2026-10-20T00:00:00Z", ["flagged"], now)).toBe(true);
  });
  it("shows first name + initial", () => {
    expect(reviewerName("Maria Clara Santos")).toBe("Maria C.");
    expect(reviewerName("Cher")).toBe("Cher");
    expect(reviewerName("  ")).toBe("Client");
    expect(reviewerName(null)).toBe("Client");
  });
  it("parses star filters", () => {
    expect(parseStarFilter("4")).toBe(4);
    expect(parseStarFilter("photos")).toBe("photos");
    expect(parseStarFilter("9")).toBe("all");
    expect(parseStarFilter(null)).toBe("all");
  });
  it("public statuses", () => {
    expect(isPublicStatus("flagged")).toBe(true);
    expect(isPublicStatus("hidden")).toBe(false);
  });
});
```
(If `reviews.test.ts` already imports from `./reviews`, merge the import lines.)

- [ ] **Step 2: Run** `npx vitest run src/lib/reviews.test.ts src/lib/reviewPhotos.test.ts src/lib/bookedServices.test.ts` — expect FAIL (missing exports/modules).

- [ ] **Step 3: Implement**

`src/lib/reviews.ts` — change the status type and add below the existing code (keep `summarizeRatings`; keep the existing `MESSAGES` entries and add four):
```ts
export type ReviewStatus = "visible" | "flagged" | "hidden" | "removed";

// add to MESSAGES:
//   REVIEW_BAD_PHOTO: "One of your photos couldn't be used. Please remove it and try again.",
//   REVIEW_LOCKED: "This review can no longer be edited.",
//   REVIEW_EDIT_EXPIRED: "Reviews can only be edited within 30 days.",
//   REVIEW_REPORTED: "You already reported this review.",

export function isPublicStatus(s: ReviewStatus): boolean {
  return s === "visible" || s === "flagged";
}

export const EDIT_WINDOW_DAYS = 30;

export function canEditReview(firstSubmittedAt: string, statuses: ReviewStatus[], now: Date = new Date()): boolean {
  if (statuses.some((s) => s === "hidden" || s === "removed")) return false;
  return now.getTime() < Date.parse(firstSubmittedAt) + EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Mirrors the SQL views: "Maria Clara Santos" → "Maria C.". */
export function reviewerName(fullName: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Client";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[1].charAt(0)}.`;
}

export type ReportReason = "spam" | "offensive" | "inappropriate_photo" | "fake" | "other";
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "offensive", label: "Offensive content" },
  { value: "inappropriate_photo", label: "Inappropriate photo" },
  { value: "fake", label: "Fake/misleading review" },
  { value: "other", label: "Other" },
];

export type StarFilter = "all" | 1 | 2 | 3 | 4 | 5 | "photos";
export function parseStarFilter(v: string | null): StarFilter {
  if (v === "photos") return "photos";
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as StarFilter) : "all";
}
```
Then grep for `ReviewStatus` usages (`grep -rn "ReviewStatus\|\"visible\"" src`) and make any exhaustive `Record<ReviewStatus, …>` maps (e.g. `STATUS_STYLE` in `ReviewsManager.tsx`) include `flagged: "bg-amber-100 text-amber-700"` so `tsc` passes.

`src/lib/reviewPhotos.ts`:
```ts
export const MAX_REVIEW_PHOTOS = 5;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_PHOTO_MESSAGE = "Use JPG, PNG or WebP photos up to 5 MB each.";

export function validateReviewPhoto(file: { type: string; size: number }): string | null {
  return TYPES.has(file.type) && file.size <= MAX_BYTES ? null : REVIEW_PHOTO_MESSAGE;
}

export function fitWithin(width: number, height: number, max = 1600): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Browser only: decode, shrink to max px on the long side, re-encode as JPEG 0.85. */
export async function resizeToJpeg(file: File, max = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.85)
  );
}

export function reviewPhotoPath(uid: string, appointmentId: string, id: string): string {
  return `${uid}/${appointmentId}/${id}.jpg`;
}
```

`src/lib/bookedServices.ts`:
```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Booking-form ids: "<uuid>", "<uuid>·short" (hair size) or a package key. */
export function bookedServiceId(id: string | undefined): string | null {
  const base = (id ?? "").split("·")[0];
  return UUID_RE.test(base) ? base : null;
}

/** Mirrors 051's backfill: "<A>, <B> with <therapist> — ₱…" → ["A", "B"]. */
export function parseNotesServiceNames(notes: string | null): string[] {
  const head = (notes ?? "").split(" with ")[0];
  return head
    .split(", ")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function toAppointmentServiceRows(appointmentId: string, services: { id?: string; name: string }[]) {
  return services.slice(0, 20).map((s, position) => ({
    appointment_id: appointmentId,
    position,
    service_id: bookedServiceId(s.id),
    service_name: s.name.trim().slice(0, 200),
  }));
}
```

- [ ] **Step 4: Run** the three test files — PASS; then `npx tsc --noEmit` — clean.

- [ ] **Step 5: Commit** — `git commit -m "feat: review photo, star filter and booked-service helpers"` (with trailer).

---

### Task 4: Booking form records the booked services

**Files:**
- Modify: `src/components/booking/BookingModal.tsx` (after the appointments insert, ~line 641–660)

**Interfaces:**
- Consumes: `toAppointmentServiceRows` (Task 3); table `appointment_services` (Task 1).

- [ ] **Step 1: Implement** — right after the successful `appointments` insert (where `appt.id` is known and before any payment/redirect logic), add:

```ts
      const { error: servicesError } = await supabase
        .from("appointment_services")
        .insert(toAppointmentServiceRows(appt.id, selectedServices));
      // The booking itself is already saved; a missing list only means
      // reviews fall back to the notes text. Never fail the booking over it.
      if (servicesError) logQueryError("BookingModal appointment_services", servicesError);
```
Import `toAppointmentServiceRows` from `@/lib/bookedServices` and `logQueryError` from `@/lib/supabase/logQueryError`. Keep it inside the same `if (!error && appt)` success path the code already uses (read the surrounding lines first; do not reorder the existing steps).

- [ ] **Step 2: Verify** — `npx tsc --noEmit`, `npx eslint src/components/booking/BookingModal.tsx` (no new errors vs. `git stash`-free baseline: compare the count before/after your edit), `npm test`.

- [ ] **Step 3: Commit** — `feat: booking form records each booked service`.

---

### Task 5: Client review data layer (per-service parts, photo upload, submit/edit)

**Files:**
- Create: `src/lib/supabase/queries/visitReviews.ts`
- Test: `src/lib/supabase/queries/visitReviews.test.ts`
- Modify: `src/lib/supabase/queries/myGlow.ts` (remove `getVisitReviews`, `submitVisitReview`, `ReviewPart`, `VisitReview`, `VisitReviewInput`; extend `RecentAppointment` + `getRecentAppointments`; extend `MyReview` + `getMyReviews`)

**Interfaces:**
- Consumes: Task 1 RPCs; Task 3 helpers.
- Produces (`visitReviews.ts`):
```ts
export type BookedService = { position: number; serviceId: string | null; name: string };
export type ServicePart = { reviewId: string; position: number; rating: number; text: string | null; status: ReviewStatus; photos: { path: string; url: string }[] };
export type OtherPart = { reviewId: string; rating: number; text: string | null; status: ReviewStatus };
export type VisitReview = { services: ServicePart[]; staff?: OtherPart; branch?: OtherPart; firstSubmittedAt: string; editedAt: string | null };
export type ServiceDraft = { position: number; rating: number; text: string; keep: string[]; add: Blob[] };
export type VisitReviewDraft = { appointmentId: string; services: ServiceDraft[]; staff: { rating: number; text: string } | null; branch: { rating: number; text: string } | null };
export async function getVisitReviews(supabase: SupabaseClient, clientId: string): Promise<Record<string, VisitReview>>;
export async function saveVisitReview(supabase: SupabaseClient, uid: string, draft: VisitReviewDraft, mode: "submit" | "edit", onProgress?: (done: number, total: number) => void): Promise<{ error: string | null; code: string | null }>;
```
- `RecentAppointment` gains `bookedServices: BookedService[]` (ordered by position; when the booking has no rows, one entry `{ position: 0, serviceId: <appointments.service_id>, name: serviceName ?? "Your service" }`).
- `MyReview` gains `appointmentId: string | null`, `editedAt: string | null`, `photos: string[]` (signed URLs).

- [ ] **Step 1: Write failing tests** for `saveVisitReview` with a hand-rolled fake client (no network):

```ts
import { describe, expect, it, vi } from "vitest";
import { saveVisitReview, type VisitReviewDraft } from "./visitReviews";

function fakeClient(opts: { failUploadAt?: number; rpcError?: string; editReturns?: string[] }) {
  const uploaded: string[] = [];
  const removed: string[][] = [];
  let n = 0;
  const bucket = {
    upload: vi.fn(async (path: string) => {
      n += 1;
      if (opts.failUploadAt === n) return { error: { message: "boom" } };
      uploaded.push(path);
      return { error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      removed.push(paths);
      return { error: null };
    }),
  };
  const rpc = vi.fn(async () =>
    opts.rpcError ? { data: null, error: { message: opts.rpcError } } : { data: opts.editReturns ?? null, error: null }
  );
  return { client: { storage: { from: () => bucket }, rpc } as never, uploaded, removed, rpc };
}

const draft = (add: number): VisitReviewDraft => ({
  appointmentId: "a1",
  services: [{ position: 0, rating: 5, text: "Great", keep: ["u1/a1/old.jpg"], add: Array.from({ length: add }, () => new Blob(["x"])) }],
  staff: { rating: 4, text: "" },
  branch: null,
});

describe("saveVisitReview", () => {
  it("uploads, then submits paths in order", async () => {
    const f = fakeClient({});
    const res = await saveVisitReview(f.client, "u1", draft(2), "submit");
    expect(res.error).toBeNull();
    const args = f.rpc.mock.calls[0] as unknown as [string, { p_services: { photos: string[] }[] }];
    expect(args[0]).toBe("submit_visit_review");
    expect(args[1].p_services[0].photos).toEqual(["u1/a1/old.jpg", ...f.uploaded]);
  });

  it("cleans up uploaded files when an upload fails midway", async () => {
    const f = fakeClient({ failUploadAt: 2 });
    const res = await saveVisitReview(f.client, "u1", draft(3), "submit");
    expect(res.error).toBe("Couldn't upload your photos. Please try again.");
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.removed).toEqual([f.uploaded]);
  });

  it("cleans up new uploads when the RPC rejects", async () => {
    const f = fakeClient({ rpcError: "REVIEW_INAPPROPRIATE" });
    const res = await saveVisitReview(f.client, "u1", draft(1), "submit");
    expect(res.code).toBe("REVIEW_INAPPROPRIATE");
    expect(f.removed).toEqual([f.uploaded]);
  });

  it("deletes files the edit no longer uses", async () => {
    const f = fakeClient({ editReturns: ["u1/a1/gone.jpg"] });
    await saveVisitReview(f.client, "u1", draft(0), "edit");
    expect(f.rpc.mock.calls[0][0]).toBe("edit_visit_review");
    expect(f.removed).toEqual([["u1/a1/gone.jpg"]]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/supabase/queries/visitReviews.test.ts` — FAIL.

- [ ] **Step 3: Implement `visitReviews.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReviewStatus, ReviewTarget } from "@/lib/reviews";
import { reviewPhotoPath } from "@/lib/reviewPhotos";
import { logQueryError } from "@/lib/supabase/logQueryError";

// (types from Interfaces above)

const BUCKET = "review-photos";
export const UPLOAD_FAILED = "Couldn't upload your photos. Please try again.";

export async function saveVisitReview(
  supabase: SupabaseClient,
  uid: string,
  draft: VisitReviewDraft,
  mode: "submit" | "edit",
  onProgress?: (done: number, total: number) => void
): Promise<{ error: string | null; code: string | null }> {
  const bucket = supabase.storage.from(BUCKET);
  const total = draft.services.reduce((n, s) => n + s.add.length, 0);
  const uploaded: string[] = [];
  const photosByPart: string[][] = [];

  for (const part of draft.services) {
    const paths = [...part.keep];
    for (const blob of part.add) {
      const path = reviewPhotoPath(uid, draft.appointmentId, crypto.randomUUID());
      const { error } = await bucket.upload(path, blob, { contentType: "image/jpeg" });
      if (error) {
        logQueryError("saveVisitReview upload", error);
        if (uploaded.length) await bucket.remove(uploaded);
        return { error: UPLOAD_FAILED, code: null };
      }
      uploaded.push(path);
      paths.push(path);
      onProgress?.(uploaded.length, total);
    }
    photosByPart.push(paths);
  }

  const { data, error } = await supabase.rpc(mode === "submit" ? "submit_visit_review" : "edit_visit_review", {
    p_appointment_id: draft.appointmentId,
    p_services: draft.services.map((s, i) => ({ position: s.position, rating: s.rating, text: s.text, photos: photosByPart[i] })),
    p_staff_rating: draft.staff?.rating ?? null,
    p_staff_text: draft.staff?.text ?? null,
    p_branch_rating: draft.branch?.rating ?? null,
    p_branch_text: draft.branch?.text ?? null,
  });
  if (error) {
    if (uploaded.length) await bucket.remove(uploaded);
    return { error: null, code: error.message?.trim() ?? "" };
  }
  const unused = (mode === "edit" ? (data as string[] | null) : null) ?? [];
  if (unused.length) await bucket.remove(unused);
  return { error: null, code: null };
}
```
Callers turn `code` into text with `reviewErrorMessage({ message: code })`.

`getVisitReviews`: select `id, appointment_id, target_type, service_position, rating, text, status, first_submitted_at, edited_at, review_photos(storage_path, position)` for `client_id = clientId` and `appointment_id` not null; group by appointment; service parts sorted by `service_position`, photos sorted by `position`; sign all photo paths in one `supabase.storage.from("review-photos").createSignedUrls(paths, 3600)` call (own-folder select policy allows it) and map path → `signedUrl`; `firstSubmittedAt` = min over the appointment's rows; `editedAt` = max. Log errors with `logQueryError("getVisitReviews", error)` and return `{}` on error.

In `myGlow.ts`: remove the moved exports; in `getRecentAppointments` add `booked:appointment_services(position, service_id, service_name)` and `service_id` to the select and map `bookedServices` as described in Interfaces; in `getMyReviews` add `appointment_id, edited_at, review_photos(storage_path, position)` and sign the photo paths the same way (`MyReview.photos` = signed URLs in position order). Update every import of the moved names (`grep -rn "getVisitReviews\|submitVisitReview\|VisitReview\|ReviewPart" src`).

- [ ] **Step 4: Keep the build green** — run the test file (PASS). `MyServicesList.tsx` still uses the removed names; make the smallest change that compiles (Task 6 rewrites this file): import from `@/lib/supabase/queries/visitReviews`, make the old form's submit call `saveVisitReview(createClient(), clientId, { appointmentId: appointment.id, services: appointment.bookedServices.map((s) => ({ position: s.position, rating: service.rating, text: service.text, keep: [], add: [] })), staff: …, branch: … }, "submit")` and map `code` through `reviewErrorMessage`, and render `review.services[0]` where it rendered `review.service`.

- [ ] **Step 5: Verify & commit** — `npx tsc --noEmit`, `npm test`, eslint on changed files; `feat: client review data layer with photo upload and edits`.

---

### Task 6: Review form modal, My Services buttons, My Reviews, deep link

**Files:**
- Create: `src/components/reviews/StarInput.tsx`, `src/components/reviews/ReviewPhotoPicker.tsx`, `src/components/reviews/VisitReviewModal.tsx`
- Modify: `src/components/my-glow/MyServicesList.tsx`, `src/components/my-glow/ReviewsPanel.tsx`, `src/app/my-glow/page.tsx`

**Interfaces:**
- Consumes: Task 5 (`VisitReview`, `saveVisitReview`, `RecentAppointment.bookedServices`, `MyReview`), Task 3 (`canEditReview`, `validateReviewPhoto`, `resizeToJpeg`, `MAX_REVIEW_PHOTOS`, `reviewErrorMessage`).
- Produces: `<VisitReviewModal appointment clientId existing={VisitReview | undefined} mode="submit" | "edit" | "view" onClose onSaved />`; `MyServicesList` prop `openReviewId?: string`.

- [ ] **Step 1: `StarInput`** — 5 buttons (`aria-label="N stars"`, `aria-pressed`), filled `fill-gold text-gold`, label under it from `["Poor", "Fair", "Good", "Very good", "Excellent"][value - 1]`; read-only when no `onChange`.

- [ ] **Step 2: `ReviewPhotoPicker`** — props `{ existing: { path: string; url: string }[]; added: { blob: Blob; preview: string }[]; onRemoveExisting(path); onAdd(files: File[]); onRemoveAdded(index); error: string | null; disabled }`. Hidden `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>` behind a dashed "+ Add Photos" tile (hidden when `existing.length + added.length >= MAX_REVIEW_PHOTOS`); thumbnails 64×64 rounded-xl `object-cover` with an ✕ button (`aria-label="Remove photo"`). The parent validates each file with `validateReviewPhoto`, skips invalid ones with the message, resizes valid ones with `resizeToJpeg`, creates previews with `URL.createObjectURL(blob)` and revokes them on remove/unmount/close (keep a ref of live URLs like `ProfileEditor.tsx` does).

- [ ] **Step 3: `VisitReviewModal`** — fixed overlay (`fixed inset-0 z-50 bg-ink/40`), white panel `max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg`, full-width sheet on mobile. Content in order:
  - Header: services joined with " + ", therapist, branch, `formatAppointmentDate`, a "Verified Service" pill (`BadgeCheck` icon, green).
  - One block per `appointment.bookedServices`: title "How was your {name}?", `StarInput`, textarea (`maxLength={1000}`, placeholder "Tell us about your service experience…"), `ReviewPhotoPicker`.
  - "Your therapist — {professionalName}" block (only when `professionalName`) and "The branch — {branchName} (optional)" block (only when `branchId`), stars + textarea each.
  - Footer: Cancel + "Submit Review" (edit mode: "Save Changes"); disabled until every service block has stars, or while saving; while saving show "Uploading photos {done}/{total}…" then "Saving…".
  - On success show "Thank you for your review!" / "Your review has been added to GlowSync." (edit: "Your review was updated.") with a Close button; call `onSaved()`.
  - Errors: `error` from `saveVisitReview` or `reviewErrorMessage({ message: code })` in a `role="alert"` box; the form keeps all values; a `REVIEW_DUPLICATE` code calls `onSaved()` too (refreshes to "Reviewed").
  - Edit mode: prefill ratings/texts/existing photos from `existing`; staff/branch ratings that exist cannot be cleared (stars required); note under the title "Edited reviews show an \"Edited\" label."
  - View mode: all inputs read-only, photos clickable to open full-size in a new tab, "Edited · date" when `editedAt`; per-part status "Hidden by GlowSync" when not public.
  - Escape and backdrop click close (not while saving); focus the first star on open.

- [ ] **Step 4: `MyServicesList`** — replace the inline form with the modal. For completed visits:
  - no review → button "⭐ Rate & Review" (`Star` icon) opens modal `mode="submit"`;
  - reviewed → average of service stars (read-only `StarInput` small) + "Reviewed ✓" + "View My Review" (`mode="view"`) + "Edit Review" when `canEditReview(existing.firstSubmittedAt, allStatuses(existing))` (`mode="edit"`);
  - any part hidden/removed → "Part of this review was hidden by GlowSync".
  - New prop `openReviewId`: on mount, if an appointment with that id is in the list and completed, open the modal (submit or view mode as appropriate) and `document.getElementById("services")?.scrollIntoView()`. The existing Realtime subscription now calls `getVisitReviews` from `visitReviews.ts`.

- [ ] **Step 5: `my-glow/page.tsx`** — accept `searchParams: Promise<{ review?: string }>`; pass `openReviewId={typeof review === "string" ? review : undefined}` to `MyServicesList`. Read `node_modules/next/dist/docs/` for the page `searchParams` prop in this version before editing.

- [ ] **Step 6: `ReviewsPanel` (My Reviews)** — each item: target name, read-only stars, excerpt (2 lines, `line-clamp-2`), up to 5 photo thumbnails (`next/image` with `unoptimized`, 48×48), date, "· Edited" when `editedAt`, and "View Review" linking to `/my-glow?review={appointmentId}#services` (omit when `appointmentId` is null).

- [ ] **Step 7: Verify & commit** — `npx tsc --noEmit`, eslint changed files, `npm test`; `feat: review form with photos, edit window and My Glow review states`.

---

### Task 7: Public service pages, stars on service cards, Load More, reports

**Files:**
- Create: `src/lib/supabase/queries/serviceReviews.ts`, `src/lib/supabase/reviewPhotoUrls.ts`
- Test: `src/lib/supabase/queries/serviceReviews.test.ts`
- Create: `src/app/services/[id]/page.tsx`, `src/app/api/reviews/service/[id]/route.ts`
- Create: `src/components/reviews/ServiceReviewsSection.tsx` (client), `src/components/reviews/PhotoLightbox.tsx`, `src/components/reviews/ReportReviewButton.tsx`, `src/components/services/ServiceBookButton.tsx`
- Modify: `src/app/services/page.tsx`, `src/components/services/ServiceCatalog.tsx`, `next.config.ts`

**Interfaces:**
- Consumes: view `public_service_reviews`, `review_photos` RLS, RPC `report_review`, Task 3 helpers.
- Produces:
```ts
// serviceReviews.ts
export const REVIEWS_PAGE = 10;
export type PublicServiceReview = { id: string; rating: number; text: string | null; createdAt: string; editedAt: string | null; reviewer: string; staffId: string | null; staffName: string | null; serviceDate: string | null; photos: string[] };
export async function getPublicService(supabase: SupabaseClient, id: string): Promise<DbService | null>; // One Cecilia Center, Active, uuid-checked
export async function getServiceRatingSummary(supabase: SupabaseClient, serviceId: string): Promise<ReturnType<typeof summarizeRatings>>;
export async function getServiceRatings(supabase: SupabaseClient, ids: string[]): Promise<Record<string, { average: number; count: number }>>;
export async function getServiceReviewPage(supabase: SupabaseClient, sign: (paths: string[]) => Promise<Map<string, string>>, serviceId: string, filter: StarFilter, offset: number): Promise<{ reviews: PublicServiceReview[]; hasMore: boolean }>;
export async function getServicePhotoStrip(supabase: SupabaseClient, sign: …, serviceId: string, limit?: number): Promise<{ url: string; reviewId: string }[]>;
export async function getUnreviewedVisitForService(supabase: SupabaseClient, clientId: string, serviceId: string): Promise<string | null>;
// reviewPhotoUrls.ts (server only)
export async function signReviewPhotos(paths: string[]): Promise<Map<string, string>>;
```

- [ ] **Step 1: Failing test for `getServiceReviewPage`** with a fake query builder that records calls: the `photos` filter adds `.gt("photo_count", 0)`; a star filter adds `.eq("rating", n)`; it requests `range(offset, offset + REVIEWS_PAGE)` (one extra row) and returns `hasMore = true` only when 11 rows come back (trimming to 10); photo paths are fetched from `review_photos` with `.in("review_id", ids)` and only those paths are passed to `sign`. Write the fake so each chain method returns the builder and the awaited result is `{ data, error: null }`.

- [ ] **Step 2: Implement** `serviceReviews.ts` (select from `public_service_reviews` ordered `created_at desc`; photos from `review_photos` `select("review_id, storage_path, position").in("review_id", ids).order("position")` — RLS already hides hidden/removed; ratings from `public_service_reviews` `select("service_id, rating")` then `summarizeRatings`; `getPublicService` reads `branches` by name `One Cecilia Center` then `branch_services` with the same column list as `src/app/services/page.tsx` plus `.eq("id", id).eq("status", "Active")`; `getUnreviewedVisitForService` selects the client's appointments with `appointment_services!inner(service_id)` equal to `serviceId`, completed per `status = completed` or `session_status in (completed, paid)`, then excludes ids that have any `reviews` row; all errors via `logQueryError`). `reviewPhotoUrls.ts`: `createAdminClient().storage.from("review-photos").createSignedUrls(paths, 3600)` → `Map(path → signedUrl)`; empty input → empty map.

- [ ] **Step 3: API route** `GET /api/reviews/service/[id]?filter=&offset=` → validates uuid + `parseStarFilter` + non-negative integer offset (max 1000), returns `{ reviews, hasMore }` from `getServiceReviewPage(await createClient(), signReviewPhotos, …)`; 400 on bad input. Route `params` is a Promise in this Next version.

- [ ] **Step 4: Page `/services/[id]`** (server, `dynamic = "force-dynamic"`): `notFound()` unless `getPublicService` returns a row. Layout (match the user's mockup, GlowSync colours): back link "← Back to Services"; hero card with `getServiceImage(name)` image, name, stars + "4.8 (126 Reviews)" or "No reviews yet", duration (`Clock`), category (`Tag`), description, price `₱{price.toLocaleString()}` and `<ServiceBookButton service={…} />` (client component calling `useBooking().open({ name, duration, price })` exactly like `ServiceCatalog.tsx:194`); "Customer Reviews" card with big average, "Based on N reviews", 5→1 bars (reuse the markup from `src/app/team/[id]/page.tsx:61-76`); "You've booked this service before" box (only when signed in and `getUnreviewedVisitForService` returns an id) with a "Write a Review" link to `/my-glow?review={id}`; "Photos from Clients" strip (hidden when empty) opening `PhotoLightbox`; `<ServiceReviewsSection serviceId initial={firstPage} />`.

- [ ] **Step 5: `ServiceReviewsSection`** (client): filter pills All · 5★ · 4★ · 3★ · 2★ · 1★ · With Photos (`aria-pressed`); changing filter refetches page 0 from the API; review cards: reviewer, stars, "Verified Service" pill, date (`toLocaleDateString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium" })`), "· Edited", text, photo thumbnails (`next/image unoptimized`, click → `PhotoLightbox`), "{staffName}" linking to `/team/{staffId}`, and a `⋯` menu with `ReportReviewButton`; "Load More Reviews" appends the next page; empty state "No reviews yet." / "No reviews match this filter."

- [ ] **Step 6: `PhotoLightbox`** — full-screen overlay with the image (`object-contain`), ← → buttons and arrow keys, Escape/✕ closes, counter "2 / 7", optional "View review" button that scrolls to `#review-{id}`.

- [ ] **Step 7: `ReportReviewButton`** — uses `useCurrentUser()`; signed out → link "Sign in to report" to `loginRedirectPath(current path)`; signed in → modal with `REPORT_REASONS` radios, optional note (`maxLength={500}`), "Send Report" → `supabase.rpc("report_review", { p_review_id, p_reason, p_note })`; success text "Thanks — our team will check it."; errors via `reviewErrorMessage` (duplicate → "You already reported this review."). Public data doesn't say who wrote a review, so the button also shows on the viewer's own review; the RPC then returns `REVIEW_NOT_ALLOWED`, which this component (only) shows as "You can't report this review."

- [ ] **Step 8: Services list** — `src/app/services/page.tsx` fetches `getServiceRatings(supabase, services.map((s) => s.id))` and passes `ratings` to `ServiceCatalog`; each card shows `★ 4.8 (126)` (small, `text-gold`) or "No reviews yet" under the name, and the name becomes `<Link href={`/services/${svc.id}`}>`. Book Now unchanged.

- [ ] **Step 9: `next.config.ts`** — add a second `remotePatterns` entry for the same host with `pathname: "/storage/v1/object/sign/**"` (signed URLs; images still use `unoptimized`).

- [ ] **Step 10: Verify & commit** — tests, tsc, eslint, `npm run build`; `feat: public service pages with reviews, photos, filters and reports`.

---

### Task 8: Therapist page — summary, service + date per review, Load More, report

**Files:**
- Modify: `src/lib/supabase/queries/staffProfiles.ts`, `src/app/team/[id]/page.tsx`
- Create: `src/components/reviews/StaffReviewList.tsx` (client)

**Interfaces:**
- Consumes: `public_staff_reviews` new columns (Task 2), `ReportReviewButton` (Task 7).

- [ ] **Step 1:** `getPublicStaffProfile` also selects `service_name, service_date, edited_at` and maps `serviceName`, `serviceDate`, `editedAt`.
- [ ] **Step 2:** Page keeps the summary and breakdown; the "Client reviews" list moves into `StaffReviewList` which shows 10 at a time with "Load More Reviews", and each card adds "{serviceName} · {serviceDate formatted}" (omit missing parts), "Verified Service" pill, "· Edited", and `ReportReviewButton`. No photos on this page.
- [ ] **Step 3: Verify & commit** — tsc, eslint, tests; `feat: therapist reviews show service, date, load more and report`.

---

### Task 9: Admin — Flagged queue, photos, reports, Keep, photo purge

**Files:**
- Modify: `src/lib/supabase/queries/adminReviews.ts`, `src/components/admin/reviews/ReviewsManager.tsx`, `src/components/admin/reviews/ReviewDetailPanel.tsx`, `src/components/admin/dashboard/NewReviewsCard.tsx` (and its query in `src/lib/supabase/queries/adminDashboard.ts` if the count lives there)
- Create: `src/app/api/admin/review-photos/purge/route.ts`

**Interfaces:**
- Consumes: `moderate_review` `keep` action, `review_reports`, `review_photos`, storage policy "staff read review photos".
- Produces: `ReviewFilters.photos?: boolean` (URL `photos=1`), `AdminReviewRow.photoCount`, `AdminReviewRow.reportCount`, `getAdminReviewStats().flaggedCount`, `AdminReviewDetail.photos: string[]` (signed URLs), `AdminReviewDetail.reports: { id; reason; note; reporterName; createdAt }[]`, `moderateReview(…, action: "hide" | "show" | "remove" | "restore" | "keep", …)`.

- [ ] **Step 1: Failing test** `src/lib/supabase/queries/adminReviews.test.ts` for `parseReviewFilters`: `status=flagged` is accepted; `photos=1` → `photos: true`; `photos=yes` → `undefined`.
- [ ] **Step 2: Queries** — add `"flagged"` to `STATUSES`; `photos` filter switches the select to include `review_photos!inner(id)`; list select adds `review_photos(count), review_reports(count)` and maps counts; stats add a `flagged` head count; detail fetches `review_photos` (sign with the browser client: `createSignedUrls(paths, 3600)`) and `review_reports` (`reason, note, created_at, reporter:profiles!review_reports_reporter_id_fkey(full_name)`), newest first; `moderateReview` accepts `keep`.
- [ ] **Step 3: Purge route** `POST /api/admin/review-photos/purge` body `{ reviewId }`: server `createClient()` → user must have role `admin` (same check as `src/app/api/admin/restrict-user/route.ts`); with `createAdminClient()`: confirm the review's status is `removed`, read its `review_photos.storage_path`s, `storage.from("review-photos").remove(paths)`, then delete those `review_photos` rows; return `{ removed: n }`; 403/404/400 as appropriate.
- [ ] **Step 4: UI** — `ReviewsManager`: status tabs All · Flagged (count, amber) · Visible · Hidden · Removed (replace the stat buttons' status filters accordingly; keep existing filters), a "With photos" checkbox, row badges "📷 n" and "⚑ n reports"; `STATUS_STYLE.flagged = "bg-amber-100 text-amber-700"`. `ReviewDetailPanel`: photo grid (click → `PhotoLightbox` from Task 7), "Reports" list (reason label from `REPORT_REASONS`, note, reporter, time), and actions: flagged → **Keep** (no reason) + **Hide** + **Remove**; visible → Hide + Remove; hidden → Show + Remove; removed → Restore. After a successful Remove, `fetch("/api/admin/review-photos/purge", { method: "POST", body: JSON.stringify({ reviewId }) })` and log (don't block) on failure. `NewReviewsCard`: include flagged count ("n flagged") linking to `/admin/reviews?status=flagged`.
- [ ] **Step 5: Verify & commit** — tests, tsc, eslint, build; `feat: admin flagged review queue with photos, reports and keep`.

---

### Task 10: Messenger review request + bell kind

**Files:**
- Modify: `src/lib/messenger/templates.ts`, `src/lib/messenger/messages.ts`, `src/lib/messenger/dispatchRules.ts`, `src/app/api/messenger/dispatch/route.ts`, `scripts/messenger-setup.ts` (only if it needs changes for per-template buttons), `src/lib/supabase/queries/clientNotifications.ts`, `src/components/notifications/ClientNotificationBell.tsx`
- Test: `src/lib/messenger/messages.test.ts`, `src/lib/messenger/dispatchRules.test.ts`, `src/lib/messenger/templates.test.ts` (create if missing)

**Interfaces:**
- Consumes: outbox kind `review_request` with `appointment_id`, link `/my-glow?review=<id>`.
- Produces: `AppointmentTemplateKind` includes `"review_request"`; `OutboxKind` includes `"review_request"`; `SkipContext.alreadyReviewed?: boolean` → reason `"already_reviewed"`.

- [ ] **Step 1: Failing tests**
  - templates: `templateCreatePayload("review_request", "https://x.test")` has body text `"Hi {{1}}, your {{2}} at {{3}} is complete. Tap below to rate your visit."`, button text `"Rate your visit"`, URL `https://x.test/my-glow?review={{1}}`; existing kinds still use `"View appointment"` and `/my-glow/appointments/{{1}}`.
  - messages: `appointmentTemplateParams("review_request", data)` returns exactly `[firstName, serviceName, branchName]`.
  - dispatchRules: `skipReason({ kind: "review_request", …, appointment: {…}, alreadyReviewed: true })` → `"already_reviewed"`; no 24 h window check for it; missing appointment → `"appointment_missing"`.
- [ ] **Step 2: Implement** — templates: add `review_request` to `APPOINTMENT_TEMPLATES` with name `glowsync_visit_review`, body above, example `["Ana", "Signature Facial", "One Cecilia Center"]`, and optional `button?: { text: string; path: string }` (`{ text: "Rate your visit", path: "/my-glow?review=" }`); `templateCreatePayload` uses `t.button?.text ?? APPOINTMENT_BUTTON_TEXT` and `${base}${t.button?.path ?? "/my-glow/appointments/"}{{1}}` (and the matching `url_suffix_example`). messages: `review_request` → first three `common` params. dispatchRules: add the kind, `alreadyReviewed` check (after subscription checks), require appointment. Dispatcher: for `review_request` rows query `reviews` (`select id … eq appointment_id … limit 1`) to set `alreadyReviewed`, build `buildAppointmentTemplateMessage(sub.psid, "review_request", …)` with `serviceName` from `appointment_services` names (add `booked:appointment_services(service_name, position)` to `APPOINTMENT_SELECT`, join by ", " in position order, falling back to the existing service/notes value); `templateKind(row)` returns `"review_request"` for that kind. `scripts/messenger-setup.ts` already loops over `APPOINTMENT_TEMPLATES`, so it creates the new template automatically — confirm and leave it unchanged if so.
  - Bell: `clientNotifications.ts` kind union adds `"review_request"`; `ClientNotificationBell` shows a `Star` icon (gold) for that kind; navigation already uses `link_path`.
- [ ] **Step 3: Verify & commit** — tests, tsc, eslint; `feat: review request via Messenger template and bell`.

---

### Task 11: Final checks

- [ ] `npm test && npx tsc --noEmit -p . && npm run lint && npm run build` — all tests pass, lint at 31 errors / 34 warnings, build OK.
- [ ] `grep -rn "dangerouslySetInnerHTML" src` — none added for review text.
- [ ] `grep -rn "console.error(.*error)" src/lib/supabase/queries/visitReviews.ts src/lib/supabase/queries/serviceReviews.ts` — none (use `logQueryError`).
- [ ] Deferred manual (after the user applies 048 → 049 → 051 and runs `node --env-file=.env.local scripts/messenger-setup.ts`): phone-width submit of a two-service visit with photos; edit (remove + add photo); report from another client → Admin Flagged → Keep / Hide; service page filters, Load More, lightbox; therapist page; bell "How was your GlowSync experience?" on completing a booking; booking form stores services; `051` check script all PASS.
