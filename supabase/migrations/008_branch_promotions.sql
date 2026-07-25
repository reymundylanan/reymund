create table if not exists branch_promotions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  title text not null,
  department text,
  category text,
  price numeric,
  description text,
  badge text,
  discount_type text check (discount_type in ('percent', 'fixed', 'bogo', 'custom')),
  discount_value text,
  valid_from date,
  valid_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table branch_promotions enable row level security;

create policy "Admin full access promotions" on branch_promotions
  for all to authenticated using (true) with check (true);
