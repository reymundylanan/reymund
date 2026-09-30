-- 052 check script. Replace before running:
--   :CLIENT_ID   a customer profile id        :OTHER_ID  another customer profile id
--   :ADMIN_ID    an admin profile id          :BRANCH_ID the One Cecilia Center branch id
--   :SVC_ID      an Active branch_services id at :BRANCH_ID
--   :STAFF_ID    a staff_members id
-- Every check prints NOTICE 'PASS ...' or WARNING 'FAIL ...'. Everything is rolled back.
-- Reward settings are reset to the defaults (10 x5, 50%, max 50, enabled) inside the
-- transaction so the numbers below hold. Needs 048-052 applied.
-- If the storage.objects inserts are rejected on your Supabase version, upload any
-- image files to the matching review-photos paths in the Storage dashboard and delete those lines.
begin;

update review_reward_settings
   set rating_points = 10, meaningful_points = 10, specific_points = 10, relevant_points = 10,
       photo_points = 10, partial_ratio = 0.5, max_points = 50, enabled = true
 where id = 1;

-- Starting balance of the client (may be non-zero on a real database)
create temp table chk_start as
select coalesce((select current_points from client_rewards where client_id = ':CLIENT_ID'), 0) as bal,
       coalesce((select lifetime_earned from client_rewards where client_id = ':CLIENT_ID'), 0) as life;
grant select on chk_start to public;

-- Seven completed appointments, each with one booked service
insert into appointments (id, booking_code, branch_id, client_id, professional_id, appointment_type,
                          scheduled_date, start_time, duration_minutes, status, notes)
