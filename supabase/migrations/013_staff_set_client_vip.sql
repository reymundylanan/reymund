-- 013_staff_set_client_vip.sql
-- Lets front_desk/admin staff toggle a customer's VIP flag without
-- granting broad update access to the rest of their profile row.

create or replace function set_client_vip(target_id uuid, is_vip boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from profiles
    where id = auth.uid() and role in ('front_desk', 'admin')
  ) then
    raise exception 'Not authorized';
  end if;

  update profiles set vip = is_vip where id = target_id and role = 'customer';
end;
$$;

grant execute on function set_client_vip(uuid, boolean) to authenticated;
