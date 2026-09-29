-- Run in the Supabase SQL Editor AFTER applying 048. Everything is rolled
-- back. Replace the two placeholders first:
--   :CLIENT_ID   a customer profile id
--   :DONE_APPT   one of that customer's COMPLETED appointments with NO review yet
begin;

do $$
declare
  ok int := 0; bad int := 0;
  procedure_check text;
  function_check boolean;
begin
  -- Word filter: must be blocked
  foreach procedure_check in array array[
    'you are a fuck', 'f*ck this', 'f.u.c.k', 'sh1t service', 'fuuuck', 'f u c k you',
    'PUTANGINA', 'putang ina mo', 'gago ka', 'yawa ka', 'i will kill you', '<b>bitch</b>'
  ] loop
    if review_text_is_clean(procedure_check) then
      raise warning 'FAIL (should block): %', procedure_check; bad := bad + 1;
    else ok := ok + 1; end if;
  end loop;

  -- Must pass: honest negatives and innocent embeds
  foreach procedure_check in array array[
    'The massage was terrible, rushed and the staff was rude.',
    'Pangit ang serbisyo, dili ko balik.', 'Bati kaayo ang massage.',
    'Worst facial ever. Dirty towels.', 'Great class, Scunthorpe style assessment of my skin',
    'Shitake mushroom tea was nice', 'Gagawin ko ulit!', 'Mabuti naman.'
  ] loop
    if review_text_is_clean(procedure_check) then ok := ok + 1;
    else raise warning 'FAIL (should pass): %', procedure_check; bad := bad + 1; end if;
  end loop;

  -- Cleaning
  if clean_review_text('  <script>alert(1)</script>Nice   place  ') = 'alert(1)Nice place' then ok := ok + 1;
  else raise warning 'FAIL clean_review_text: %', clean_review_text('  <script>alert(1)</script>Nice   place  '); bad := bad + 1; end if;

  raise notice 'word filter + cleaning: % passed, % failed', ok, bad;
end $$;

-- Submission as the client
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Blocked word rejected, nothing saved
do $$ begin
  perform submit_visit_review(':DONE_APPT'::uuid, 5::smallint, 'gago', null, null, null, null);
  raise warning 'FAIL: inappropriate review accepted';
exception when others then
  if sqlerrm = 'REVIEW_INAPPROPRIATE' then raise notice 'PASS inappropriate'; else raise warning 'FAIL got %', sqlerrm; end if;
end $$;

-- 2. Valid submit (service + staff + branch)
select submit_visit_review(':DONE_APPT'::uuid, 4::smallint, 'Nice but a bit rushed', 5::smallint, 'Very gentle', 3::smallint, null);
select target_type, rating, status from reviews where appointment_id = ':DONE_APPT'::uuid order by target_type;

-- 3. Duplicate rejected
do $$ begin
  perform submit_visit_review(':DONE_APPT'::uuid, 5::smallint, null, null, null, null, null);
  raise warning 'FAIL: duplicate accepted';
exception when others then
  if sqlerrm = 'REVIEW_DUPLICATE' then raise notice 'PASS duplicate'; else raise warning 'FAIL got %', sqlerrm; end if;
end $$;

-- 4. Moderation forbidden for a customer
do $$ begin
  perform moderate_review((select id from reviews where appointment_id = ':DONE_APPT'::uuid limit 1), 'hide', null);
  raise warning 'FAIL: customer moderated';
exception when others then
  if sqlerrm = 'REVIEW_FORBIDDEN' then raise notice 'PASS forbidden'; else raise warning 'FAIL got %', sqlerrm; end if;
end $$;

reset role;

-- 5. Anonymous sees only visible rows
update reviews set status = 'hidden' where appointment_id = ':DONE_APPT'::uuid and target_type = 'staff';
set local role anon;
select 'anon sees hidden rows (must be 0):' as check, count(*) from reviews where status <> 'visible';
reset role;

rollback;
