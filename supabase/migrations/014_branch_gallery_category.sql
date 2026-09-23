-- 014_branch_gallery_category.sql
-- Distinguishes menu photos from general branch gallery photos, so menu
-- uploads don't show up in the public "See all images" branch gallery.

alter table branch_gallery
  add column if not exists category text not null default 'gallery';

do $$ begin
  alter table branch_gallery
    add constraint branch_gallery_category_check
    check (category in ('gallery', 'menu'));
exception when duplicate_object then null; end $$;
