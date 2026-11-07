-- 089_username_lookup_server_only.sql
-- get_email_for_username (002/004) let anyone — signed out too — get an
-- Admin, Front Desk or Specialist email from a username. Staff sign-in now
-- happens on the server (/api/auth/staff-login), which reads the email itself,
-- so nobody outside the server needs this function.
--
-- Apply AFTER the website update with /api/auth/staff-login is live;
-- before that, the old login page still calls this function.

revoke execute on function get_email_for_username(text) from public, anon, authenticated;
alter function get_email_for_username(text) set search_path = public, pg_temp;
