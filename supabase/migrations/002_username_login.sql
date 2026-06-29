-- Add username-based login support for staff (admin/front_desk).

alter table profiles add column if not exists username text unique;

create or replace function get_email_for_username(p_username text)
returns text
language sql
security definer
stable
as $$
  select email from profiles
  where username = p_username
    and role in ('admin', 'front_desk')
  limit 1;
$$;

revoke all on function get_email_for_username(text) from public;
grant execute on function get_email_for_username(text) to anon, authenticated;
