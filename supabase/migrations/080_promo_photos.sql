-- 080_promo_photos.sql
-- A photo for each promotion, uploaded by Admin in Branches → Promotions.
-- The file lives in the public 'service-media' bucket (074) under promos/;
-- promotions with the same name in several branches share the photo.
-- Without a photo, the site keeps showing the picture for the promo's category.

alter table branch_promotions add column if not exists image_path text;
