-- 027_public_read_approved_transfers.sql
-- The customer-facing booking page reads branch_transfer_requests (via
-- getStaffTransferredIntoBranch / getApprovedTransferDatesForBranch) to
-- show a transferred staff member as bookable at their target branch.
-- Customers aren't logged in as front_desk or admin, so RLS was silently
-- blocking that read — same gap staff_shifts had before its public-read
-- policy (016). Scoped to approved rows only, so pending/denied requests
-- (and the front-desk/admin decision workflow around them) stay private.
drop policy if exists "public read approved branch_transfer_requests" on branch_transfer_requests;
create policy "public read approved branch_transfer_requests" on branch_transfer_requests for select
  using (status = 'approved');
