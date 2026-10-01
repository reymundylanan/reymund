-- 058_client_visit_stats.sql
-- Requires 054 (visit_type) and 055. Front Desk → Clients showed ₱0 spend,
-- 0 visits and no last visit: profiles.total_spend is never updated, and
-- visits were only counted when appointments.status = 'completed' (finished
-- visits are recorded in session_status). Front Desk can only read its own
-- branch's appointments and payments, so the totals across all branches
-- come from this function instead.
--
-- A visit counts when it was completed (status 'completed' or session
-- 'completed'/'paid'), including walk-ins linked to the account (054).
-- Spend = settled payments on the client's visits (refunded/pending/failed
-- are left out).

create or replace function client_visit_stats(p_client_ids uuid[] default null)
returns table (
  client_id uuid,
  total_spend numeric,
  total_visits integer,
  visits_this_year integer,
  last_visit date
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_year_start date := date_trunc('year', (now() at time zone 'Asia/Manila'))::date;
begin
  if coalesce(public.current_user_role()::text, '') not in ('admin', 'front_desk') then
    raise exception 'CLIENT_STATS_FORBIDDEN';
  end if;

  return query
  with visits as (
    select a.id, a.client_id, a.scheduled_date
      from appointments a
     where a.client_id is not null
       and (p_client_ids is null or a.client_id = any(p_client_ids))
       and a.status::text <> 'cancelled'
       and (a.status::text = 'completed' or coalesce(a.session_status, '') in ('completed', 'paid'))
  ),
  spend as (
    select a.client_id, sum(p.amount)::numeric as amount
      from payments p
      join appointments a on a.id = p.appointment_id
     where p.status = 'settled'
       and a.client_id is not null
       and (p_client_ids is null or a.client_id = any(p_client_ids))
     group by a.client_id
  ),
  visit_totals as (
    select v.client_id,
           count(*)::integer as total_visits,
           count(*) filter (where v.scheduled_date >= v_year_start)::integer as visits_this_year,
           max(v.scheduled_date) as last_visit
      from visits v
     group by v.client_id
  )
  select coalesce(vt.client_id, s.client_id),
         coalesce(s.amount, 0),
         coalesce(vt.total_visits, 0),
         coalesce(vt.visits_this_year, 0),
         vt.last_visit
    from visit_totals vt
    full join spend s on s.client_id = vt.client_id;
end;
$$;

revoke execute on function client_visit_stats(uuid[]) from public, anon;
grant execute on function client_visit_stats(uuid[]) to authenticated;

notify pgrst, 'reload schema';
