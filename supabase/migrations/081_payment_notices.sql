-- 081_payment_notices.sql
-- Requires 068. Admin → Payments can send a client a notice about a pending
-- payment ("Notify client"). It's a bell notice like the others (kind
-- 'payment'), and goes out by email and push as well.

alter table client_notifications drop constraint if exists client_notifications_kind_check;
alter table client_notifications add constraint client_notifications_kind_check
  check (kind in ('confirmed', 'cancelled', 'review_request', 'review_reward',
                  'voucher_expired', 'voucher_cancelled', 'points_adjusted', 'no_show',
                  'reminder', 'rescheduled', 'payment'));

-- Same as 068, plus 'payment' by email. Every notice still goes by push.
create or replace function queue_notification_deliveries() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.kind in ('confirmed', 'cancelled', 'rescheduled', 'no_show', 'reminder', 'review_request', 'payment')
     and exists (select 1 from profiles p where p.id = new.client_id and coalesce(btrim(p.email), '') <> '') then
    insert into notification_deliveries (notification_id, channel) values (new.id, 'email')
    on conflict do nothing;
  end if;

  if exists (select 1 from push_subscriptions s where s.profile_id = new.client_id) then
    insert into notification_deliveries (notification_id, channel) values (new.id, 'push')
    on conflict do nothing;
  end if;

  return new;
exception when others then
  -- Never lose the bell notice over email/push.
  raise warning 'queue_notification_deliveries failed: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function queue_notification_deliveries() from public, anon, authenticated;
