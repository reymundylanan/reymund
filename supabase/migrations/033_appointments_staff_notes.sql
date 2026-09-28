-- 033_appointments_staff_notes.sql
-- Free-text notes front desk can jot on a booking (distinct from the
-- existing `notes` column, which holds the auto-generated service/price
-- description string).
alter table appointments add column if not exists staff_notes text;
