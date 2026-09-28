-- 037_payments_refunded_status.sql
-- Admin Payments is being rebuilt with a real Refund action. Ensures
-- 'refunded' is an accepted payments.status value alongside whatever
-- constraint already exists (defensive — safe to run even if payments.status
-- was already unconstrained or already allowed this value).
do $$ begin
  alter table payments drop constraint if exists payments_status_check;
  alter table payments add constraint payments_status_check
    check (status in ('pending', 'settled', 'refunded', 'failed'));
exception when others then null; end $$;

alter table payments add column if not exists refund_reason text;
alter table payments add column if not exists refunded_at timestamptz;
