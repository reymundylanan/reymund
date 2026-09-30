-- 053 check script. Replace before running:
--   :CLIENT_ID     a customer profile id       :OTHER_ID  another customer profile id
--   :FRONTDESK_ID  a front_desk profile id     :ADMIN_ID  an admin profile id
--   :BRANCH_ID     the One Cecilia Center branch id
--   :SVC_ID        an Active branch_services id at :BRANCH_ID
--   :STAFF_ID      a staff_members id
-- Every check prints NOTICE 'PASS ...' or WARNING 'FAIL ...'. Everything is rolled back.
-- The client's balance is reset to 1200 points inside the transaction and the
-- redemption settings to max 100 / enabled, so the numbers below hold. Needs 048-053 applied.
begin;

update review_reward_settings
   set rating_points = 10, meaningful_points = 10, specific_points = 10, relevant_points = 10,
       photo_points = 10, partial_ratio = 0.5, max_points = 50, enabled = true,
       max_voucher_discount = 100, redemption_enabled = true
 where id = 1;

create temp table chk_v (tag text, id uuid, code text);
grant all on chk_v to public;

-- Two known options (other options on a real database are ignored)
insert into reward_options (id, name, points_cost, discount_amount, valid_days, sort_order) values
  ('00000000-0000-4000-8000-000000005301', 'Chk 50 OFF', 500, 50, 90, 901),
  ('00000000-0000-4000-8000-000000005302', 'Chk 100 OFF', 1000, 100, 90, 902);

-- Clean slate for the client, then 1200 points with a matching opening balance
delete from reward_vouchers where client_id = ':CLIENT_ID';
delete from points_transactions where client_id = ':CLIENT_ID';
delete from client_notifications where client_id = ':CLIENT_ID';
insert into client_rewards (client_id, current_points, lifetime_earned, lifetime_redeemed)
values (':CLIENT_ID', 1200, 1200, 0)
on conflict (client_id) do update set current_points = 1200, lifetime_earned = 1200, lifetime_redeemed = 0;
insert into points_transactions (client_id, type, points, balance_after, note)
values (':CLIENT_ID', 'opening_balance', 1200, 1200, 'Starting balance');
update profiles set loyalty_points = 1200 where id = ':CLIENT_ID';

-- 5311 pending (case 7), 5312 (cap), 5313 (undo), 5314 paid (undo), 5315 other client's, 5316 completed (052)
insert into appointments (id, booking_code, branch_id, client_id, professional_id, appointment_type,
                          scheduled_date, start_time, duration_minutes, status, notes)
values
  ('00000000-0000-4000-8000-000000005311', 'CHK531', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date + 1, '09:00', 60, 'pending', 'Check Service with Tester — ₱500.00'),
  ('00000000-0000-4000-8000-000000005312', 'CHK532', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date + 2, '09:00', 60, 'pending', 'Check Service with Tester — ₱500.00'),
  ('00000000-0000-4000-8000-000000005313', 'CHK533', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date + 3, '09:00', 60, 'pending', 'Check Service with Tester — ₱500.00'),
  ('00000000-0000-4000-8000-000000005314', 'CHK534', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date + 4, '09:00', 60, 'pending', 'Check Service with Tester — ₱500.00'),
  ('00000000-0000-4000-8000-000000005315', 'CHK535', ':BRANCH_ID', ':OTHER_ID', ':STAFF_ID', 'solo', current_date + 5, '09:00', 60, 'pending', 'Check Service with Tester — ₱500.00'),
  ('00000000-0000-4000-8000-000000005316', 'CHK536', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date - 1, '09:00', 60, 'completed', 'Check Service with Tester — ₱1.00');
update appointments set session_status = 'paid' where id = '00000000-0000-4000-8000-000000005314';
insert into appointment_services (appointment_id, position, service_id, service_name)
values ('00000000-0000-4000-8000-000000005316', 0, ':SVC_ID', 'Check Service');

-- 1. The client cannot write loyalty_points directly
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  update profiles set loyalty_points = 99999 where id = ':CLIENT_ID';
  raise warning 'FAIL client changed loyalty_points';
