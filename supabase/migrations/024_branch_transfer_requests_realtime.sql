-- 024_branch_transfer_requests_realtime.sql
-- Needed for the front desk notification bell's "X is joining your
-- branch" listener (Transfer feature) to actually fire. Safe to run
-- whenever you're ready to use Transfer — nothing else depends on it.
do $$ begin
  alter publication supabase_realtime add table branch_transfer_requests;
exception when duplicate_object then null; end $$;
