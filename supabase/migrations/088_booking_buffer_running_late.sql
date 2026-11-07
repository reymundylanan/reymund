-- 088_booking_buffer_running_late.sql
-- Requires 081. Two things for services that run past their time:
--   * A buffer between bookings (spa_settings.booking_buffer_minutes, default
--     10): a therapist's next booking can't start until this long after the
--     previous one ends, so a small overrun doesn't push every later client
--     back. 0 turns it off. Read by the booking screens (everyone can read
--     spa_settings, 040); Admin changes it.
--   * A 'running_late' notice: the Front Desk can tell the next client their
--     therapist is finishing with someone and they may start a little late.
--     It goes to the bell, by email and by push like the other booking notices.

alter table spa_settings add column if not exists booking_buffer_minutes integer not null default 10;
alter table spa_settings drop constraint if exists spa_settings_booking_buffer_check;
alter table spa_settings add constraint spa_settings_booking_buffer_check
  check (booking_buffer_minutes between 0 and 60);

alter table client_notifications drop constraint if exists client_notifications_kind_check;
alter table client_notifications add constraint client_notifications_kind_check
  check (kind in ('confirmed', 'cancelled', 'review_request', 'review_reward',
                  'voucher_expired', 'voucher_cancelled', 'points_adjusted', 'no_show',
                  'reminder', 'rescheduled', 'payment', 'running_late'));

-- Same as 081, plus 'running_late' by email. Every notice still goes by push.
create or replace function queue_notification_deliveries() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.kind in ('confirmed', 'cancelled', 'rescheduled', 'no_show', 'reminder', 'review_request', 'payment', 'running_late')
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