values
  ('00000000-0000-4000-8000-000000000521', 'CHK521', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date - 1, '09:00', 60, 'completed', 'Check Service with Tester — ₱1.00'),
  ('00000000-0000-4000-8000-000000000522', 'CHK522', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date - 2, '09:00', 60, 'completed', 'Check Service with Tester — ₱1.00'),
  ('00000000-0000-4000-8000-000000000523', 'CHK523', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date - 3, '09:00', 60, 'completed', 'Check Service with Tester — ₱1.00'),
  ('00000000-0000-4000-8000-000000000524', 'CHK524', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date - 4, '09:00', 60, 'completed', 'Check Service with Tester — ₱1.00'),
  ('00000000-0000-4000-8000-000000000525', 'CHK525', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date - 5, '09:00', 60, 'completed', 'Check Service with Tester — ₱1.00'),
  ('00000000-0000-4000-8000-000000000526', 'CHK526', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date - 6, '09:00', 60, 'completed', 'Check Service with Tester — ₱1.00'),
  ('00000000-0000-4000-8000-000000000527', 'CHK527', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo', current_date - 7, '09:00', 60, 'completed', 'Check Service with Tester — ₱1.00');
insert into appointment_services (appointment_id, position, service_id, service_name) values
  ('00000000-0000-4000-8000-000000000521', 0, ':SVC_ID', 'Check Service'),
  ('00000000-0000-4000-8000-000000000522', 0, ':SVC_ID', 'Check Service'),
  ('00000000-0000-4000-8000-000000000523', 0, ':SVC_ID', 'Check Service'),
  ('00000000-0000-4000-8000-000000000524', 0, ':SVC_ID', 'Check Service'),
  ('00000000-0000-4000-8000-000000000525', 0, ':SVC_ID', 'Check Service'),
  ('00000000-0000-4000-8000-000000000526', 0, ':SVC_ID', 'Check Service'),
  ('00000000-0000-4000-8000-000000000527', 0, ':SVC_ID', 'Check Service');
insert into storage.objects (bucket_id, name) values
  ('review-photos', ':CLIENT_ID/00000000-0000-4000-8000-000000000521/11111111-1111-4111-8111-111111111111.jpg'),
  ('review-photos', ':CLIENT_ID/00000000-0000-4000-8000-000000000522/22222222-2222-4222-8222-222222222222.jpg');

-- The client submits reviews for appointments 1-6 (7 is used later, with rewards disabled)
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select submit_visit_review('00000000-0000-4000-8000-000000000521',
  '[{"position":0,"rating":5,"text":"Lovely massage, the therapist was very attentive to my sore shoulders.","photos":[":CLIENT_ID/00000000-0000-4000-8000-000000000521/11111111-1111-4111-8111-111111111111.jpg"]}]'::jsonb,
  null, null, null, null);
select submit_visit_review('00000000-0000-4000-8000-000000000522',
  '[{"position":0,"rating":1,"text":"Lovely massage, the therapist was very attentive to my sore shoulders.","photos":[":CLIENT_ID/00000000-0000-4000-8000-000000000522/22222222-2222-4222-8222-222222222222.jpg"]}]'::jsonb,
  null, null, null, null);
select submit_visit_review('00000000-0000-4000-8000-000000000523',
  '[{"position":0,"rating":4,"text":"Good session overall."}]'::jsonb, null, null, null, null);
select submit_visit_review('00000000-0000-4000-8000-000000000524',
  '[{"position":0,"rating":4,"text":"Good session overall."}]'::jsonb, null, null, null, null);
select submit_visit_review('00000000-0000-4000-8000-000000000525',
  '[{"position":0,"rating":4,"text":"Good session overall."}]'::jsonb, null, null, null, null);
select submit_visit_review('00000000-0000-4000-8000-000000000526',
  '[{"position":0,"rating":4,"text":"Good session overall."}]'::jsonb, null, null, null, null);
reset role;

-- 1. Exactly one pending evaluation per reviewed appointment
do $$ declare v_n integer; v_pending integer; begin
  select count(*), count(*) filter (where status = 'pending') into v_n, v_pending
    from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000521';
  if v_n = 1 and v_pending = 1 then raise notice 'PASS one pending evaluation after submit';
  else raise warning 'FAIL evaluations %, pending %', v_n, v_pending; end if;
end $$;

-- 2. The client cannot write points or apply an evaluation
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  insert into points_transactions (client_id, type, points, balance_after) values (':CLIENT_ID', 'admin_adjustment', 999, 999);
  raise warning 'FAIL client inserted a points transaction';
exception when others then
  if sqlerrm like 'permission denied%' or sqlerrm like 'new row violates row-level security policy%' then raise notice 'PASS client cannot insert points transactions';
  else raise warning 'FAIL client points insert got %', sqlerrm; end if;
end $$;
do $$ declare v_n integer; begin
  update client_rewards set current_points = 999 where client_id = ':CLIENT_ID';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise notice 'PASS client cannot update client_rewards (no rows)';
  else raise warning 'FAIL client updated % client_rewards rows', v_n; end if;
exception when others then
  if sqlerrm like 'permission denied%' or sqlerrm like 'new row violates row-level security policy%' then raise notice 'PASS client cannot update client_rewards';
  else raise warning 'FAIL client client_rewards update got %', sqlerrm; end if;
end $$;
do $$ begin
  perform apply_review_evaluation(
    (select id from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000521'),
    '{}'::jsonb, 'm');
  raise warning 'FAIL client applied an evaluation';
exception when others then
  if sqlerrm like 'permission denied%' then raise notice 'PASS client cannot call apply_review_evaluation';
  else raise warning 'FAIL client apply got %', sqlerrm; end if;
end $$;
reset role;

-- 3. Service role: claim + apply, all criteria pass -> 50 (5 stars); 1 star with identical text -> 50
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
do $$ declare v_c jsonb; v_part jsonb; v_r jsonb; begin
  v_c := claim_review_evaluation('00000000-0000-4000-8000-000000000521');
  select p into v_part from jsonb_array_elements(v_c -> 'parts') p where p ->> 'target' = 'service';
  if v_c is not null and (v_part ->> 'rating')::int = 5
     and v_part -> 'photos' ->> 0 = ':CLIENT_ID/00000000-0000-4000-8000-000000000521/11111111-1111-4111-8111-111111111111.jpg' then
    raise notice 'PASS claim returns the rating and the photo path';
  else raise warning 'FAIL claim returned %', v_c; end if;
  v_r := apply_review_evaluation((v_c ->> 'evaluationId')::uuid,
    '{"rating":{"result":"pass","confidence":"high","reason":"r"},"meaningful":{"result":"pass","confidence":"high","reason":"r"},"specific":{"result":"pass","confidence":"high","reason":"r"},"relevant":{"result":"pass","confidence":"high","reason":"r"},"photo":{"result":"pass","confidence":"high","reason":"r"},"summary":"s"}'::jsonb,
    'test-model')::jsonb;
  if (v_r ->> 'points')::int = 50 and v_r ->> 'status' = 'evaluated' and v_r ->> 'applied' = 'true' then raise notice 'PASS all-pass evaluation awards 50';
  else raise warning 'FAIL 5-star all-pass result %', v_r; end if;

  v_c := claim_review_evaluation('00000000-0000-4000-8000-000000000522');
  v_r := apply_review_evaluation((v_c ->> 'evaluationId')::uuid,
    '{"rating":{"result":"pass","confidence":"high","reason":"r"},"meaningful":{"result":"pass","confidence":"high","reason":"r"},"specific":{"result":"pass","confidence":"high","reason":"r"},"relevant":{"result":"pass","confidence":"high","reason":"r"},"photo":{"result":"pass","confidence":"high","reason":"r"},"summary":"s"}'::jsonb,
    'test-model')::jsonb;
  if (v_r ->> 'points')::int = 50 then raise notice 'PASS 1-star review earns the same 50 (rating neutrality)';
  else raise warning 'FAIL 1-star all-pass result %', v_r; end if;
end $$;

-- 4. Applying again does nothing
do $$ declare v_r jsonb; begin
  v_r := apply_review_evaluation(
    (select id from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000521'),
    '{"rating":{"result":"pass","confidence":"high","reason":"r"},"meaningful":{"result":"pass","confidence":"high","reason":"r"},"specific":{"result":"pass","confidence":"high","reason":"r"},"relevant":{"result":"pass","confidence":"high","reason":"r"},"photo":{"result":"pass","confidence":"high","reason":"r"},"summary":"s"}'::jsonb,
    'test-model')::jsonb;
  if v_r ->> 'applied' = 'false' then raise notice 'PASS second apply reports applied=false';
  else raise warning 'FAIL second apply result %', v_r; end if;
end $$;
reset role;
do $$ declare v_n integer; v_bal integer; v_start integer; begin
  select count(*) into v_n from points_transactions
   where review_evaluation_id = (select id from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000521')
     and type = 'review_reward';
  if v_n = 1 then raise notice 'PASS exactly one review_reward row'; else raise warning 'FAIL review_reward rows %', v_n; end if;

  -- 5. Totals
  select bal into v_start from chk_start;
  select current_points into v_bal from client_rewards where client_id = ':CLIENT_ID';
  if v_bal = v_start + 100
     and (select lifetime_earned from client_rewards where client_id = ':CLIENT_ID') = (select life from chk_start) + 100
     and (select loyalty_points from profiles where id = ':CLIENT_ID') = v_bal then
    raise notice 'PASS current_points, lifetime_earned and loyalty_points all +100';
  else raise warning 'FAIL totals: current %, loyalty %', v_bal, (select loyalty_points from profiles where id = ':CLIENT_ID'); end if;
end $$;

-- 6. Timeout path: five claims, each followed by a failure -> failed; a sixth claim returns null
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
do $$ declare v_c jsonb; v_ok boolean := true; begin
  for i in 1..5 loop
    v_c := claim_review_evaluation('00000000-0000-4000-8000-000000000523');
    if v_c is null then v_ok := false; end if;
    perform fail_review_evaluation((select id from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000523'), 'timeout');
  end loop;
  if v_ok then raise notice 'PASS five claims succeeded'; else raise warning 'FAIL a claim within five attempts returned null'; end if;
  v_c := claim_review_evaluation('00000000-0000-4000-8000-000000000523');
  if v_c is null then raise notice 'PASS sixth claim returns null'; else raise warning 'FAIL sixth claim returned %', v_c; end if;
end $$;
reset role;
do $$ declare v_status text; begin
  select status into v_status from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000523';
  if v_status = 'failed' then raise notice 'PASS evaluation failed after five attempts'; else raise warning 'FAIL status after five failures %', v_status; end if;
end $$;

-- 7. Pending with attempts already at 5: next claim marks it failed
update review_evaluations set attempts = 5, status = 'pending' where appointment_id = '00000000-0000-4000-8000-000000000524';
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
do $$ declare v_c jsonb; begin
  v_c := claim_review_evaluation('00000000-0000-4000-8000-000000000524');
  if v_c is null then raise notice 'PASS claim at 5 attempts returns null'; else raise warning 'FAIL claim at 5 attempts returned %', v_c; end if;
end $$;
reset role;
do $$ declare v_status text; begin
  select status into v_status from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000524';
  if v_status = 'failed' then raise notice 'PASS stuck pending evaluation set to failed'; else raise warning 'FAIL stuck evaluation status %', v_status; end if;
end $$;

-- 8. Low confidence -> needs_review, excluded from points; no photo -> not_provided
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
do $$ declare v_c jsonb; v_r jsonb; begin
  v_c := claim_review_evaluation('00000000-0000-4000-8000-000000000525');
  v_r := apply_review_evaluation((v_c ->> 'evaluationId')::uuid,
    '{"rating":{"result":"pass","confidence":"high","reason":"r"},"meaningful":{"result":"pass","confidence":"high","reason":"r"},"specific":{"result":"pass","confidence":"low","reason":"unsure"},"relevant":{"result":"pass","confidence":"high","reason":"r"},"photo":{"result":"pass","confidence":"high","reason":"r"},"summary":"s"}'::jsonb,
    'test-model')::jsonb;
  if (v_r ->> 'points')::int = 30 and v_r ->> 'status' = 'needs_review' then raise notice 'PASS low-confidence criterion excluded, status needs_review';
  else raise warning 'FAIL low-confidence result %', v_r; end if;
end $$;
reset role;
do $$ declare v_spec text; v_photo text; begin
  select specific_result, photo_result into v_spec, v_photo from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000525';
  if v_spec = 'needs_review' then raise notice 'PASS specific stored as needs_review'; else raise warning 'FAIL specific_result %', v_spec; end if;
  if v_photo = 'not_provided' then raise notice 'PASS no photo stored as not_provided'; else raise warning 'FAIL photo_result %', v_photo; end if;
end $$;

-- 9. Editing the first review adds no evaluation and no points
do $$ declare v_before integer; begin
  select count(*) into v_before from points_transactions where client_id = ':CLIENT_ID';
  create temp table if not exists chk_tx (n integer);
  delete from chk_tx;
  insert into chk_tx values (v_before);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select edit_visit_review('00000000-0000-4000-8000-000000000521',
  '[{"position":0,"rating":3,"text":"Changed my mind a little.","photos":[":CLIENT_ID/00000000-0000-4000-8000-000000000521/11111111-1111-4111-8111-111111111111.jpg"]}]'::jsonb,
  null, null, null, null);
reset role;
do $$ declare v_evals integer; v_tx integer; begin
  select count(*) into v_evals from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000521';
  select count(*) into v_tx from points_transactions where client_id = ':CLIENT_ID';
  if v_evals = 1 and v_tx = (select n from chk_tx) then raise notice 'PASS edit adds no evaluation and no transaction';
  else raise warning 'FAIL after edit: evaluations %, transactions % (was %)', v_evals, v_tx, (select n from chk_tx); end if;
end $$;

-- 10. Tags
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare v_tags text[]; begin
  perform set_visit_review_tags('00000000-0000-4000-8000-000000000521', '[{"position":0,"tags":["Clean","Relaxing"]}]'::jsonb);
  select tags into v_tags from reviews
   where appointment_id = '00000000-0000-4000-8000-000000000521' and target_type = 'service' and service_position = 0;
  if v_tags @> array['Clean', 'Relaxing'] and cardinality(v_tags) = 2 then raise notice 'PASS tags saved';
  else raise warning 'FAIL tags saved as %', v_tags; end if;
exception when others then
  raise warning 'FAIL valid tags got %', sqlerrm;
end $$;
do $$ begin
  perform set_visit_review_tags('00000000-0000-4000-8000-000000000521', '[{"position":0,"tags":["Bad Tag"]}]'::jsonb);
  raise warning 'FAIL unknown tag accepted';
exception when others then
  if sqlerrm = 'REVIEW_INVALID' then raise notice 'PASS unknown tag rejected';
  else raise warning 'FAIL unknown tag got %', sqlerrm; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':OTHER_ID', 'role', 'authenticated')::text, true);
do $$ begin
  perform set_visit_review_tags('00000000-0000-4000-8000-000000000521', '[{"position":0,"tags":["Clean"]}]'::jsonb);
  raise warning 'FAIL other user set tags';
exception when others then
  if sqlerrm = 'REVIEW_NOT_ALLOWED' then raise notice 'PASS other user cannot set tags';
  else raise warning 'FAIL other user tags got %', sqlerrm; end if;
end $$;
reset role;

-- 11. Admin override of the needs_review criterion (appointment 5)
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare v_r jsonb; begin
  v_r := override_review_criterion(
    (select id from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000525'),
    'specific', 'pass', 'Detailed enough');
  if (v_r ->> 'delta')::int = 10 then raise notice 'PASS override pass returns delta 10';
  else raise warning 'FAIL override result %', v_r; end if;
exception when others then
  raise warning 'FAIL override got %', sqlerrm;
end $$;
reset role;
do $$ declare v_adj integer; v_status text; begin
  select count(*) into v_adj from points_transactions
   where review_evaluation_id = (select id from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000525')
     and type = 'admin_adjustment';
  select status into v_status from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000525';
  if v_adj = 1 and v_status = 'evaluated' then raise notice 'PASS one admin_adjustment row, status evaluated';
  else raise warning 'FAIL adjustments %, status %', v_adj, v_status; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform override_review_criterion(
    (select id from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000525'),
    'specific', 'pass', 'Again');
  raise warning 'FAIL second override accepted';
exception when others then
  if sqlerrm = 'EVAL_BAD_STATE' then raise notice 'PASS second override rejected';
  else raise warning 'FAIL second override got %', sqlerrm; end if;
end $$;
reset role;

-- 12. Cap: appointment 6 needs_review with points_awarded = max - 5; a 10-point pass adds only 5
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
do $$ declare v_c jsonb; begin
  v_c := claim_review_evaluation('00000000-0000-4000-8000-000000000526');
  perform apply_review_evaluation((v_c ->> 'evaluationId')::uuid,
    '{"rating":{"result":"pass","confidence":"high","reason":"r"},"meaningful":{"result":"pass","confidence":"high","reason":"r"},"specific":{"result":"pass","confidence":"low","reason":"unsure"},"relevant":{"result":"pass","confidence":"high","reason":"r"},"photo":{"result":"pass","confidence":"high","reason":"r"},"summary":"s"}'::jsonb,
    'test-model');
end $$;
reset role;
update review_evaluations set points_awarded = 45 where appointment_id = '00000000-0000-4000-8000-000000000526';
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare v_r jsonb; begin
  v_r := override_review_criterion(
    (select id from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000526'),
    'specific', 'pass', 'Cap check');
  if (v_r ->> 'delta')::int = 5 then raise notice 'PASS override capped at the per-review maximum (delta 5)';
  else raise warning 'FAIL capped override result %', v_r; end if;
exception when others then
  raise warning 'FAIL capped override got %', sqlerrm;
end $$;
reset role;

-- 13. Permissions and validation of admin functions
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform override_review_criterion(
    (select id from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000526'),
    'specific', 'pass', 'x');
  raise warning 'FAIL client overrode a criterion';
exception when others then
  if sqlerrm = 'REVIEW_FORBIDDEN' then raise notice 'PASS client cannot override';
  else raise warning 'FAIL client override got %', sqlerrm; end if;
end $$;
do $$ begin
  perform update_review_reward_settings(10, 10, 10, 10, 10, 0.5, 50, true);
  raise warning 'FAIL client updated settings';
exception when others then
  if sqlerrm = 'REVIEW_FORBIDDEN' then raise notice 'PASS client cannot update settings';
  else raise warning 'FAIL client settings got %', sqlerrm; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
do $$ begin
  perform update_review_reward_settings(10, 10, 10, 10, 10, 0.5, -1, true);
  raise warning 'FAIL negative max accepted';
exception when others then
  if sqlerrm = 'REVIEW_INVALID' then raise notice 'PASS negative max rejected';
  else raise warning 'FAIL negative max got %', sqlerrm; end if;
end $$;
reset role;

-- 15. due_review_evaluations returns only pending, due ids
-- (run before case 14; appointment 4 was failed in case 7, so make it pending and due again)
update review_evaluations set status = 'pending', attempts = 0, next_attempt_at = now() - interval '1 minute'
 where appointment_id = '00000000-0000-4000-8000-000000000524';
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
set local role service_role;
do $$ declare v_ids uuid[]; v_bad integer; begin
  select coalesce(array_agg(x), '{}') into v_ids from due_review_evaluations(10) as x;
  select count(*) into v_bad from review_evaluations
   where appointment_id = any (v_ids) and (status <> 'pending' or next_attempt_at > now());
  if '00000000-0000-4000-8000-000000000524'::uuid = any (v_ids)
     and not ('00000000-0000-4000-8000-000000000521'::uuid = any (v_ids))
     and not ('00000000-0000-4000-8000-000000000523'::uuid = any (v_ids))
     and v_bad = 0 then
    raise notice 'PASS due list holds only pending, due evaluations';
  else raise warning 'FAIL due list % (non-due rows %)', v_ids, v_bad; end if;
end $$;
reset role;

-- 14. Rewards disabled -> the next evaluation is skipped
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select update_review_reward_settings(10, 10, 10, 10, 10, 0.5, 50, false);
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
select submit_visit_review('00000000-0000-4000-8000-000000000527',
  '[{"position":0,"rating":4,"text":"Good session overall."}]'::jsonb, null, null, null, null);
reset role;
do $$ declare v_status text; begin
  select status into v_status from review_evaluations where appointment_id = '00000000-0000-4000-8000-000000000527';
  if v_status = 'skipped' then raise notice 'PASS evaluation skipped while rewards are disabled';
  else raise warning 'FAIL status with rewards disabled %', v_status; end if;
end $$;

rollback;
