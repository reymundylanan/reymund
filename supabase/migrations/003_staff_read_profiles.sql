-- Staff (admin/front_desk/specialist) need to read customer profile names
-- when viewing appointments — the default "users read own profile" policy
-- only allows auth.uid() = id. Using a SECURITY DEFINER function avoids the
-- infinite-recursion trap of a policy on `profiles` querying `profiles`
-- directly (same pattern as get_email_for_username in 002).

create or replace function public.current_user_role()
returns user_role
language sql
security definer
stable
as $$
  select role from profiles where id = auth.uid()
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to anon, authenticated;

drop policy if exists "staff read all profiles" on profiles;
create policy "staff read all profiles" on profiles for select
  using (public.current_user_role() in ('admin', 'front_desk', 'specialist'));