exception when others then
  if sqlerrm = 'PROFILE_FIELD_LOCKED' then raise notice 'PASS client cannot change loyalty_points';
  else raise warning 'FAIL loyalty_points update got %', sqlerrm; end if;
end $$;
reset role;

-- 2. Redeem the 50 option
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := redeem_reward('00000000-0000-4000-8000-000000005301');
  insert into chk_v values ('V1', (r ->> 'voucherId')::uuid, r ->> 'code');
  if (r ->> 'balance')::int = 700 then raise notice 'PASS redeem returns balance 700';
  else raise warning 'FAIL redeem result %', r; end if;
exception when others then
  raise warning 'FAIL redeem got %', sqlerrm;
end $$;
reset role;
do $$ declare v reward_vouchers; t points_transactions; c client_rewards; begin
  select * into v from reward_vouchers where id = (select id from chk_v where tag = 'V1');
  select * into t from points_transactions where client_id = ':CLIENT_ID' and type = 'redemption';
  select * into c from client_rewards where client_id = ':CLIENT_ID';
  if v.status = 'active' and v.code ~ '^GLOW-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$' then raise notice 'PASS voucher active with a valid code';
  else raise warning 'FAIL voucher % %', v.status, v.code; end if;
  if t.points = -500 and t.voucher_id = v.id and t.balance_after = 700 then raise notice 'PASS redemption ledger row -500 with voucher_id';
  else raise warning 'FAIL redemption row % % %', t.points, t.voucher_id, t.balance_after; end if;
  if c.current_points = 700 and c.lifetime_earned = 1200 and c.lifetime_redeemed = 500
     and (select loyalty_points from profiles where id = ':CLIENT_ID') = 700 then
    raise notice 'PASS balance 700, lifetime_earned 1200, lifetime_redeemed 500, loyalty_points 700';
  else raise warning 'FAIL totals % % % %', c.current_points, c.lifetime_earned, c.lifetime_redeemed,
    (select loyalty_points from profiles where id = ':CLIENT_ID'); end if;
end $$;

-- 3. Not enough points for the 100 option
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform redeem_reward('00000000-0000-4000-8000-000000005302');
  raise warning 'FAIL redeemed without enough points';
exception when others then
  if sqlerrm = 'REDEEM_NOT_ENOUGH' then raise notice 'PASS not enough points rejected';
  else raise warning 'FAIL not-enough got %', sqlerrm; end if;
end $$;
reset role;
do $$ begin
  if (select current_points from client_rewards where client_id = ':CLIENT_ID') = 700 then raise notice 'PASS balance unchanged after rejection';
  else raise warning 'FAIL balance changed after rejection'; end if;
end $$;

-- 4. Redemption disabled
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select update_redemption_settings(100, false);
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
do $$ begin
  perform redeem_reward('00000000-0000-4000-8000-000000005301');
  raise warning 'FAIL redeemed while disabled';
exception when others then
  if sqlerrm = 'REDEEM_DISABLED' then raise notice 'PASS redeem rejected while disabled';
  else raise warning 'FAIL disabled got %', sqlerrm; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
select update_redemption_settings(100, true);
reset role;

