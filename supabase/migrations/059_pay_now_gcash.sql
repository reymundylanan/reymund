-- 059_pay_now_gcash.sql
-- Requires 055. "Pay Now" via GCash with a manual check by the Front Desk:
--   client books → pays the spa's GCash → uploads the receipt →
--   booking stays Pending with a 'pending' payment (Payment Submitted) →
--   Front Desk compares it with the real GCash account on their phone →
--   Verify Payment (payment 'settled', who/when recorded) →
--   only then can the booking be confirmed.
-- Uploading a receipt never confirms anything by itself.
--
-- Also: the GCash name/number/QR the client sees are set by Admin
-- (spa_settings), and clients can now read their own payments.

-- ── GCash details (Admin → Payments → GCash Settings) ─────────────────

alter table spa_settings add column if not exists gcash_account_name text not null default 'Blush Spa & Aesthetics';
alter table spa_settings add column if not exists gcash_number text;
alter table spa_settings add column if not exists gcash_qr_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gcash-qr', 'gcash-qr', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin manage gcash qr" on storage.objects;
create policy "admin manage gcash qr" on storage.objects for all to authenticated
  using (bucket_id = 'gcash-qr' and coalesce(public.current_user_role()::text, '') = 'admin')
  with check (bucket_id = 'gcash-qr' and coalesce(public.current_user_role()::text, '') = 'admin');

-- ── Payment fields ────────────────────────────────────────────────────

alter table payments add column if not exists payment_type text;
alter table payments drop constraint if exists payments_payment_type_check;
alter table payments add constraint payments_payment_type_check
  check (payment_type is null or payment_type in ('pay_now'));
alter table payments add column if not exists receipt_path text;
alter table payments add column if not exists verified_by uuid references profiles(id) on delete set null;
alter table payments add column if not exists verified_at timestamptz;
alter table payments add column if not exists rejected_reason text;

-- One open/verified Pay Now payment per booking.
create unique index if not exists payments_one_pay_now
  on payments (appointment_id) where payment_type = 'pay_now' and status in ('pending', 'settled');

create index if not exists payments_created_idx on payments (created_at desc);

-- Clients see the payments on their own bookings (status on My Glow).
drop policy if exists "client read own payments" on payments;
create policy "client read own payments" on payments for select
  using (exists (select 1 from appointments a where a.id = payments.appointment_id and a.client_id = auth.uid()));

-- ── Receipts (private; signed URLs) ───────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "clients upload own receipts" on storage.objects;
create policy "clients upload own receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "clients read own receipts" on storage.objects;
create policy "clients read own receipts" on storage.objects for select to authenticated
  using (bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "staff read receipts" on storage.objects;
create policy "staff read receipts" on storage.objects for select to authenticated
  using (bucket_id = 'payment-receipts' and coalesce(public.current_user_role()::text, '') in ('admin', 'front_desk'));

-- ── Client submits ────────────────────────────────────────────────────

create or replace function submit_pay_now_payment(
  p_appointment_id uuid, p_amount numeric, p_receipt_path text, p_reference_no text, p_sender_name text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_appt appointments%rowtype;
  v_id uuid;
begin
  select * into v_appt from appointments where id = p_appointment_id for update;
  if not found or v_appt.client_id is distinct from auth.uid() then
    raise exception 'PAYNOW_FORBIDDEN';
  end if;
  if v_appt.status::text <> 'pending' then
    raise exception 'PAYNOW_INVALID: booking is no longer pending';
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

  insert into payments (appointment_id, amount, method, status, payment_type, receipt_path, reference_no, sender_name)
  values (p_appointment_id, round(p_amount, 2), 'gcash', 'pending', 'pay_now', p_receipt_path,
          nullif(left(btrim(coalesce(p_reference_no, '')), 40), ''), nullif(left(btrim(coalesce(p_sender_name, '')), 80), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function submit_pay_now_payment(uuid, numeric, text, text, text) from public, anon;
grant execute on function submit_pay_now_payment(uuid, numeric, text, text, text) to authenticated;

-- ── Front Desk verifies / marks not received ──────────────────────────

create or replace function paynow_staff_check(p_payment_id uuid) returns payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role text := coalesce(public.current_user_role()::text, '');
  v_pay payments%rowtype;
begin
  select * into v_pay from payments where id = p_payment_id for update;
  if not found then
    raise exception 'PAYNOW_INVALID: payment not found';
  end if;
  if v_role = 'admin' then
    return v_pay;
  end if;
  if v_role <> 'front_desk' or not exists (
    select 1 from appointments a join profiles p on p.id = auth.uid()
     where a.id = v_pay.appointment_id and p.branch_id = a.branch_id
  ) then
    raise exception 'PAYNOW_FORBIDDEN';
  end if;
  return v_pay;
end;
$$;

revoke execute on function paynow_staff_check(uuid) from public, anon, authenticated;

create or replace function verify_pay_now_payment(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pay payments%rowtype;
begin
  v_pay := paynow_staff_check(p_payment_id);
  if v_pay.payment_type is distinct from 'pay_now' or v_pay.status <> 'pending' then
    raise exception 'PAYNOW_INVALID: this payment is not waiting for verification';
  end if;
  -- The same GCash transaction can't pay for two bookings.
  if coalesce(btrim(v_pay.reference_no), '') <> '' and exists (
    select 1 from payments
     where id <> v_pay.id and status = 'settled' and method = 'gcash'
       and lower(btrim(reference_no)) = lower(btrim(v_pay.reference_no))
  ) then
    raise exception 'PAYNOW_DUPLICATE_REFERENCE';
  end if;

  update payments
     set status = 'settled', verified_by = auth.uid(), verified_at = now(), rejected_reason = null
   where id = v_pay.id;
end;
$$;

create or replace function reject_pay_now_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pay payments%rowtype;
begin
  v_pay := paynow_staff_check(p_payment_id);
  if v_pay.payment_type is distinct from 'pay_now' or v_pay.status <> 'pending' then
    raise exception 'PAYNOW_INVALID: this payment is not waiting for verification';
  end if;
  update payments
     set status = 'failed', verified_by = auth.uid(), verified_at = now(),
         rejected_reason = coalesce(nullif(left(btrim(coalesce(p_reason, '')), 200), ''), 'Payment not found in GCash')
   where id = v_pay.id;
end;
$$;

revoke execute on function verify_pay_now_payment(uuid) from public, anon;
revoke execute on function reject_pay_now_payment(uuid, text) from public, anon;
grant execute on function verify_pay_now_payment(uuid) to authenticated;
grant execute on function reject_pay_now_payment(uuid, text) to authenticated;

-- ── No confirming before the payment is verified ──────────────────────

create or replace function block_confirm_unverified_pay_now() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status::text = 'confirmed' and old.status::text is distinct from 'confirmed'
     and exists (select 1 from payments where appointment_id = new.id and payment_type = 'pay_now' and status = 'pending') then
    raise exception 'PAYNOW_NOT_VERIFIED: verify the GCash payment before confirming this booking';
  end if;
  return new;
end;
$$;

revoke execute on function block_confirm_unverified_pay_now() from public, anon, authenticated;

drop trigger if exists appointments_block_unverified_confirm on appointments;
create trigger appointments_block_unverified_confirm
  before update of status on appointments
  for each row execute function block_confirm_unverified_pay_now();

-- Live updates for the client's booking page and the Payments page.
do $$ begin
  alter publication supabase_realtime add table payments;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
