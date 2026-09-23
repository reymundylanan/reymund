-- 015_branch_gallery_shared_menu.sql
-- Allows branch_gallery rows with no branch_id, used for menu photos that
-- are shared across all branches instead of tied to one.

alter table branch_gallery
  alter column branch_id drop not null;
