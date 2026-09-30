-- 051 check script. Replace before running:
--   :CLIENT_ID   a customer profile id        :OTHER_ID  another customer profile id
--   :ADMIN_ID    an admin profile id          :BRANCH_ID the One Cecilia Center branch id
--   :SVC_ID      an Active branch_services id at :BRANCH_ID
--   :STAFF_ID    a staff_members id
-- Every check prints NOTICE 'PASS ...' or WARNING 'FAIL ...'. Everything is rolled back.
-- If the storage.objects inserts are rejected on your Supabase version, upload any
-- image files to the matching review-photos paths in the Storage dashboard and delete those lines.
begin;

insert into appointments (id, booking_code, branch_id, client_id, professional_id, appointment_type,
                          scheduled_date, start_time, duration_minutes, status, notes)
values ('00000000-0000-4000-8000-000000000051', 'CHK051', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo',
        current_date - 1, '10:00', 60, 'completed', 'Check Service, Not A Real Name with Tester — ₱1.00');
insert into appointment_services (appointment_id, position, service_id, service_name) values
  ('00000000-0000-4000-8000-000000000051', 0, ':SVC_ID', 'Check Service'),
  ('00000000-0000-4000-8000-000000000051', 1, null, 'Not A Real Name');
insert into storage.objects (bucket_id, name) values
  ('review-photos', ':CLIENT_ID/00000000-0000-4000-8000-000000000051/11111111-1111-4111-8111-111111111111.jpg'),
  ('review-photos', ':CLIENT_ID/00000000-0000-4000-8000-000000000051/22222222-2222-4222-8222-222222222222.jpg'),
  ('review-photos', ':OTHER_ID/00000000-0000-4000-8000-000000000051/33333333-3333-4333-8333-333333333333.jpg');

select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Only one of two parts
do $$ begin
  perform submit_visit_review('00000000-0000-4000-8000-000000000051',
    '[{"position":0,"rating":5,"text":"ok"}]'::jsonb, null, null, null, null);
  raise warning 'FAIL missing second service part accepted';
exception when others then
  if sqlerrm = 'REVIEW_INVALID' then raise notice 'PASS every booked service needs a part';
  else raise warning 'FAIL missing part got %', sqlerrm; end if;
end $$;

-- 2. Duplicate position
do $$ begin
  perform submit_visit_review('00000000-0000-4000-8000-000000000051',
    '[{"position":0,"rating":5},{"position":0,"rating":4}]'::jsonb, null, null, null, null);
  raise warning 'FAIL duplicate position accepted';
exception when others then
  if sqlerrm = 'REVIEW_INVALID' then raise notice 'PASS duplicate position rejected';
  else raise warning 'FAIL duplicate position got %', sqlerrm; end if;
end $$;

-- 3. Rating 6
do $$ begin
  perform submit_visit_review('00000000-0000-4000-8000-000000000051',
    '[{"position":0,"rating":6},{"position":1,"rating":4}]'::jsonb, null, null, null, null);
  raise warning 'FAIL rating 6 accepted';
exception when others then
  if sqlerrm = 'REVIEW_INVALID' then raise notice 'PASS rating 6 rejected';
  else raise warning 'FAIL rating 6 got %', sqlerrm; end if;
end $$;

-- 4. Another user's photo
do $$ begin
  perform submit_visit_review('00000000-0000-4000-8000-000000000051',
    ('[{"position":0,"rating":5,"photos":["' || ':OTHER_ID/00000000-0000-4000-8000-000000000051/33333333-3333-4333-8333-333333333333.jpg' || '"]},{"position":1,"rating":4}]')::jsonb,
    null, null, null, null);
  raise warning 'FAIL other user photo accepted';
exception when others then
  if sqlerrm = 'REVIEW_BAD_PHOTO' then raise notice 'PASS other user photo rejected';
  else raise warning 'FAIL other user photo got %', sqlerrm; end if;
end $$;

-- 5. Own-folder path that does not exist in storage
do $$ begin
  perform submit_visit_review('00000000-0000-4000-8000-000000000051',
    ('[{"position":0,"rating":5,"photos":["' || ':CLIENT_ID/00000000-0000-4000-8000-000000000051/44444444-4444-4444-8444-444444444444.jpg' || '"]},{"position":1,"rating":4}]')::jsonb,
    null, null, null, null);
  raise warning 'FAIL nonexistent photo accepted';
