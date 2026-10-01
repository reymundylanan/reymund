-- 054_walkin_account_linking.sql
-- Walk-ins can be linked to an existing client account at registration,
-- so the visit lands in the client's history and becomes reviewable
-- (reviews, AI evaluation and GlowPoints then work as for bookings).
--   * appointments.visit_type tells walk-ins from bookings (before this,
--     "no client_id" meant walk-in, which breaks once walk-ins are linked)
--   * search_client_accounts(): Front Desk/Admin account search that only
--     returns what's needed to recognise a client (masked email/phone)
--   * link_walkin_client(): links a just-registered walk-in + audit row

-- ── Visit type ────────────────────────────────────────────────────────

alter table appointments add column if not exists visit_type text not null default 'appointment';
alter table appointments drop constraint if exists appointments_visit_type_check;
alter table appointments add constraint appointments_visit_type_check
  check (visit_type in ('appointment', 'walk_in'));

update appointments
   set visit_type = 'walk_in'
 where visit_type = 'appointment' and client_id is null and walkin_name is not null;

create index if not exists appointments_visit_type_idx on appointments (branch_id, scheduled_date, visit_type);

-- ── Audit ─────────────────────────────────────────────────────────────

create table if not exists walkin_account_links (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  linked_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists walkin_account_links_appt_idx on walkin_account_links (appointment_id);

alter table walkin_account_links enable row level security;
drop policy if exists "staff read walkin links" on walkin_account_links;
create policy "staff read walkin links" on walkin_account_links for select using (
  coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk')
);
revoke insert, update, delete on walkin_account_links from anon, authenticated;
grant select on walkin_account_links to authenticated;

-- ── Search (Front Desk / Admin) ───────────────────────────────────────

create or replace function mask_email(p_email text) returns text
language sql immutable as $$
  select case
    when p_email is null or position('@' in p_email) < 2 then null
    else left(p_email, 1) || '***@' || split_part(p_email, '@', 2)
  end
$$;

create or replace function search_client_accounts(p_query text)
returns table (
  id uuid, full_name text, email_masked text, phone_last4 text,
  provider text, avatar_url text, member_since timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  v_like text;
begin
  if coalesce(public.current_user_role()::text, '') not in ('admin', 'front_desk') then
    raise exception 'WALKIN_FORBIDDEN';
  end if;
  if length(v_q) < 2 then
    return;
  end if;
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select p.id,
         p.full_name,
         mask_email(p.email),
         case when p.phone is null then null else right(regexp_replace(p.phone, '\D', '', 'g'), 4) end,
         coalesce(
           (select case
                     when bool_or(i.provider = 'facebook') then 'facebook'
                     when bool_or(i.provider = 'google') then 'google'
                     else 'email' end
              from auth.identities i where i.user_id = p.id),
           'email'),
         p.avatar_url,
         p.created_at
    from profiles p
   where p.role::text = 'customer'
     and (p.full_name ilike v_like
          or (length(v_digits) >= 7
              and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = right(v_digits, 10)))
   order by (lower(p.full_name) = lower(v_q)) desc, p.full_name
   limit 8;
end;
$$;

revoke execute on function search_client_accounts(text) from public, anon;
grant execute on function search_client_accounts(text) to authenticated;

-- ── Link (Front Desk / Admin) ─────────────────────────────────────────

create or replace function link_walkin_client(p_appointment_id uuid, p_client_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_appt record;
  v_name text;
  v_phone text;
begin
  if coalesce(public.current_user_role()::text, '') not in ('admin', 'front_desk') then
    raise exception 'WALKIN_FORBIDDEN';
  end if;
  select id, client_id, visit_type, status::text as status into v_appt
    from appointments where id = p_appointment_id for update;
  if v_appt.id is null or v_appt.visit_type <> 'walk_in' or v_appt.client_id is not null
     or v_appt.status = 'cancelled' then
    raise exception 'WALKIN_INVALID';
  end if;
  select full_name, phone into v_name, v_phone from profiles where id = p_client_id and role::text = 'customer';
  if v_name is null then
    raise exception 'WALKIN_INVALID';
  end if;

  update appointments
     set client_id = p_client_id,
         walkin_name = v_name,
         walkin_phone = coalesce(nullif(btrim(coalesce(walkin_phone, '')), ''), v_phone)
   where id = p_appointment_id;

  insert into walkin_account_links (appointment_id, client_id, linked_by)
  values (p_appointment_id, p_client_id, auth.uid());
end;
$$;

revoke execute on function link_walkin_client(uuid, uuid) from public, anon;
grant execute on function link_walkin_client(uuid, uuid) to authenticated;
