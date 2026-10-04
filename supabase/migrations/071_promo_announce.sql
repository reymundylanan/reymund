-- 071_promo_announce.sql
-- Requires 008, 066. A new promo is emailed once to clients who opted in to
-- "exclusive offers" at login (066). announced_at marks a promo as sent so
-- editing it later never emails again.

alter table branch_promotions add column if not exists announced_at timestamptz;

notify pgrst, 'reload schema';