exception when others then
  if sqlerrm = 'REVIEW_BAD_PHOTO' then raise notice 'PASS nonexistent photo rejected';
  else raise warning 'FAIL nonexistent photo got %', sqlerrm; end if;
end $$;

-- 6. Six photos
do $$ declare v_photos text; begin
  select string_agg('"' || ':CLIENT_ID/00000000-0000-4000-8000-000000000051/11111111-1111-4111-8111-11111111111' || n || '.jpg"', ',')
    into v_photos from generate_series(1, 6) as n;
  perform submit_visit_review('00000000-0000-4000-8000-000000000051',
    ('[{"position":0,"rating":5,"photos":[' || v_photos || ']},{"position":1,"rating":4}]')::jsonb,
    null, null, null, null);
  raise warning 'FAIL six photos accepted';
exception when others then
  if sqlerrm = 'REVIEW_BAD_PHOTO' then raise notice 'PASS six photos rejected';
  else raise warning 'FAIL six photos got %', sqlerrm; end if;
end $$;

-- 7. Same photo on both parts
do $$ begin
  perform submit_visit_review('00000000-0000-4000-8000-000000000051',
    ('[{"position":0,"rating":5,"photos":["' || ':CLIENT_ID/00000000-0000-4000-8000-000000000051/11111111-1111-4111-8111-111111111111.jpg' || '"]},'
     || '{"position":1,"rating":4,"photos":["' || ':CLIENT_ID/00000000-0000-4000-8000-000000000051/11111111-1111-4111-8111-111111111111.jpg' || '"]}]')::jsonb,
    null, null, null, null);
  raise warning 'FAIL same photo on two parts accepted';
exception when others then
  if sqlerrm = 'REVIEW_BAD_PHOTO' then raise notice 'PASS same photo on two parts rejected';
  else raise warning 'FAIL same photo on two parts got %', sqlerrm; end if;
end $$;

-- 8. Success
select submit_visit_review('00000000-0000-4000-8000-000000000051',
  ('[{"position":0,"rating":5,"text":"Lovely","photos":["' || ':CLIENT_ID/00000000-0000-4000-8000-000000000051/11111111-1111-4111-8111-111111111111.jpg'
   || '","' || ':CLIENT_ID/00000000-0000-4000-8000-000000000051/22222222-2222-4222-8222-222222222222.jpg' || '"]},{"position":1,"rating":4}]')::jsonb,
  5::smallint, 'Great therapist', null, null);
do $$ declare v_n integer; v_null boolean; v_ph text; begin
  select count(*) into v_n from reviews where appointment_id = '00000000-0000-4000-8000-000000000051';
  if v_n = 3 then raise notice 'PASS 3 review rows created'; else raise warning 'FAIL expected 3 review rows, got %', v_n; end if;
  select service_id is null into v_null from reviews
   where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 1;
  if v_null then raise notice 'PASS unresolved service part has null service_id'; else raise warning 'FAIL service part 1 service_id not null'; end if;
  select string_agg(p.position::text, ',' order by p.position) into v_ph
    from review_photos p join reviews r on r.id = p.review_id
   where r.appointment_id = '00000000-0000-4000-8000-000000000051';
  if v_ph = '0,1' then raise notice 'PASS 2 photos at positions 0,1'; else raise warning 'FAIL photo positions got %', v_ph; end if;
end $$;

-- 9. Submit again
do $$ begin
  perform submit_visit_review('00000000-0000-4000-8000-000000000051',
    '[{"position":0,"rating":5},{"position":1,"rating":4}]'::jsonb, null, null, null, null);
  raise warning 'FAIL second submit accepted';
exception when others then
  if sqlerrm = 'REVIEW_DUPLICATE' then raise notice 'PASS second submit rejected';
  else raise warning 'FAIL second submit got %', sqlerrm; end if;
end $$;

