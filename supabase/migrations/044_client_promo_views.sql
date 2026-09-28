-- Tracks which promo popups a client has already dismissed/viewed on My
-- Glow, so the same promo is never shown to them again once seen.
create table if not exists client_promo_views (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  promo_id uuid not null references branch_promotions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (client_id, promo_id)
);

alter table client_promo_views enable row level security;

create policy "clients manage own promo views" on client_promo_views
  for all to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());
