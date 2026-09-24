-- 020_notification_broadcasts.sql
create table if not exists notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  message text not null,
  link_path text not null default '/?intent=booking',
  sent_by uuid not null references profiles(id) on delete cascade,
  recipient_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table notification_broadcasts enable row level security;

drop policy if exists "admin manage notification_broadcasts" on notification_broadcasts;
create policy "admin manage notification_broadcasts" on notification_broadcasts for all
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
