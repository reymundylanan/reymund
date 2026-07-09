-- Allow specialist role to log in via username lookup.
-- Previously get_email_for_username only matched 'admin' and 'front_desk'.

create or replace function get_email_for_username(p_username text)
returns text
language sql
security definer
stable
as $$
  select email from profiles
  where username = p_username
    and role in ('admin', 'front_desk', 'specialist')
  limit 1;
$$;

revoke all on function get_email_for_username(text) from public;
grant execute on function get_email_for_username(text) to anon, authenticated;
