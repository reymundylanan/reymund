-- 034_walkin_lifecycle_and_charges.sql
-- Extends the session lifecycle with two walk-in-specific states (Ready,
-- Paid) on top of the existing arrived/waiting/in_service/completed/
-- no_show set (kept for Online Booking's existing flow). "Cancelled" is
-- deliberately NOT a session_status value — it reuses the existing
-- appointments.status = 'cancelled' field so there's one source of
-- truth for "this booking was cancelled", not two.
--
-- service_started_at / completed_at record the two additional
-- timestamps the new Walk-In workflow needs (arrival_time already
-- exists; payment time is read from payments.created_at — no new
-- column needed there).
--
-- additional_charges lets front desk add extra fees during the visit
-- on top of the originally quoted price.
alter table appointments drop constraint if exists appointments_session_status_check;
alter table appointments add constraint appointments_session_status_check
  check (session_status is null or session_status in ('arrived', 'waiting', 'ready', 'in_service', 'completed', 'paid', 'no_show'));

alter table appointments add column if not exists service_started_at timestamptz;
alter table appointments add column if not exists completed_at timestamptz;
alter table appointments add column if not exists additional_charges numeric not null default 0;
