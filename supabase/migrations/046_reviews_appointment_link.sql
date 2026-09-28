-- Ties a review to the specific completed booking it's about, so a
-- client can rate each service they've had (once per booking) from
-- My Services. branch_id stays set too, so these still count toward
-- the branch's reviews in admin Reports.
alter table reviews
  add column if not exists appointment_id uuid references appointments(id) on delete cascade;

create unique index if not exists reviews_client_appointment_uniq
  on reviews (client_id, appointment_id)
  where appointment_id is not null;
