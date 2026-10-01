-- 055_admin_frontdesk_access.sql
-- The Front Desk write policies (028, 035) only allow role 'front_desk' at
-- the same branch, so an Admin using the Front Desk screens could view but
-- not record payments, staff punches/breaks or walk-ins ("new row violates
-- row-level security policy"). Admin may now do everything Front Desk can,
-- at any branch.

drop policy if exists "admin manage appointments" on appointments;
create policy "admin manage appointments" on appointments for all
  using (coalesce(public.current_user_role()::text, '') = 'admin')
  with check (coalesce(public.current_user_role()::text, '') = 'admin');

drop policy if exists "admin manage payments" on payments;
create policy "admin manage payments" on payments for all
  using (coalesce(public.current_user_role()::text, '') = 'admin')
  with check (coalesce(public.current_user_role()::text, '') = 'admin');

drop policy if exists "admin manage staff_attendance" on staff_attendance;
create policy "admin manage staff_attendance" on staff_attendance for all
  using (coalesce(public.current_user_role()::text, '') = 'admin')
  with check (coalesce(public.current_user_role()::text, '') = 'admin');

drop policy if exists "admin manage staff_attendance_breaks" on staff_attendance_breaks;
create policy "admin manage staff_attendance_breaks" on staff_attendance_breaks for all
  using (coalesce(public.current_user_role()::text, '') = 'admin')
  with check (coalesce(public.current_user_role()::text, '') = 'admin');
