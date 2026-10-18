-- 083_promo_home.sql
-- "Show on home page" for promotions (Admin → Branches → Promotions → Edit).
-- Ticked promos are always among the home page's Active Promotions; the rest
-- take turns at random.

alter table branch_promotions add column if not exists show_on_home boolean not null default false;
