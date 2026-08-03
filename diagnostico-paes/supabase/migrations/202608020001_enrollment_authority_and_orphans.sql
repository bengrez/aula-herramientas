begin;

-- This migration supersedes the original submission RPC before any pilot is enabled.
drop function if exists api.submit_session_v1(text, uuid, text, text, text, text, text, timestamptz, timestamptz, jsonb);
drop function if exists private.submit_session_v1_internal(text, uuid, text, text, text, text, text, timestamptz, timestamptz, jsonb);

alter table private.session_attempts
  alter column enrollment_code_id drop not null,
  add column submitted_code_hash bytea,
  add column reconciliation_status text not null default 'matched'
    check (reconciliation_status in ('matched', 'orphaned', 'resolved'));

update private.session_attempts sa
set submitted_code_hash = ec.code_hash
from private.enrollment_codes ec
where ec.enrollment_code_id = sa.enrollment_code_id;

alter table private.session_attempts
  alter column submitted_code_hash set not null;

create or replace function private.enroll_session_v1_internal(
  p_enrollment_code text,
  p_administration_id text,
  p_session_template_id text,
  p_session_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  administration private.administrations%rowtype;
  code_row private.enrollment_codes%rowtype;
  was_bound boolean;
  normalized_code text;
begin
  if caller_id is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception using errcode = '42501', message = 'anonymous_auth_required';
  end if;

  select * into administration
  from private.administrations a
  where a.administration_id = p_administration_id
    and a.session_template_id = p_session_template_id
    and a.session_version = p_session_version
    and a.enabled
    and (a.sync_not_before is null or clock_timestamp() >= a.sync_not_before)
    and (a.sync_not_after is null or clock_timestamp() <= a.sync_not_after)
  for share;
  if not found then raise exception using errcode = '22023', message = 'enrollment_not_accepted'; end if;

  if not private.valid_enrollment_code(
    p_enrollment_code,
    administration.code_alphabet,
    administration.code_payload_length,
    administration.code_multiplier
  ) then
    raise exception using errcode = '22023', message = 'enrollment_not_accepted';
  end if;
  normalized_code := private.normalize_enrollment_code(p_enrollment_code);

  select ec.* into code_row
  from private.enrollment_codes ec
  join private.session_authorizations sa using (enrollment_code_id)
  where sa.administration_id = administration.administration_id
    and ec.code_hash = extensions.digest(normalized_code, 'sha256')
  for update of ec;
  if not found
     or not code_row.enabled
     or (code_row.valid_from is not null and clock_timestamp() < code_row.valid_from)
     or (code_row.valid_until is not null and clock_timestamp() > code_row.valid_until)
     or (code_row.bound_auth_user_id is not null and code_row.bound_auth_user_id <> caller_id) then
    raise exception using errcode = '22023', message = 'enrollment_not_accepted';
  end if;

  was_bound := code_row.bound_auth_user_id = caller_id;
  update private.enrollment_codes
  set bound_auth_user_id = caller_id
  where enrollment_code_id = code_row.enrollment_code_id
    and (bound_auth_user_id is null or bound_auth_user_id = caller_id);
  if not found then raise exception using errcode = '22023', message = 'enrollment_not_accepted'; end if;

  return jsonb_build_object('status', case when was_bound then 'already_confirmed' else 'confirmed' end);
end;
$$;

create or replace function api.enroll_session_v1(
  p_enrollment_code text,
  p_administration_id text,
  p_session_template_id text,
  p_session_version text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.enroll_session_v1_internal(
    p_enrollment_code,
    p_administration_id,
    p_session_template_id,
    p_session_version
  );
$$;

create or replace function private.submit_session_v1_internal(
  p_enrollment_code text,
  p_attempt_id uuid,
  p_administration_id text,
  p_session_template_id text,
  p_session_version text,
  p_framework_id text,
  p_framework_version text,
  p_enrollment_status text,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_responses_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  administration private.administrations%rowtype;
  code_row private.enrollment_codes%rowtype;
  existing_attempt private.session_attempts%rowtype;
  normalized_code text;
  submitted_hash bytea;
  expected_count integer;
  supplied_count integer;
  payload_hash bytea;
  invalid_count integer;
  submission_source text;
  receipt_status text;
begin
  if caller_id is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception using errcode = '42501', message = 'anonymous_auth_required';
  end if;

  select * into administration
  from private.administrations a
  where a.administration_id = p_administration_id
    and a.session_template_id = p_session_template_id
    and a.session_version = p_session_version
  for share;
  if not found then raise exception using errcode = '22023', message = 'administration_inactive'; end if;

  if not private.valid_enrollment_code(
    p_enrollment_code,
    administration.code_alphabet,
    administration.code_payload_length,
    administration.code_multiplier
  ) then
    raise exception using errcode = '22023', message = 'invalid_enrollment_code';
  end if;
  if p_enrollment_status not in ('confirmed', 'provisional') then
    raise exception using errcode = '22023', message = 'invalid_enrollment_status';
  end if;
  normalized_code := private.normalize_enrollment_code(p_enrollment_code);
  submitted_hash := extensions.digest(normalized_code, 'sha256');

  payload_hash := extensions.digest(convert_to(jsonb_build_object(
    'attempt_id', p_attempt_id,
    'administration_id', p_administration_id,
    'session_template_id', p_session_template_id,
    'session_version', p_session_version,
    'framework_id', p_framework_id,
    'framework_version', p_framework_version,
    'enrollment_status', p_enrollment_status,
    'started_at', p_started_at,
    'completed_at', p_completed_at,
    'responses', p_responses_json
  )::text, 'UTF8'), 'sha256');

  -- Exact retries remain available after mutable gates close and without the original Auth session.
  select * into existing_attempt from private.session_attempts where attempt_id = p_attempt_id;
  if found then
    if existing_attempt.payload_hash = payload_hash
       and existing_attempt.submitted_code_hash = submitted_hash then
      receipt_status := case
        when existing_attempt.reconciliation_status = 'orphaned' then 'already_orphaned'
        else 'already_synced'
      end;
      return jsonb_build_object('status', receipt_status, 'attempt_id', p_attempt_id, 'received_at', existing_attempt.received_at);
    end if;
    raise exception using errcode = '23505', message = 'attempt_id_payload_conflict';
  end if;

  if not administration.enabled then raise exception using errcode = '22023', message = 'administration_inactive'; end if;
  if administration.sync_not_before is not null and clock_timestamp() < administration.sync_not_before then raise exception using errcode = '22023', message = 'sync_window_not_open'; end if;
  if administration.sync_not_after is not null and clock_timestamp() > administration.sync_not_after then raise exception using errcode = '22023', message = 'sync_window_closed'; end if;

  if not exists (
    select 1
    from private.session_templates st
    where st.session_template_id = p_session_template_id
      and st.session_version = p_session_version
      and st.framework_id = p_framework_id
      and st.framework_version = p_framework_version
  ) then
    raise exception using errcode = '22023', message = 'session_framework_mismatch';
  end if;

  if jsonb_typeof(p_responses_json) <> 'array' then raise exception using errcode = '22023', message = 'responses_must_be_array'; end if;
  select count(*) into expected_count
  from private.session_items si
  where si.session_template_id = p_session_template_id
    and si.session_version = p_session_version
    and si.framework_id = p_framework_id
    and si.framework_version = p_framework_version;
  supplied_count := jsonb_array_length(p_responses_json);
  if supplied_count <> expected_count then raise exception using errcode = '22023', message = 'incomplete_response_set'; end if;

  select case when count(distinct response ->> 'source') = 1 then min(response ->> 'source') end
  into submission_source
  from jsonb_array_elements(p_responses_json) response;
  if submission_source is null or submission_source not in ('device', 'paper') then
    raise exception using errcode = '22023', message = 'invalid_submission_source';
  end if;
  if p_completed_at is null
     or (submission_source = 'device' and (p_started_at is null or p_completed_at < p_started_at))
     or (submission_source = 'paper' and p_started_at is not null) then
    raise exception using errcode = '22023', message = 'invalid_submission_timestamps';
  end if;

  with supplied as (
    select *
    from jsonb_to_recordset(p_responses_json) as r(
      response_id uuid,
      item_id text,
      item_version text,
      selected_option text,
      omitted boolean,
      response_time_ms integer,
      presentation_order smallint,
      client_recorded_at timestamptz,
      source text
    )
  )
  select count(*) into invalid_count
  from supplied r
  left join private.session_items si
    on si.session_template_id = p_session_template_id
   and si.session_version = p_session_version
   and si.framework_id = p_framework_id
   and si.framework_version = p_framework_version
   and si.item_id = r.item_id
   and si.item_version = r.item_version
   and si.presentation_order = r.presentation_order
  left join private.items i
    on i.framework_id = p_framework_id
   and i.framework_version = p_framework_version
   and i.item_id = r.item_id
   and i.item_version = r.item_version
  where r.response_id is null
     or si.item_id is null
     or i.item_id is null
     or r.omitted is null
     or not ((r.selected_option is null and r.omitted) or (r.selected_option is not null and not r.omitted))
     or (submission_source = 'device' and (r.response_time_ms is null or r.response_time_ms < 0 or r.response_time_ms > 3600000))
     or (submission_source = 'paper' and r.response_time_ms is not null)
     or r.client_recorded_at is null
     or r.source is distinct from submission_source
     or (r.selected_option is not null and not exists (
       select 1 from jsonb_array_elements(i.alternatives) alternative
       where alternative ->> 'id' = r.selected_option
     ));
  if invalid_count <> 0 then raise exception using errcode = '22023', message = 'invalid_response_payload'; end if;

  if (select count(distinct r ->> 'response_id') from jsonb_array_elements(p_responses_json) r) <> supplied_count
     or (select count(distinct r ->> 'item_id') from jsonb_array_elements(p_responses_json) r) <> supplied_count
     or (select count(distinct r ->> 'presentation_order') from jsonb_array_elements(p_responses_json) r) <> supplied_count then
    raise exception using errcode = '22023', message = 'duplicate_response_fields';
  end if;

  select ec.* into code_row
  from private.enrollment_codes ec
  join private.session_authorizations sa using (enrollment_code_id)
  where sa.administration_id = administration.administration_id
    and ec.code_hash = submitted_hash
  for update of ec;

  if found then
    if not code_row.enabled
       or (code_row.valid_from is not null and clock_timestamp() < code_row.valid_from)
       or (code_row.valid_until is not null and clock_timestamp() > code_row.valid_until)
       or (code_row.bound_auth_user_id is not null and code_row.bound_auth_user_id <> caller_id) then
      raise exception using errcode = '42501', message = 'enrollment_not_accepted';
    end if;
    if exists (
      select 1 from private.session_attempts sa
      where sa.enrollment_code_id = code_row.enrollment_code_id
        and sa.administration_id = p_administration_id
    ) then
      raise exception using errcode = '23505', message = 'administration_already_completed';
    end if;
    update private.enrollment_codes
    set bound_auth_user_id = caller_id,
        used_at = coalesce(used_at, clock_timestamp())
    where enrollment_code_id = code_row.enrollment_code_id;
    receipt_status := 'synced';
  else
    if p_enrollment_status <> 'provisional' then
      raise exception using errcode = '22023', message = 'enrollment_not_accepted';
    end if;
    receipt_status := 'orphaned';
  end if;

  insert into private.session_attempts (
    attempt_id, enrollment_code_id, submitted_code_hash, reconciliation_status,
    administration_id, auth_user_id, session_template_id, session_version,
    framework_id, framework_version, client_started_at, client_completed_at,
    payload_hash, source
  ) values (
    p_attempt_id,
    code_row.enrollment_code_id,
    submitted_hash,
    case when code_row.enrollment_code_id is null then 'orphaned' else 'matched' end,
    p_administration_id,
    caller_id,
    p_session_template_id,
    p_session_version,
    p_framework_id,
    p_framework_version,
    p_started_at,
    p_completed_at,
    payload_hash,
    submission_source
  ) returning * into existing_attempt;

  insert into private.responses (
    response_id, attempt_id, framework_id, framework_version,
    item_id, item_version, selected_option, omitted, response_time_ms,
    presentation_order, client_recorded_at, source
  )
  select
    r.response_id, p_attempt_id, p_framework_id, p_framework_version,
    r.item_id, r.item_version, r.selected_option, r.omitted, r.response_time_ms,
    r.presentation_order, r.client_recorded_at, submission_source
  from jsonb_to_recordset(p_responses_json) as r(
    response_id uuid,
    item_id text,
    item_version text,
    selected_option text,
    omitted boolean,
    response_time_ms integer,
    presentation_order smallint,
    client_recorded_at timestamptz,
    source text
  );

  return jsonb_build_object('status', receipt_status, 'attempt_id', p_attempt_id, 'received_at', existing_attempt.received_at);
end;
$$;

create or replace function api.submit_session_v1(
  p_enrollment_code text,
  p_attempt_id uuid,
  p_administration_id text,
  p_session_template_id text,
  p_session_version text,
  p_framework_id text,
  p_framework_version text,
  p_enrollment_status text,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_responses_json jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.submit_session_v1_internal(
    p_enrollment_code,
    p_attempt_id,
    p_administration_id,
    p_session_template_id,
    p_session_version,
    p_framework_id,
    p_framework_version,
    p_enrollment_status,
    p_started_at,
    p_completed_at,
    p_responses_json
  );
$$;

create or replace function private.reconcile_orphaned_attempt(
  p_attempt_id uuid,
  p_enrollment_code_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  orphan private.session_attempts%rowtype;
begin
  select * into orphan
  from private.session_attempts
  where attempt_id = p_attempt_id
    and reconciliation_status = 'orphaned'
    and enrollment_code_id is null
  for update;
  if not found then raise exception using errcode = '22023', message = 'orphan_not_found'; end if;

  if not exists (
    select 1
    from private.session_authorizations sa
    join private.enrollment_codes ec using (enrollment_code_id)
    where sa.administration_id = orphan.administration_id
      and ec.enrollment_code_id = p_enrollment_code_id
      and ec.enabled
  ) then
    raise exception using errcode = '22023', message = 'reconciliation_target_invalid';
  end if;
  if exists (
    select 1 from private.session_attempts sa
    where sa.enrollment_code_id = p_enrollment_code_id
      and sa.administration_id = orphan.administration_id
  ) then
    raise exception using errcode = '23505', message = 'reconciliation_target_already_used';
  end if;

  update private.session_attempts
  set enrollment_code_id = p_enrollment_code_id,
      reconciliation_status = 'resolved'
  where attempt_id = p_attempt_id;
end;
$$;

drop view private.raw_response_export_v1;
create view private.raw_response_export_v1
with (security_invoker = true)
as
select
  r.response_id,
  r.attempt_id,
  ec.participant_ref,
  sa.reconciliation_status,
  sa.administration_id,
  sa.session_template_id,
  sa.session_version,
  r.framework_id,
  r.framework_version,
  r.item_id,
  r.item_version,
  r.selected_option,
  r.omitted,
  r.response_time_ms,
  r.presentation_order,
  r.client_recorded_at,
  r.server_received_at,
  r.source
from private.responses r
join private.session_attempts sa using (attempt_id)
left join private.enrollment_codes ec using (enrollment_code_id);

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all functions in schema api from public, anon, authenticated;
revoke all on private.raw_response_export_v1 from public, anon, authenticated;
grant execute on function api.enroll_session_v1(text, text, text, text) to authenticated;
grant execute on function api.submit_session_v1(text, uuid, text, text, text, text, text, text, timestamptz, timestamptz, jsonb) to authenticated;

comment on column private.session_attempts.submitted_code_hash is 'Hash del código presentado; permite conciliación sin almacenar códigos desconocidos en claro.';
comment on column private.session_attempts.reconciliation_status is 'matched, orphaned o resolved. No es un resultado diagnóstico.';
comment on view private.raw_response_export_v1 is 'Exportación administrativa cruda, incluidos huérfanos con participant_ref nulo. Solo roles de administración.';

commit;
