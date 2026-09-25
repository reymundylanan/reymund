-- 026_drop_front_desk_transfer_insert.sql
-- The front-desk "Assign Branch Shifts" request flow (019) never got an
-- admin approve/deny screen and is now removed from the app — transfers
-- are created directly by admin as 'approved' rows (AdminTransferModal).
-- Front desk no longer needs to insert into branch_transfer_requests.
-- SELECT stays (needed for the front desk notification bell's realtime
-- listener), as does admin's manage-all policy.
drop policy if exists "front_desk insert branch_transfer_requests" on branch_transfer_requests;
