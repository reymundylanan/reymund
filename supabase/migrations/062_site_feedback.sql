-- 062_site_feedback.sql
-- Footer → "Submit Feedback": anyone (signed in or not) can send feedback;
-- only Admin can read it (Admin → Notifications → Client Feedback).

create table if not exists site_feedback (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references profiles(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 80),
  email text check (email is null or (length(email) <= 120 and email like '%_@_%')),
  phone text check (phone is null or length(phone) <= 30),
  topic text not null default 'general' check (topic in ('general', 'service', 'booking', 'website', 'suggestion', 'complaint')),
  message text not null check (length(btrim(message)) between 5 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists site_feedback_created_idx on site_feedback (created_at desc);

alter table site_feedback enable row level security;

drop policy if exists "anyone send feedback" on site_feedback;
create policy "anyone send feedback" on site_feedback for insert to anon, authenticated
  with check (read_at is null and (client_id is null or client_id = auth.uid()));

drop policy if exists "admin read feedback" on site_feedback;
create policy "admin read feedback" on site_feedback for select
  using (coalesce(public.current_user_role()::text, '') = 'admin');

drop policy if exists "admin update feedback" on site_feedback;
create policy "admin update feedback" on site_feedback for update
  using (coalesce(public.current_user_role()::text, '') = 'admin')
  with check (coalesce(public.current_user_role()::text, '') = 'admin');

grant insert on site_feedback to anon, authenticated;
grant select, update on site_feedback to authenticated;

notify pgrst, 'reload schema';
