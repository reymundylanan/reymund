-- 025_staff_shifts_allow_admin.sql
-- staff_shifts writes were restricted to front_desk only (016). Admin's
-- Leave and Transfer actions now also need to write staff_shifts
-- off-blocks directly, so admin is added back to the write policy.
drop policy if exists "staff manage staff_shifts" on staff_shifts;
create policy "staff manage staff_shifts" on staff_shifts for all
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('front_desk', 'admin'))
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('front_desk', 'admin'))
  );
