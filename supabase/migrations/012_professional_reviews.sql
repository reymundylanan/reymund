-- 012_professional_reviews.sql
-- Adds therapist-level reviews alongside the existing branch-level reviews.

alter table reviews
  add column if not exists professional_id uuid references professionals(id) on delete cascade;

alter table reviews
  alter column branch_id drop not null;

do $$ begin
  alter table reviews
    add constraint reviews_target_check
    check (branch_id is not null or professional_id is not null);
exception when duplicate_object then null; end $$;

-- Prevent a client from submitting more than one review for the same
-- professional (the dashboard's "Write a Review" flow assumes this).
create unique index if not exists reviews_client_professional_uniq
  on reviews (client_id, professional_id)
  where professional_id is not null;
