-- 018_leave_requests_multi_date.sql
-- Leave requests are individually picked days (up to 7), not a
-- continuous start/end range. Table has 0 rows so far (017 was just
-- applied), so this is safe to restructure directly.
alter table leave_requests drop constraint if exists leave_requests_date_range;
alter table leave_requests drop column if exists start_date;
alter table leave_requests drop column if exists end_date;
alter table leave_requests add column if not exists dates date[] not null default '{}';
alter table leave_requests alter column dates drop default;

do $$ begin
  alter table leave_requests
    add constraint leave_requests_dates_count
    check (cardinality(dates) between 1 and 7);
exception when duplicate_object then null; end $$;
