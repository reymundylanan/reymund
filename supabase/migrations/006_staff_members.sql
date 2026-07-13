create table if not exists staff_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  department text not null,
  branch_id uuid references branches(id) on delete set null,
  phone text,
  avatar_url text,
  created_at timestamptz default now()
);

alter table staff_members enable row level security;

create policy "Admins manage staff_members"
  on staff_members for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
