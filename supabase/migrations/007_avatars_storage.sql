-- Allow authenticated users to upload to avatars bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

create policy "Authenticated upload avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars');

create policy "Public read avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "Authenticated update avatars"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars');
