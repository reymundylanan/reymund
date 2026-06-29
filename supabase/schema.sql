-- GlowSync database schema
-- Run in Supabase SQL Editor, or via `supabase db push` once linked.

create extension if not exists "pgcrypto";

-- ============ Enums ============
do $$ begin
  create type user_role as enum ('customer', 'front_desk', 'admin', 'specialist');
exception when duplicate_object then null; end $$;

do $$ begin
  create type appointment_status as enum (
    'pending', 'confirmed', 'checked_in', 'in_service',
    'completed', 'no_show', 'conflict', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type appointment_type as enum ('solo', 'group');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('gcash', 'cash', 'credit_card');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'settled', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type branch_status as enum ('active', 'maintenance', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type shift_status as enum ('working', 'break', 'off');
exception when duplicate_object then null; end $$;

-- ============ Branches ============
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  region text,
  phone text,
  email text,
  hours jsonb,
  lat double precision,
  lng double precision,
  status branch_status not null default 'active',
  created_at timestamptz not null default now()
);

-- ============ Profiles (extends auth.users) ============
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  role user_role not null default 'customer',
  branch_id uuid references branches(id),
  avatar_url text,
  -- customer-specific fields
  vip boolean not null default false,
  loyalty_points integer not null default 0,
  total_spend numeric(12,2) not null default 0,
  allergy text,
  preferences text,
  gdpr_consented boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ Service categories & services ============
create table if not exists service_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order integer not null default 0
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references service_categories(id) on delete set null,
  name text not null,
  description text,
  duration_minutes integer not null,
  single_price numeric(10,2) not null,
  pack_price numeric(10,2),
  badge text,
  rating numeric(2,1) default 4.9,
  created_at timestamptz not null default now()
);

-- ============ Professionals ============
create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id) on delete set null,
  name text not null,
  role text not null,
  status text not null default 'Available',
  created_at timestamptz not null default now()
);

-- ============ Appointments ============
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  booking_code text unique,
  branch_id uuid references branches(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  professional_id uuid references professionals(id) on delete set null,
  client_id uuid references profiles(id) on delete set null,
  appointment_type appointment_type not null default 'solo',
  scheduled_date date not null,
  start_time time not null,
  duration_minutes integer not null,
  status appointment_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now()
);

-- ============ Payments ============
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete cascade,
  reference_no text,
  sender_name text,
  amount numeric(10,2) not null,
  method payment_method not null,
  status payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- ============ Promo codes ============
create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_amount numeric(10,2) not null,
  active boolean not null default true
);

-- ============ Staff shifts ============
create table if not exists staff_shifts (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid references professionals(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  status shift_status not null default 'working',
  created_at timestamptz not null default now()
);

-- ============ Reviews ============
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id) on delete cascade,
  client_id uuid references profiles(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  text text,
  created_at timestamptz not null default now()
);

-- ============ Audit logs ============
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action_text text not null,
  severity text not null default 'normal',
  created_at timestamptz not null default now()
);

-- ============ Indexes ============
create index if not exists idx_appointments_branch on appointments(branch_id);
create index if not exists idx_appointments_client on appointments(client_id);
create index if not exists idx_appointments_date on appointments(scheduled_date);
create index if not exists idx_payments_appointment on payments(appointment_id);
create index if not exists idx_staff_shifts_date on staff_shifts(shift_date);

-- ============ Row Level Security ============
alter table profiles enable row level security;
alter table appointments enable row level security;
alter table payments enable row level security;
alter table reviews enable row level security;
alter table audit_logs enable row level security;
alter table branches enable row level security;
alter table services enable row level security;
alter table service_categories enable row level security;
alter table professionals enable row level security;
alter table staff_shifts enable row level security;
alter table promo_codes enable row level security;

-- Public read access for catalog-style data
create policy "public read branches" on branches for select using (true);
create policy "public read services" on services for select using (true);
create policy "public read service_categories" on service_categories for select using (true);
create policy "public read professionals" on professionals for select using (true);

-- Profiles: users manage their own row
create policy "users read own profile" on profiles for select using (auth.uid() = id);
create policy "users update own profile" on profiles for update using (auth.uid() = id);
create policy "users insert own profile" on profiles for insert with check (auth.uid() = id);

-- Appointments: clients see their own; staff/admin see all (checked via profiles.role)
create policy "clients read own appointments" on appointments for select
  using (
    client_id = auth.uid()
    or exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'front_desk', 'specialist')
    )
  );

create policy "clients create own appointments" on appointments for insert
  with check (client_id = auth.uid());

create policy "staff manage appointments" on appointments for update
  using (
    exists (
      select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'front_desk')
    )
  );

-- Payments: same visibility as their related appointment
create policy "read related payments" on payments for select
  using (
    exists (
      select 1 from appointments a
      where a.id = payments.appointment_id
      and (
        a.client_id = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'front_desk'))
      )
    )
  );

-- Reviews: public read, authenticated client insert
create policy "public read reviews" on reviews for select using (true);
create policy "clients create reviews" on reviews for insert with check (client_id = auth.uid());

-- Staff shifts & audit logs: staff/admin only
create policy "staff read shifts" on staff_shifts for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'front_desk', 'specialist')));

create policy "staff read audit logs" on audit_logs for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'front_desk')));

create policy "admin read promo codes" on promo_codes for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
