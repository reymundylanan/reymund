-- 084_branches_admin_only.sql
-- 009 let ANY signed-in user (clients too) add, edit or delete branches.
-- Only Admin manages branches (Branches & Services → Add New Branch / edit).
-- Everyone can still read them (the website lists branches).

drop policy if exists "Admin insert branches" on branches;
drop policy if exists "Admin update branches" on branches;
drop policy if exists "Admin delete branches" on branches;

create policy "Admin insert branches" on branches
  for insert to authenticated
  with check (coalesce(public.current_user_role()::text, '') = 'admin');

create policy "Admin update branches" on branches
  for update to authenticated
  using (coalesce(public.current_user_role()::text, '') = 'admin')
  with check (coalesce(public.current_user_role()::text, '') = 'admin');

create policy "Admin delete branches" on branches
  for delete to authenticated
  using (coalesce(public.current_user_role()::text, '') = 'admin');

-- Branch names are how services, staff and promotions find their branch:
-- no two branches may share a name (ignoring case and spaces at the ends).
create unique index if not exists branches_name_unique on branches (lower(btrim(name)));