-- 5. Other roles cannot redeem; nobody inserts vouchers directly
select set_config('request.jwt.claims', json_build_object('sub', ':FRONTDESK_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform redeem_reward('00000000-0000-4000-8000-000000005301');
  raise warning 'FAIL front desk redeemed';
exception when others then
  if sqlerrm = 'REDEEM_FORBIDDEN' then raise notice 'PASS front desk cannot redeem';
  else raise warning 'FAIL front desk redeem got %', sqlerrm; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ begin
  perform redeem_reward('00000000-0000-4000-8000-000000005301');
  raise warning 'FAIL anon redeemed';
exception when others then
  if sqlerrm like 'permission denied%' or sqlerrm = 'REDEEM_FORBIDDEN' then raise notice 'PASS anon cannot redeem';
  else raise warning 'FAIL anon redeem got %', sqlerrm; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  insert into reward_vouchers (client_id, name, points_used, discount_amount, code, expires_at)
  values (':CLIENT_ID', 'Fake', 1, 50, 'GLOW-AAAA-BBBB', now() + interval '1 day');
  raise warning 'FAIL client inserted a voucher';
exception when others then
  if sqlerrm like 'permission denied%' or sqlerrm like 'new row violates row-level security policy%' then raise notice 'PASS client cannot insert vouchers';
  else raise warning 'FAIL voucher insert got %', sqlerrm; end if;
end $$;
reset role;

-- 6. A voucher cannot be applied to another client's booking
select set_config('request.jwt.claims', json_build_object('sub', ':FRONTDESK_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform apply_voucher('00000000-0000-4000-8000-000000005315', (select code from chk_v where tag = 'V1'), 500);
  raise warning 'FAIL voucher applied to another client';
exception when others then
  if sqlerrm = 'VOUCHER_WRONG_CLIENT' then raise notice 'PASS wrong client rejected';
  else raise warning 'FAIL wrong client got %', sqlerrm; end if;
end $$;

-- 7. Apply (lowercase code, remaining 30 -> discount 30), one voucher per booking, no reuse
do $$ declare r jsonb; begin
  r := apply_voucher('00000000-0000-4000-8000-000000005311', lower((select code from chk_v where tag = 'V1')), 30);
  if (r ->> 'discount')::numeric = 30 then raise notice 'PASS discount is min(50, 30, 100) = 30';
  else raise warning 'FAIL apply result %', r; end if;
exception when others then
  raise warning 'FAIL apply got %', sqlerrm;
end $$;
reset role;
do $$ begin
  if (select status from reward_vouchers where id = (select id from chk_v where tag = 'V1')) = 'used' then raise notice 'PASS voucher marked used';
  else raise warning 'FAIL voucher status after apply'; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := redeem_reward('00000000-0000-4000-8000-000000005301');
  insert into chk_v values ('V2', (r ->> 'voucherId')::uuid, r ->> 'code');
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':FRONTDESK_ID', 'role', 'authenticated')::text, true);
do $$ begin
  perform apply_voucher('00000000-0000-4000-8000-000000005311', (select code from chk_v where tag = 'V2'), 500);
  raise warning 'FAIL second voucher on the same booking accepted';
exception when others then
  if sqlerrm = 'VOUCHER_ALREADY_APPLIED' then raise notice 'PASS one voucher per booking';
  else raise warning 'FAIL second voucher got %', sqlerrm; end if;
end $$;
do $$ begin
  perform apply_voucher('00000000-0000-4000-8000-000000005312', (select code from chk_v where tag = 'V1'), 500);
  raise warning 'FAIL used voucher accepted again';
exception when others then
  if sqlerrm = 'VOUCHER_USED' then raise notice 'PASS used voucher rejected';
  else raise warning 'FAIL reuse got %', sqlerrm; end if;
end $$;
reset role;

-- 8. Max cap of 20 per booking
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select update_redemption_settings(20, true);
select set_config('request.jwt.claims', json_build_object('sub', ':FRONTDESK_ID', 'role', 'authenticated')::text, true);
do $$ declare r jsonb; begin
  r := apply_voucher('00000000-0000-4000-8000-000000005312', (select code from chk_v where tag = 'V2'), 500);
  if (r ->> 'discount')::numeric = 20 then raise notice 'PASS discount capped at 20';
  else raise warning 'FAIL capped result %', r; end if;
exception when others then
  raise warning 'FAIL cap got %', sqlerrm;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
select update_redemption_settings(100, true);
reset role;

-- 9. Undo: same day on an unpaid booking works
select set_config('request.jwt.claims', json_build_object('sub', ':FRONTDESK_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform undo_voucher((select id from chk_v where tag = 'V2'));
  if (select status from reward_vouchers where id = (select id from chk_v where tag = 'V2')) = 'active' then raise notice 'PASS undo returns the voucher to active';
  else raise warning 'FAIL status after undo'; end if;
exception when others then
  raise warning 'FAIL undo got %', sqlerrm;
end $$;
-- ...but not when it was used yesterday
do $$ begin
  perform apply_voucher('00000000-0000-4000-8000-000000005313', (select code from chk_v where tag = 'V2'), 500);
end $$;
reset role;
update reward_vouchers set used_at = now() - interval '1 day' where id = (select id from chk_v where tag = 'V2');
select set_config('request.jwt.claims', json_build_object('sub', ':FRONTDESK_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform undo_voucher((select id from chk_v where tag = 'V2'));
  raise warning 'FAIL undo of yesterday accepted';
exception when others then
  if sqlerrm = 'VOUCHER_UNDO_EXPIRED' then raise notice 'PASS undo rejected after the day';
  else raise warning 'FAIL yesterday undo got %', sqlerrm; end if;
end $$;
reset role;
-- ...and not once the booking is paid
update reward_vouchers
   set status = 'active', used_at = null, used_appointment_id = null, discount_applied = null, applied_by = null
 where id = (select id from chk_v where tag = 'V2');
select set_config('request.jwt.claims', json_build_object('sub', ':FRONTDESK_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform apply_voucher('00000000-0000-4000-8000-000000005314', (select code from chk_v where tag = 'V2'), 500);
  perform undo_voucher((select id from chk_v where tag = 'V2'));
  raise warning 'FAIL undo on a paid booking accepted';
exception when others then
  if sqlerrm = 'VOUCHER_UNDO_EXPIRED' then raise notice 'PASS undo rejected on a paid booking';
  else raise warning 'FAIL paid undo got %', sqlerrm; end if;
end $$;
reset role;
update reward_vouchers
   set status = 'active', used_at = null, used_appointment_id = null, discount_applied = null, applied_by = null
 where id = (select id from chk_v where tag = 'V2');

-- 10. The client cannot apply, undo or cancel
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform apply_voucher('00000000-0000-4000-8000-000000005311', (select code from chk_v where tag = 'V2'), 500);
  raise warning 'FAIL client applied a voucher';
exception when others then
  if sqlerrm = 'VOUCHER_FORBIDDEN' then raise notice 'PASS client cannot apply';
  else raise warning 'FAIL client apply got %', sqlerrm; end if;
end $$;
do $$ begin
  perform undo_voucher((select id from chk_v where tag = 'V1'));
  raise warning 'FAIL client undid a voucher';
exception when others then
  if sqlerrm = 'VOUCHER_FORBIDDEN' then raise notice 'PASS client cannot undo';
  else raise warning 'FAIL client undo got %', sqlerrm; end if;
end $$;
do $$ begin
  perform cancel_voucher((select id from chk_v where tag = 'V2'), 'x');
  raise warning 'FAIL client cancelled a voucher';
exception when others then
  if sqlerrm = 'VOUCHER_FORBIDDEN' then raise notice 'PASS client cannot cancel';
  else raise warning 'FAIL client cancel got %', sqlerrm; end if;
end $$;
reset role;

-- 11. Expiry returns the points once (V2 is active, balance is 200)
update reward_vouchers set expires_at = now() - interval '1 minute' where id = (select id from chk_v where tag = 'V2');
create temp table chk_exp (n integer);
grant all on chk_exp to public;
do $$ declare n integer; begin
  n := expire_vouchers();
  insert into chk_exp values (n);
  if n >= 1 then raise notice 'PASS expire_vouchers returned %', n;
  else raise warning 'FAIL expire_vouchers returned %', n; end if;
end $$;
do $$ declare c client_rewards; begin
  select * into c from client_rewards where client_id = ':CLIENT_ID';
  if (select status from reward_vouchers where id = (select id from chk_v where tag = 'V2')) = 'expired' then raise notice 'PASS voucher expired';
  else raise warning 'FAIL voucher not expired'; end if;
  if (select count(*) from points_transactions where client_id = ':CLIENT_ID' and type = 'voucher_refund') = 1
     and (select points from points_transactions where client_id = ':CLIENT_ID' and type = 'voucher_refund') = 500 then
    raise notice 'PASS one voucher_refund of +500';
  else raise warning 'FAIL voucher_refund rows'; end if;
  if c.current_points = 700 and c.lifetime_earned = 1200 and c.lifetime_redeemed = 500
     and (select loyalty_points from profiles where id = ':CLIENT_ID') = 700 then
    raise notice 'PASS refund: balance 700, lifetime_earned 1200, lifetime_redeemed 500';
  else raise warning 'FAIL refund totals % % %', c.current_points, c.lifetime_earned, c.lifetime_redeemed; end if;
  if (select count(*) from client_notifications where client_id = ':CLIENT_ID' and kind = 'voucher_expired') = 1 then raise notice 'PASS voucher_expired bell';
  else raise warning 'FAIL voucher_expired bell count'; end if;
end $$;
do $$ declare n integer; begin
  n := expire_vouchers();
  if n = 0 and (select count(*) from points_transactions where client_id = ':CLIENT_ID' and type = 'voucher_refund') = 1 then
    raise notice 'PASS second expire_vouchers does nothing';
  else raise warning 'FAIL second expire_vouchers returned %', n; end if;
end $$;

-- 12. Ledger, rewards row and profile agree
do $$ declare v_sum integer; begin
  select sum(points) into v_sum from points_transactions where client_id = ':CLIENT_ID';
  if v_sum = (select current_points from client_rewards where client_id = ':CLIENT_ID')
     and v_sum = (select loyalty_points from profiles where id = ':CLIENT_ID') then
    raise notice 'PASS ledger sum = current_points = loyalty_points (%)', v_sum;
  else raise warning 'FAIL ledger sum % vs current % vs loyalty %', v_sum,
    (select current_points from client_rewards where client_id = ':CLIENT_ID'),
    (select loyalty_points from profiles where id = ':CLIENT_ID'); end if;
end $$;

-- 13. Cancel refunds once
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare r jsonb; begin
  r := redeem_reward('00000000-0000-4000-8000-000000005301');
  insert into chk_v values ('V3', (r ->> 'voucherId')::uuid, r ->> 'code');
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
do $$ begin
  perform cancel_voucher((select id from chk_v where tag = 'V3'), '');
  raise warning 'FAIL empty reason accepted';
exception when others then
  if sqlerrm = 'VOUCHER_INVALID' then raise notice 'PASS empty cancel reason rejected';
  else raise warning 'FAIL empty reason got %', sqlerrm; end if;
end $$;
do $$ begin
  perform cancel_voucher((select id from chk_v where tag = 'V3'), 'test');
  if (select current_points from client_rewards where client_id = ':CLIENT_ID') = 700
     and (select count(*) from client_notifications where client_id = ':CLIENT_ID' and kind = 'voucher_cancelled') = 1
     and (select status from reward_vouchers where id = (select id from chk_v where tag = 'V3')) = 'cancelled' then
    raise notice 'PASS cancel refunds 500 and sends the bell';
  else raise warning 'FAIL cancel effects'; end if;
exception when others then
  raise warning 'FAIL cancel got %', sqlerrm;
end $$;
do $$ begin
  perform cancel_voucher((select id from chk_v where tag = 'V3'), 'again');
  raise warning 'FAIL second cancel accepted';
exception when others then
  if sqlerrm = 'VOUCHER_INVALID' then raise notice 'PASS second cancel rejected';
  else raise warning 'FAIL second cancel got %', sqlerrm; end if;
end $$;
reset role;

-- 14. Manual adjustment
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform adjust_client_points(':CLIENT_ID', -999999, 'x');
  raise warning 'FAIL huge adjustment accepted';
exception when others then
  if sqlerrm = 'POINTS_INVALID' then raise notice 'PASS out-of-range adjustment rejected';
  else raise warning 'FAIL huge adjustment got %', sqlerrm; end if;
end $$;
do $$ begin
  perform adjust_client_points(':CLIENT_ID', -1000, 'too much');
  raise warning 'FAIL adjustment below zero accepted';
exception when others then
  if sqlerrm = 'POINTS_NEGATIVE' then raise notice 'PASS adjustment below zero rejected';
  else raise warning 'FAIL below-zero got %', sqlerrm; end if;
end $$;
do $$ declare v_bal integer; begin
  v_bal := adjust_client_points(':CLIENT_ID', 50, 'goodwill');
  if v_bal = 750
     and (select lifetime_earned from client_rewards where client_id = ':CLIENT_ID') = 1250
     and (select loyalty_points from profiles where id = ':CLIENT_ID') = 750
     and (select count(*) from client_notifications where client_id = ':CLIENT_ID' and kind = 'points_adjusted') = 1 then
    raise notice 'PASS +50 adjustment: balance 750, lifetime_earned 1250, bell sent';
  else raise warning 'FAIL adjustment result %', v_bal; end if;
exception when others then
  raise warning 'FAIL adjustment got %', sqlerrm;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':FRONTDESK_ID', 'role', 'authenticated')::text, true);
do $$ begin
  perform adjust_client_points(':CLIENT_ID', 10, 'x');
  raise warning 'FAIL front desk adjusted points';
exception when others then
  if sqlerrm = 'REVIEW_FORBIDDEN' then raise notice 'PASS front desk cannot adjust';
  else raise warning 'FAIL front desk adjust got %', sqlerrm; end if;
end $$;
reset role;

-- 15. 052 still works: a review reward pays and updates loyalty_points
create temp table chk_bal (bal integer);
grant all on chk_bal to public;
insert into chk_bal select current_points from client_rewards where client_id = ':CLIENT_ID';
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select submit_visit_review('00000000-0000-4000-8000-000000005316',
  '[{"position":0,"rating":4,"text":"Good session overall."}]'::jsonb, null, null, null, null);
reset role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
do $$ declare v_c jsonb; v_r jsonb; begin
  v_c := claim_review_evaluation('00000000-0000-4000-8000-000000005316');
  v_r := apply_review_evaluation((v_c ->> 'evaluationId')::uuid,
    '{"rating":{"result":"pass","confidence":"high","reason":"r"},"meaningful":{"result":"pass","confidence":"high","reason":"r"},"specific":{"result":"pass","confidence":"high","reason":"r"},"relevant":{"result":"pass","confidence":"high","reason":"r"},"photo":{"result":"pass","confidence":"high","reason":"r"},"summary":"s"}'::jsonb,
    'test-model')::jsonb;
  if (v_r ->> 'points')::int > 0
     and (select current_points from client_rewards where client_id = ':CLIENT_ID') = (select bal from chk_bal) + (v_r ->> 'points')::int
     and (select loyalty_points from profiles where id = ':CLIENT_ID') = (select current_points from client_rewards where client_id = ':CLIENT_ID') then
    raise notice 'PASS review reward still pays and updates loyalty_points';
  else raise warning 'FAIL review reward result %', v_r; end if;
exception when others then
  raise warning 'FAIL review reward got %', sqlerrm;
end $$;
reset role;

-- 16. Options
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare v_id uuid; begin
  v_id := save_reward_option(null, 'Test', 10, 5, 30, true, 9);
  if v_id is not null and exists (select 1 from reward_options where id = v_id and name = 'Test') then raise notice 'PASS admin saves an option';
  else raise warning 'FAIL save_reward_option returned %', v_id; end if;
exception when others then
  raise warning 'FAIL save option got %', sqlerrm;
end $$;
do $$ begin
  perform save_reward_option(null, 'Bad', 0, 5, 30, true, 9);
  raise warning 'FAIL invalid option accepted';
exception when others then
  if sqlerrm = 'REVIEW_INVALID' then raise notice 'PASS invalid option rejected';
  else raise warning 'FAIL invalid option got %', sqlerrm; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
do $$ begin
  perform save_reward_option(null, 'Nope', 10, 5, 30, true, 9);
  raise warning 'FAIL client saved an option';
exception when others then
  if sqlerrm = 'REVIEW_FORBIDDEN' then raise notice 'PASS client cannot save options';
  else raise warning 'FAIL client option got %', sqlerrm; end if;
end $$;
reset role;

rollback;
