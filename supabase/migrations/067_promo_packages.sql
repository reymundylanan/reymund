-- 067_promo_packages.sql
-- Requires 008, 065. Promos become bookable packages: a promo lists the
-- existing branch services it includes (no duplicate service records), and
-- a booking made from a promo remembers which promo and the price it was
-- booked at, so later price or name changes never alter past bookings.

create table if not exists promotion_services (
  promotion_id uuid not null references branch_promotions(id) on delete cascade,
  service_id uuid not null references branch_services(id) on delete cascade,
  position smallint not null default 0,
  primary key (promotion_id, service_id)
);

create index if not exists promotion_services_service_idx on promotion_services (service_id);

alter table promotion_services enable row level security;

-- Anyone can see what an active promo includes; Admin manages the list.
drop policy if exists "read promo services" on promotion_services;
create policy "read promo services" on promotion_services for select
  using (
    exists (
      select 1 from branch_promotions p
       where p.id = promotion_id
         and (p.is_active or coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk'))
    )
  );

drop policy if exists "admin manage promo services" on promotion_services;
create policy "admin manage promo services" on promotion_services for all
  using (coalesce(public.current_user_role()::text, '') = 'admin')
  with check (coalesce(public.current_user_role()::text, '') = 'admin');

grant select on promotion_services to anon, authenticated;
grant insert, update, delete on promotion_services to authenticated;

-- The promo a booking came from, and the package price at booking time.
alter table appointments add column if not exists promotion_id uuid references branch_promotions(id) on delete set null;
alter table appointments add column if not exists promo_price numeric;
create index if not exists appointments_promotion_idx on appointments (promotion_id) where promotion_id is not null;

-- A promo booking must use an active promo, on a date inside its validity
-- window, at one of its real prices (short / medium / long for hair).
create or replace function check_promo_booking() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_promo branch_promotions%rowtype;
begin
  if new.promotion_id is null then
    return new;
  end if;
  -- Rescheduling keeps the original promo and price (checked when booked).
  if tg_op = 'UPDATE' and new.promotion_id is not distinct from old.promotion_id
     and new.promo_price is not distinct from old.promo_price then
    return new;
  end if;
  select * into v_promo from branch_promotions where id = new.promotion_id;
  if not found or not v_promo.is_active then
    raise exception 'PROMO_INVALID: this promo is no longer available';
  end if;
  if new.branch_id is distinct from v_promo.branch_id then
    raise exception 'PROMO_INVALID: this promo is for another branch';
  end if;
  if (v_promo.valid_from is not null and new.scheduled_date < v_promo.valid_from)
     or (v_promo.valid_until is not null and new.scheduled_date > v_promo.valid_until) then
    raise exception 'PROMO_INVALID: the date is outside the promo period';
  end if;
  if new.promo_price is null
     or new.promo_price not in (coalesce(v_promo.price, -1), coalesce(v_promo.price_medium, -1), coalesce(v_promo.price_long, -1)) then
    raise exception 'PROMO_INVALID: the promo price does not match';
  end if;
  return new;
end;
$$;

revoke execute on function check_promo_booking() from public, anon, authenticated;

drop trigger if exists appointments_check_promo on appointments;
create trigger appointments_check_promo
  before insert or update of promotion_id, promo_price on appointments
  for each row execute function check_promo_booking();

notify pgrst, 'reload schema';
