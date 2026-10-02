-- 066_login_consent.sql
-- The login window now requires agreeing to the Terms of Service and
-- Privacy Policy, with an optional "exclusive offers" opt-in. This records
-- both on the signed-in user's profile so promos can go only to clients
-- who opted in.

alter table profiles add column if not exists terms_accepted_at timestamptz;
alter table profiles add column if not exists marketing_opt_in boolean not null default false;
alter table profiles add column if not exists marketing_opt_in_at timestamptz;

-- Called right after a login. Ticking "offers" opts in; leaving it unticked
-- keeps an earlier opt-in (opting out is a separate, deliberate choice).
create or replace function record_login_consent(p_offers boolean default false) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'CONSENT_FORBIDDEN: not signed in';
  end if;
  update profiles
     set terms_accepted_at = now(),
         marketing_opt_in = marketing_opt_in or coalesce(p_offers, false),
         marketing_opt_in_at = case
           when coalesce(p_offers, false) and not marketing_opt_in then now()
           else marketing_opt_in_at
         end
   where id = auth.uid();
end;
$$;

revoke execute on function record_login_consent(boolean) from public, anon;
grant execute on function record_login_consent(boolean) to authenticated;

notify pgrst, 'reload schema';
