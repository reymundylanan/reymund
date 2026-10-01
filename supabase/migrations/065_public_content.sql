-- 065_public_content.sql
-- 1) Promotions: 008 let ANY signed-in user (clients too) insert, change or
--    delete promotions, and logged-out visitors couldn't read them. Now
--    everyone can read active promotions; only Admin manages them.
-- 2) The gold announcement bar at the top of the site is editable by
--    Admin (Admin → Notifications → Website Announcement).

drop policy if exists "Admin full access promotions" on branch_promotions;

drop policy if exists "everyone read active promotions" on branch_promotions;
create policy "everyone read active promotions" on branch_promotions for select
  using (is_active or coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk'));

drop policy if exists "admin manage promotions" on branch_promotions;
create policy "admin manage promotions" on branch_promotions for all
  using (coalesce(public.current_user_role()::text, '') = 'admin')
  with check (coalesce(public.current_user_role()::text, '') = 'admin');

grant select on branch_promotions to anon, authenticated;

alter table spa_settings add column if not exists announcement_enabled boolean not null default true;
alter table spa_settings add column if not exists announcement_text text
  default 'Exclusive Mother''s Day Special: Get 20% off all Floral Therapy sessions.';
alter table spa_settings add column if not exists announcement_link text default '/#promotions';
alter table spa_settings add column if not exists announcement_link_label text default 'Learn More';

notify pgrst, 'reload schema';
