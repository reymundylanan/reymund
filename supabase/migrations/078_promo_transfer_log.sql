-- 078: Multi-Branch Promos — record promo changes (on/off, copy, move to
-- another branch) in the transfer history alongside staff, bookings and services.

alter table branch_transfer_log drop constraint if exists branch_transfer_log_transfer_type_check;
alter table branch_transfer_log add constraint branch_transfer_log_transfer_type_check
  check (transfer_type in ('appointment_move', 'staff_temporary', 'staff_permanent', 'service_availability',
                           'client_transfer', 'walkin_transfer', 'promo_availability'));

notify pgrst, 'reload schema';