-- 10. Edit keeping only photo 2222, rating 3
do $$ declare v_ret text[]; v_rating smallint; v_edited timestamptz; begin
  v_ret := edit_visit_review('00000000-0000-4000-8000-000000000051',
    ('[{"position":0,"rating":3,"text":"Changed","photos":["' || ':CLIENT_ID/00000000-0000-4000-8000-000000000051/22222222-2222-4222-8222-222222222222.jpg' || '"]},{"position":1,"rating":4}]')::jsonb,
    5::smallint, 'Great therapist', null, null);
  select rating, edited_at into v_rating, v_edited from reviews
   where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0;
  if v_ret = array[':CLIENT_ID/00000000-0000-4000-8000-000000000051/11111111-1111-4111-8111-111111111111.jpg']
     and v_rating = 3 and v_edited is not null then
    raise notice 'PASS edit returns dropped photo path, rating updated, edited_at set';
  else
    raise warning 'FAIL edit returned %, rating %, edited_at %', v_ret, v_rating, v_edited;
  end if;
end $$;

-- 10b. Edit moving photo 2222 from part 0 to part 1
do $$ declare v_ph text; begin
  perform edit_visit_review('00000000-0000-4000-8000-000000000051',
    ('[{"position":0,"rating":3},{"position":1,"rating":4,"photos":["' || ':CLIENT_ID/00000000-0000-4000-8000-000000000051/22222222-2222-4222-8222-222222222222.jpg' || '"]}]')::jsonb,
    5::smallint, 'Great therapist', null, null);
  select string_agg(r.service_position::text, ',') into v_ph
    from review_photos p join reviews r on r.id = p.review_id
   where r.appointment_id = '00000000-0000-4000-8000-000000000051';
  if v_ph = '1' then raise notice 'PASS photo moved between parts'; else raise warning 'FAIL photo move left photos on parts %', v_ph; end if;
exception when others then
  raise warning 'FAIL photo move got %', sqlerrm;
end $$;

-- 11. Edit removing the existing staff part
do $$ begin
  perform edit_visit_review('00000000-0000-4000-8000-000000000051',
    '[{"position":0,"rating":3},{"position":1,"rating":4}]'::jsonb, null, null, null, null);
  raise warning 'FAIL removing staff part accepted';
exception when others then
  if sqlerrm = 'REVIEW_INVALID' then raise notice 'PASS staff part cannot be removed';
  else raise warning 'FAIL removing staff part got %', sqlerrm; end if;
end $$;

-- 12. Edit window expired
reset role;
update reviews set first_submitted_at = now() - interval '31 days' where appointment_id = '00000000-0000-4000-8000-000000000051';
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform edit_visit_review('00000000-0000-4000-8000-000000000051',
    '[{"position":0,"rating":3},{"position":1,"rating":4}]'::jsonb, 5::smallint, null, null, null);
  raise warning 'FAIL edit after 30 days accepted';
exception when others then
  if sqlerrm = 'REVIEW_EDIT_EXPIRED' then raise notice 'PASS edit after 30 days rejected';
  else raise warning 'FAIL edit after 30 days got %', sqlerrm; end if;
end $$;
reset role;
update reviews set first_submitted_at = now() where appointment_id = '00000000-0000-4000-8000-000000000051';

-- 13. Hidden part locks editing
update reviews set status = 'hidden' where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'staff';
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform edit_visit_review('00000000-0000-4000-8000-000000000051',
    '[{"position":0,"rating":3},{"position":1,"rating":4}]'::jsonb, 5::smallint, null, null, null);
  raise warning 'FAIL edit with hidden part accepted';
exception when others then
  if sqlerrm = 'REVIEW_LOCKED' then raise notice 'PASS hidden part locks editing';
  else raise warning 'FAIL hidden part got %', sqlerrm; end if;
end $$;
reset role;
update reviews set status = 'visible' where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'staff';

