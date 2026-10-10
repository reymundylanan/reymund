-- 074_service_media.sql
-- Photos and videos of each service, uploaded by Admin in Branches &
-- Services, for clients to view on the Services page. Files live in a public
-- bucket; YouTube links can be added instead of uploading a big video.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-media', 'service-media', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins upload service media" on storage.objects;
create policy "admins upload service media" on storage.objects for insert to authenticated
  with check (bucket_id = 'service-media' and coalesce(public.current_user_role()::text, '') = 'admin');

drop policy if exists "admins delete service media" on storage.objects;
create policy "admins delete service media" on storage.objects for delete to authenticated
  using (bucket_id = 'service-media' and coalesce(public.current_user_role()::text, '') = 'admin');

create table if not exists service_media (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references branch_services(id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'youtube')),
  -- Uploaded files: their path in the service-media bucket. YouTube: the video id.
  storage_path text,
  youtube_id text,
  caption text check (caption is null or char_length(caption) <= 140),
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (
    (kind = 'youtube' and youtube_id is not null and storage_path is null)
    or (kind in ('image', 'video') and storage_path is not null and youtube_id is null)
  )
);

create index if not exists service_media_service_idx on service_media (service_id, position);

alter table service_media enable row level security;

drop policy if exists "anyone reads service media" on service_media;
create policy "anyone reads service media" on service_media for select using (true);

drop policy if exists "admins manage service media" on service_media;
create policy "admins manage service media" on service_media for all to authenticated
  using (coalesce(public.current_user_role()::text, '') = 'admin')
  with check (coalesce(public.current_user_role()::text, '') = 'admin');

grant select on service_media to anon, authenticated;
grant insert, update, delete on service_media to authenticated;

notify pgrst, 'reload schema';
