-- 021_drop_leave_requests.sql
-- The Leave Requests feature (front desk "Manage Leave Requests" and
-- admin "Leave" action) has been removed from the app. Drops the table
-- and its policies; cascade removes the policies automatically.
drop table if exists leave_requests cascade;
