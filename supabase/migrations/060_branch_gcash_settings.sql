-- 060_branch_gcash_settings.sql
-- Requires 059. GCash details are now per branch (Admin → Branches →
-- branch → Payment Settings), with a Pay Now on/off switch per branch.
-- Each Pay Now payment keeps a copy of the GCash name/number it was paid
-- to, so later changes to a branch's settings never rewrite history.
-- Also: verification errors now say why (role or branch), so a refused
-- "Verify Payment" can be understood from the screen.

create table if not exists branch_payment_settings (
  branch_id uuid primary key references branches(id) on delete cascade,
  gcash_account_name text,
  gcash_number text,
  gcash_qr_path text,
  pay_now_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null,
  -- Pay Now needs complete GCash details.
  constraint branch_payment_settings_complete check (
    not pay_now_enabled
    or (coalesce(btrim(gcash_account_name), '') <> ''
        and coalesce(btrim(gcash_number), '') <> ''
        and coalesce(btrim(gcash_qr_path), '') <> '')
  )
);

alter table branch_payment_settings enable row level security;

-- The booking form shows these to clients; they're the spa's public payment details.
drop policy if exists "everyone read branch_payment_settings" on branch_payment_settings;
create policy "everyone read branch_payment_settings" on branch_payment_settings for select using (true);

drop policy if exists "admin manage branch_payment_settings" on branch_payment_settings;
create policy "admin manage branch_payment_settings" on branch_payment_settings for all
  using (coalesce(public.current_user_role()::text, '') = 'admin')
  with check (coalesce(public.current_user_role()::text, '') = 'admin');

grant select on branch_payment_settings to anon, authenticated;
grant insert, update, delete on branch_payment_settings to authenticated;

-- Start every branch from the single setting 059 had (Pay Now stays on
-- only where the copied details are complete).
insert into branch_payment_settings (branch_id, gcash_account_name, gcash_number, gcash_qr_path, pay_now_enabled)
select b.id, s.gcash_account_name, s.gcash_number, s.gcash_qr_path,
       coalesce(btrim(s.gcash_account_name), '') <> '' and coalesce(btrim(s.gcash_number), '') <> ''
         and coalesce(btrim(s.gcash_qr_path), '') <> ''
  from branches b
  left join spa_settings s on s.id
on conflict (branch_id) do nothing;

-- ── What the client paid to (kept on the payment) ─────────────────────

alter table payments add column if not exists paid_to_account_name text;
alter table payments add column if not exists paid_to_number text;

create or replace function submit_pay_now_payment(
  p_appointment_id uuid, p_amount numeric, p_receipt_path text, p_reference_no text, p_sender_name text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_appt appointments%rowtype;
  v_settings branch_payment_settings%rowtype;
  v_id uuid;
begin
  select * into v_appt from appointments where id = p_appointment_id for update;
  if not found or v_appt.client_id is distinct from auth.uid() then
    raise exception 'PAYNOW_FORBIDDEN: this booking is not yours';
  end if;
  if v_appt.status::text <> 'pending' then
    raise exception 'PAYNOW_INVALID: booking is no longer pending';
  end if;
  select * into v_settings from branch_payment_settings where branch_id = v_appt.branch_id;
  if not found or not v_settings.pay_now_enabled then
    raise exception 'PAYNOW_INVALID: Pay Now is not available at this branch';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'PAYNOW_INVALID: amount';
  end if;
  if coalesce(p_receipt_path, '') not like auth.uid()::text || '/%' or length(p_receipt_path) > 300 then
    raise exception 'PAYNOW_INVALID: receipt';
  end if;
  if exists (select 1 from payments where appointment_id = p_appointment_id and payment_type = 'pay_now' and status in ('pending', 'settled')) then
    raise exception 'PAYNOW_DUPLICATE';
  end if;

  insert into payments (appointment_id, amount, method, status, payment_type, receipt_path, reference_no, sender_name,
                        paid_to_account_name, paid_to_number)
  values (p_appointment_id, round(p_amount, 2), 'gcash', 'pending', 'pay_now', p_receipt_path,
          nullif(left(btrim(coalesce(p_reference_no, '')), 40), ''), nullif(left(btrim(coalesce(p_sender_name, '')), 80), ''),
          v_settings.gcash_account_name, v_settings.gcash_number)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function submit_pay_now_payment(uuid, numeric, text, text, text) from public, anon;
grant execute on function submit_pay_now_payment(uuid, numeric, text, text, text) to authenticated;

-- ── Clearer "who may verify" errors ───────────────────────────────────

create or replace function paynow_staff_check(p_payment_id uuid) returns payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role text := coalesce(public.current_user_role()::text, '');
  v_staff_branch uuid;
  v_booking_branch uuid;
  v_pay payments%rowtype;
begin
  select * into v_pay from payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYNOW_INVALID: payment not found';
  end if;
  if v_role = 'admin' then
    return v_pay;
  end if;
  if v_role <> 'front_desk' then
    raise exception 'PAYNOW_FORBIDDEN: only Front Desk or Admin can verify payments (this account is "%")',
      coalesce(nullif(v_role, ''), 'not signed in');
  end if;
  select branch_id into v_staff_branch from profiles where id = auth.uid();
  select branch_id into v_booking_branch from appointments where id = v_pay.appointment_id;
  if v_staff_branch is null then
    raise exception 'PAYNOW_FORBIDDEN: this Front Desk account has no branch assigned';
  end if;
  if v_staff_branch is distinct from v_booking_branch then
    raise exception 'PAYNOW_FORBIDDEN: this booking belongs to another branch';
  end if;
  return v_pay;
end;
$$;

revoke execute on function paynow_staff_check(uuid) from public, anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table branch_payment_settings;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
