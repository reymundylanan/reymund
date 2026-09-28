alter table staff_members add column if not exists shift_type text check (shift_type in ('opener', 'midshift', 'closer'));
alter table spa_settings add column if not exists booking_window_start time not null default '08:00';
alter table spa_settings add column if not exists booking_window_end time not null default '18:00';