-- 14. Other user cannot edit
select set_config('request.jwt.claims', json_build_object('sub', ':OTHER_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform edit_visit_review('00000000-0000-4000-8000-000000000051',
    '[{"position":0,"rating":3},{"position":1,"rating":4}]'::jsonb, 5::smallint, null, null, null);
  raise warning 'FAIL other user edit accepted';
exception when others then
  if sqlerrm = 'REVIEW_NOT_ALLOWED' then raise notice 'PASS other user cannot edit';
  else raise warning 'FAIL other user edit got %', sqlerrm; end if;
end $$;

-- 15. Other user cannot add booking services (RLS)
do $$ begin
  insert into appointment_services (appointment_id, position, service_name)
  values ('00000000-0000-4000-8000-000000000051', 5, 'x');
  raise warning 'FAIL other user inserted booking service';
exception when others then
  if sqlerrm like 'new row violates row-level security policy%' then raise notice 'PASS other user blocked from booking services';
  else raise warning 'FAIL other user booking services got %', sqlerrm; end if;
end $$;
reset role;

-- 15b. Client can add the list once, in one statement, to a fresh booking
insert into appointments (id, booking_code, branch_id, client_id, professional_id, appointment_type,
                          scheduled_date, start_time, duration_minutes, status, notes)
values ('00000000-0000-4000-8000-000000000052', 'CHK052', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo',
        current_date + 1, '11:00', 60, 'pending', 'A, B with Tester — ₱1.00');
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare v_n integer; begin
  insert into appointment_services (appointment_id, position, service_name) values
    ('00000000-0000-4000-8000-000000000052', 0, 'A'),
    ('00000000-0000-4000-8000-000000000052', 1, 'B');
  select count(*) into v_n from appointment_services where appointment_id = '00000000-0000-4000-8000-000000000052';
  if v_n = 2 then raise notice 'PASS client added two booking services'; else raise warning 'FAIL expected 2 booking services, got %', v_n; end if;
exception when others then
  raise warning 'FAIL client booking services insert got %', sqlerrm;
end $$;

-- 15c. A second batch is rejected
do $$ begin
  insert into appointment_services (appointment_id, position, service_name)
  values ('00000000-0000-4000-8000-000000000052', 2, 'C');
  raise warning 'FAIL second batch of booking services accepted';
exception when others then
  if sqlerrm like 'new row violates row-level security policy%' then raise notice 'PASS second batch rejected';
  else raise warning 'FAIL second batch got %', sqlerrm; end if;
end $$;
reset role;

-- 16. Cross-branch service_id is nulled by the normalize trigger
do $$ declare v_other uuid; v_stored uuid; begin
  select id into v_other from branch_services where branch_id <> ':BRANCH_ID' limit 1;
  if v_other is null then raise notice 'SKIP no service at another branch'; return; end if;
  insert into appointment_services (appointment_id, position, service_id, service_name)
  values ('00000000-0000-4000-8000-000000000051', 7, v_other, 'Cross branch');
  select service_id into v_stored from appointment_services
   where appointment_id = '00000000-0000-4000-8000-000000000051' and position = 7;
  if v_stored is null then raise notice 'PASS cross-branch service_id nulled'; else raise warning 'FAIL cross-branch service_id kept'; end if;
end $$;

-- 17. Another client reports the service part 0 review: it becomes flagged and a 'flag' log row is written
select set_config('request.jwt.claims', json_build_object('sub', ':OTHER_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select report_review(
  (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0),
  'spam', 'test');
reset role;
do $$ declare v_status text; v_logs integer; begin
  select status, (select count(*) from review_moderation_log l where l.review_id = r.id and l.action = 'flag')
    into v_status, v_logs
    from reviews r
   where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0;
  if v_status = 'flagged' and v_logs = 1 then raise notice 'PASS report flags the review and logs it';
  else raise warning 'FAIL after report status %, flag log rows %', v_status, v_logs; end if;
end $$;

-- 18. Same reporter again
select set_config('request.jwt.claims', json_build_object('sub', ':OTHER_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform report_review(
    (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0),
    'spam', null);
  raise warning 'FAIL duplicate report accepted';
exception when others then
  if sqlerrm = 'REVIEW_REPORTED' then raise notice 'PASS duplicate report rejected';
  else raise warning 'FAIL duplicate report got %', sqlerrm; end if;
end $$;

-- 19. Author cannot report own review
select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
do $$ begin
  perform report_review(
    (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0),
    'spam', null);
  raise warning 'FAIL author reported own review';
exception when others then
  if sqlerrm = 'REVIEW_NOT_ALLOWED' then raise notice 'PASS author cannot report own review';
  else raise warning 'FAIL author report got %', sqlerrm; end if;
end $$;

-- 20. Unknown reason (as a third id; admins may report)
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
do $$ begin
  perform report_review(
    (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0),
    'bad', null);
  raise warning 'FAIL bad reason accepted';
exception when others then
  if sqlerrm = 'REVIEW_INVALID' then raise notice 'PASS bad reason rejected';
  else raise warning 'FAIL bad reason got %', sqlerrm; end if;
end $$;
reset role;

-- 21. Flagged review is still public. Case 10b left the only photo on part 1 (which has no service_id and is
-- not in the view), so move it to part 0 first to check photo_count.
update review_photos
   set review_id = (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0)
 where review_id = (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 1);
do $$ declare v_n integer; v_photos integer; begin
  select count(*), max(photo_count) into v_n, v_photos from public_service_reviews
   where id = (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0);
  if v_n = 1 and v_photos = 1 then raise notice 'PASS flagged review still public with 1 photo';
  else raise warning 'FAIL public_service_reviews rows %, photo_count %', v_n, v_photos; end if;
end $$;

-- 22. Admin keeps, then hides
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select moderate_review(
  (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0),
  'keep', null);
reset role;
do $$ declare v_status text; begin
  select status into v_status from reviews
   where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0;
  if v_status = 'visible' then raise notice 'PASS keep returns flagged review to visible';
  else raise warning 'FAIL after keep status %', v_status; end if;
end $$;
set local role authenticated;
select moderate_review(
  (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0),
  'hide', 'x');
reset role;
do $$ declare v_status text; begin
  select status into v_status from reviews
   where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0;
  if v_status = 'hidden' then raise notice 'PASS hide sets hidden';
  else raise warning 'FAIL after hide status %', v_status; end if;
end $$;

-- 23. Hidden review and its photos are invisible to anon
select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ declare v_n integer; v_ph integer; begin
  select count(*) into v_n from public_service_reviews
   where id = (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0);
  select count(*) into v_ph from review_photos
   where review_id = (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0);
  if v_n = 0 and v_ph = 0 then raise notice 'PASS hidden review and photos not public';
  else raise warning 'FAIL anon sees hidden review rows %, photos %', v_n, v_ph; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', ':ADMIN_ID', 'role', 'authenticated')::text, true);
set local role authenticated;
select moderate_review(
  (select id from reviews where appointment_id = '00000000-0000-4000-8000-000000000051' and target_type = 'service' and service_position = 0),
  'show', null);
reset role;

-- 24. Completing a booking creates exactly one review_request notification
insert into appointments (id, booking_code, branch_id, client_id, professional_id, appointment_type,
                          scheduled_date, start_time, duration_minutes, status, notes)
values ('00000000-0000-4000-8000-000000000053', 'CHK053', ':BRANCH_ID', ':CLIENT_ID', ':STAFF_ID', 'solo',
        current_date, '12:00', 60, 'confirmed', 'Check Service with Tester — ₱1.00');
update appointments set session_status = 'completed' where id = '00000000-0000-4000-8000-000000000053';
do $$ declare v_n integer; v_ok integer; begin
  select count(*), count(*) filter (where link_path = '/my-glow?review=' || appointment_id)
    into v_n, v_ok from client_notifications
   where appointment_id = '00000000-0000-4000-8000-000000000053' and kind = 'review_request';
  if v_n = 1 and v_ok = 1 then raise notice 'PASS one review_request notification with link';
  else raise warning 'FAIL review_request rows %, correct links %', v_n, v_ok; end if;
end $$;
update appointments set status = 'completed' where id = '00000000-0000-4000-8000-000000000053';
do $$ declare v_n integer; begin
  select count(*) into v_n from client_notifications
   where appointment_id = '00000000-0000-4000-8000-000000000053' and kind = 'review_request';
  if v_n = 1 then raise notice 'PASS still one review_request after status also completed';
  else raise warning 'FAIL review_request rows after second update %', v_n; end if;
end $$;

-- 25. Storage policies: expect 4 rows listed
select policyname from pg_policies where tablename = 'objects' and policyname like '%review photos%';

rollback;
