-- 090_function_search_path.sql
-- Supabase security advisor: six functions had no fixed search_path, so a
-- caller could change which tables/functions their names resolve to. Pin
-- them to public (they only use built-ins, profiles and auth.uid()).
-- Behaviour is unchanged.

alter function public.current_user_role() set search_path = public, pg_temp;
alter function public.clean_review_text(text) set search_path = public, pg_temp;
alter function public.normalize_review_text(text) set search_path = public, pg_temp;
alter function public.mask_email(text) set search_path = public, pg_temp;
alter function public.mb_reject(text, text) set search_path = public, pg_temp;
alter function public.mb_minutes(time) set search_path = public, pg_temp;
