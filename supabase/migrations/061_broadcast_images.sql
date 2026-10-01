-- 061_broadcast_images.sql
-- Admin → Notifications: a broadcast can include one image (shown in the
-- email). Images live in a public bucket so email clients can load them.

alter table notification_broadcasts add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('broadcast-images', 'broadcast-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin manage broadcast images" on storage.objects;
create policy "admin manage broadcast images" on storage.objects for all to authenticated
  using (bucket_id = 'broadcast-images' and coalesce(public.current_user_role()::text, '') = 'admin')
  with check (bucket_id = 'broadcast-images' and coalesce(public.current_user_role()::text, '') = 'admin');

notify pgrst, 'reload schema';
