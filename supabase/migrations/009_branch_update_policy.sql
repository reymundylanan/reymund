-- Allow authenticated users to update branches (admin panel)
create policy "Admin update branches"
  on branches
  for update
  to authenticated
  using (true)
  with check (true);

-- Also allow insert/delete for completeness
create policy "Admin insert branches"
  on branches
  for insert
  to authenticated
  with check (true);

create policy "Admin delete branches"
  on branches
  for delete
  to authenticated
  using (true);
