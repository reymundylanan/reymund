-- 087_review_rewards_per_client.sql
-- Requires 052. Admin can turn the AI GlowPoints scorer off (and back on)
-- for one client. While it's off, that client's reviews are still saved
-- and shown, but the AI doesn't grade them and no points are given
-- (status "skipped"). Points already earned stay, and redeeming is unchanged.
-- The switch for everyone is still review_reward_settings.enabled.

create table if not exists review_reward_paused_clients (
  client_id uuid primary key references profiles(id) on delete cascade,
  reason text check (reason is null or length(reason) <= 300),
  paused_by uuid references profiles(id) on delete set null,
  paused_at timestamptz not null default now()
);

alter table review_reward_paused_clients enable row level security;
drop policy if exists "read paused review rewards" on review_reward_paused_clients;
create policy "read paused review rewards" on review_reward_paused_clients for select using (
  client_id = auth.uid() or coalesce(public.current_user_role()::text, '') = 'admin'
);
revoke insert, update, delete on review_reward_paused_clients from anon, authenticated;
grant select on review_reward_paused_clients to authenticated;

-- Admin only: p_enabled false pauses the client, true turns it back on.
create or replace function set_client_review_rewards(p_client uuid, p_enabled boolean, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'REVIEW_FORBIDDEN';
  end if;
  if p_client is null or p_enabled is null or not exists (select 1 from profiles where id = p_client) then
    raise exception 'REVIEW_INVALID';
  end if;
  if p_enabled then
    delete from review_reward_paused_clients where client_id = p_client;
  else
    insert into review_reward_paused_clients (client_id, reason, paused_by, paused_at)
    values (p_client, left(v_reason, 300), auth.uid(), now())
    on conflict (client_id) do update
      set reason = excluded.reason, paused_by = excluded.paused_by, paused_at = excluded.paused_at;
  end if;
end;
$$;

revoke execute on function set_client_review_rewards(uuid, boolean, text) from public, anon;
grant execute on function set_client_review_rewards(uuid, boolean, text) to authenticated;

-- New reviews: skipped when rewards are off for everyone or for this client.
create or replace function start_review_evaluation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_enabled boolean;
begin
  if new.target_type <> 'service' or new.appointment_id is null or new.client_id is null
     or new.first_submitted_at is distinct from now() then
    return new;
  end if;
  select enabled into v_enabled from review_reward_settings where id = 1;
  if exists (select 1 from review_reward_paused_clients where client_id = new.client_id) then
    v_enabled := false;
  end if;
  insert into review_evaluations (appointment_id, client_id, status)
  values (new.appointment_id, new.client_id, case when coalesce(v_enabled, false) then 'pending' else 'skipped' end)
  on conflict (appointment_id) do nothing;
  return new;
end;
$$;

-- Reviews still waiting when the client is paused: skipped, not graded
-- (same body as 052 plus the paused check).
create or replace function claim_review_evaluation(p_appointment_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_eval review_evaluations;
  v_parts jsonb;
begin
  select * into v_eval from review_evaluations where appointment_id = p_appointment_id for update skip locked;
  if v_eval.id is null or v_eval.status not in ('pending', 'failed') then
    return null;
  end if;
  if exists (select 1 from review_reward_paused_clients where client_id = v_eval.client_id) then
    update review_evaluations
       set status = 'skipped', last_error = 'AI GlowPoints are turned off for this client.'
     where id = v_eval.id;
    return null;
  end if;
  if v_eval.attempts >= 5 then
    update review_evaluations set status = 'failed' where id = v_eval.id;
    return null;
  end if;
  update review_evaluations
     set attempts = attempts + 1, status = 'pending', next_attempt_at = now() + interval '5 minutes'
   where id = v_eval.id;

  select jsonb_agg(jsonb_build_object(
           'target', r.target_type,
           'position', r.service_position,
           'service', coalesce(x.service_name, s.name),
           'rating', r.rating,
           'text', r.text,
           'tags', to_jsonb(r.tags),
           'photos', coalesce((select jsonb_agg(ph.storage_path order by ph.position)
                                 from review_photos ph where ph.review_id = r.id), '[]'::jsonb))
         order by r.target_type desc, r.service_position)
    into v_parts
    from reviews r
    left join appointment_services x
      on r.target_type = 'service' and x.appointment_id = r.appointment_id and x.position = r.service_position
    left join branch_services s on s.id = r.service_id
   where r.appointment_id = p_appointment_id and r.status <> 'removed';

  return jsonb_build_object('evaluationId', v_eval.id, 'appointmentId', p_appointment_id,
                            'parts', coalesce(v_parts, '[]'::jsonb));
end;
$$;

revoke execute on function start_review_evaluation() from public, anon, authenticated;
revoke execute on function claim_review_evaluation(uuid) from public, anon, authenticated;
grant execute on function claim_review_evaluation(uuid) to service_role;
