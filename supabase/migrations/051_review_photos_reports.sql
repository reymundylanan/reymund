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

-- Used by the client insert policy (a policy cannot query its own table).
create or replace function appointment_services_empty(p_appointment_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (select 1 from appointment_services where appointment_id = p_appointment_id)
$$;

revoke execute on function appointment_services_empty(uuid) from public, anon;
grant execute on function appointment_services_empty(uuid) to authenticated;

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
  and public.appointment_services_empty(appointment_services.appointment_id)
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
       m.id,
       coalesce(left(m.name, 200), left(btrim(t.name), 200))
  from appointments a
 cross join lateral unnest(string_to_array(split_part(coalesce(a.notes, ''), ' with ', 1), ', '))
       with ordinality as t(name, ord)
  left join lateral (
    select s.id, s.name from branch_services s
     where s.branch_id = a.branch_id and lower(btrim(s.name)) = lower(btrim(t.name))
     order by s.id limit 1
  ) m on true
 where a.service_id is null
   and a.notes like '% with % — ₱%'
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

update reviews r set service_id = x.service_id
  from appointment_services x
 where r.target_type = 'service' and r.service_id is null
   and x.appointment_id = r.appointment_id
   and x.position = coalesce(r.service_position, 0)
   and x.service_id is not null;

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

  -- Cleared up front so a photo can move between parts without a duplicate-path error.
  delete from review_photos
   where review_id in (select id from reviews where appointment_id = p_appointment_id and target_type = 'service');

  for v_part in select * from review_service_parts(v_uid, p_appointment_id, p_services) loop
    v_review_id := null;
    update reviews set rating = v_part.stars, text = v_part.body, service_id = v_part.svc_id, edited_at = now()
     where appointment_id = p_appointment_id and target_type = 'service' and service_position = v_part.pos
     returning id into v_review_id;
    if v_review_id is null then
      insert into reviews (client_id, appointment_id, target_type, rating, text, service_id, service_position,
                           branch_id, status, first_submitted_at, edited_at)
      values (v_uid, p_appointment_id, 'service', v_part.stars, v_part.body, v_part.svc_id, v_part.pos,
              v_appt.branch_id, 'visible', v_first, now())
      returning id into v_review_id;
    end if;
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
