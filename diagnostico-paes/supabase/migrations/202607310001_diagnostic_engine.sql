-- Diagnostic engine v1 — raw-response storage only.
-- Apply from Supabase SQL Editor or CLI as an owner role.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
create schema if not exists api;

revoke all on schema private from public, anon, authenticated;
revoke all on schema api from public, anon, authenticated;
grant usage on schema api to authenticated;

-- Treat both schemas as closed security boundaries, including when they already exist.
-- Explicit revocations protect reused projects; default privileges protect later objects
-- created by the role applying this migration.
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all tables in schema api from public, anon, authenticated;
revoke all on all sequences in schema api from public, anon, authenticated;
revoke all on all functions in schema api from public, anon, authenticated;

alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private revoke all on functions from public, anon, authenticated;
alter default privileges in schema api revoke all on tables from public, anon, authenticated;
alter default privileges in schema api revoke all on sequences from public, anon, authenticated;
alter default privileges in schema api revoke all on functions from public, anon, authenticated;

create table private.framework_versions (
  framework_id text not null,
  framework_version text not null,
  title text not null,
  status text not null check (status in ('draft', 'active', 'archived')),
  source_url text,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  primary key (framework_id, framework_version)
);

create table private.abilities (
  framework_id text not null,
  framework_version text not null,
  ability_code text not null,
  label text not null,
  description text,
  position smallint not null check (position > 0),
  primary key (framework_id, framework_version, ability_code),
  foreign key (framework_id, framework_version)
    references private.framework_versions (framework_id, framework_version)
    on update cascade on delete restrict
);

create table private.criteria (
  framework_id text not null,
  framework_version text not null,
  criterion_code text not null,
  ability_code text not null,
  public_label text not null,
  description text not null,
  focus_priority smallint not null default 999 check (focus_priority > 0),
  position smallint not null check (position > 0),
  metadata jsonb not null default '{}'::jsonb,
  primary key (framework_id, framework_version, criterion_code),
  foreign key (framework_id, framework_version, ability_code)
    references private.abilities (framework_id, framework_version, ability_code)
    on update cascade on delete restrict
);

create table private.axes (
  framework_id text not null,
  framework_version text not null,
  axis_code text not null,
  label text not null,
  position smallint not null check (position > 0),
  primary key (framework_id, framework_version, axis_code),
  foreign key (framework_id, framework_version)
    references private.framework_versions (framework_id, framework_version)
    on update cascade on delete restrict
);

create table private.areas (
  framework_id text not null,
  framework_version text not null,
  area_code text not null,
  axis_code text not null,
  label text not null,
  position smallint not null check (position > 0),
  primary key (framework_id, framework_version, area_code),
  foreign key (framework_id, framework_version, axis_code)
    references private.axes (framework_id, framework_version, axis_code)
    on update cascade on delete restrict
);

create table private.units (
  framework_id text not null,
  framework_version text not null,
  unit_code text not null,
  area_code text not null,
  label text not null,
  diagnostic_operation text not null,
  diagnostic_priority text not null check (diagnostic_priority in ('alta', 'media', 'diferida')),
  metadata jsonb not null default '{}'::jsonb,
  position smallint not null check (position > 0),
  primary key (framework_id, framework_version, unit_code),
  foreign key (framework_id, framework_version, area_code)
    references private.areas (framework_id, framework_version, area_code)
    on update cascade on delete restrict
);

create table private.unit_prerequisites (
  framework_id text not null,
  framework_version text not null,
  unit_code text not null,
  prerequisite_unit_code text not null,
  primary key (framework_id, framework_version, unit_code, prerequisite_unit_code),
  foreign key (framework_id, framework_version, unit_code)
    references private.units (framework_id, framework_version, unit_code)
    on update cascade on delete restrict,
  foreign key (framework_id, framework_version, prerequisite_unit_code)
    references private.units (framework_id, framework_version, unit_code)
    on update cascade on delete restrict,
  check (unit_code <> prerequisite_unit_code)
);

create table private.item_banks (
  bank_id text not null,
  bank_version text not null,
  framework_id text not null,
  framework_version text not null,
  status text not null check (status in ('placeholder', 'review', 'active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  primary key (bank_id, bank_version),
  unique (bank_id, bank_version, framework_id, framework_version),
  foreign key (framework_id, framework_version)
    references private.framework_versions (framework_id, framework_version)
    on update cascade on delete restrict
);

create table private.items (
  framework_id text not null,
  framework_version text not null,
  item_id text not null,
  item_version text not null,
  unit_code text not null,
  criterion_code text not null,
  axis_code text not null,
  stimulus_format text not null,
  stimulus jsonb not null,
  prompt text not null,
  alternatives jsonb not null check (jsonb_typeof(alternatives) = 'array' and jsonb_array_length(alternatives) >= 2),
  answer_key text not null,
  answer_key_status text not null check (answer_key_status in ('ok', 'discutible')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  primary key (framework_id, framework_version, item_id, item_version),
  foreign key (framework_id, framework_version, unit_code)
    references private.units (framework_id, framework_version, unit_code)
    on update cascade on delete restrict,
  foreign key (framework_id, framework_version, criterion_code)
    references private.criteria (framework_id, framework_version, criterion_code)
    on update cascade on delete restrict,
  foreign key (framework_id, framework_version, axis_code)
    references private.axes (framework_id, framework_version, axis_code)
    on update cascade on delete restrict
);

create table private.bank_items (
  bank_id text not null,
  bank_version text not null,
  framework_id text not null,
  framework_version text not null,
  item_id text not null,
  item_version text not null,
  position integer not null check (position > 0),
  primary key (bank_id, bank_version, item_id, item_version),
  unique (bank_id, bank_version, position),
  foreign key (bank_id, bank_version, framework_id, framework_version)
    references private.item_banks (bank_id, bank_version, framework_id, framework_version)
    on update cascade on delete restrict,
  foreign key (framework_id, framework_version, item_id, item_version)
    references private.items (framework_id, framework_version, item_id, item_version)
    on update cascade on delete restrict
);

create table private.session_templates (
  session_template_id text not null,
  session_version text not null,
  framework_id text not null,
  framework_version text not null,
  bank_id text not null,
  bank_version text not null,
  session_type text not null,
  rules jsonb not null default '{}'::jsonb,
  status text not null check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (session_template_id, session_version),
  unique (session_template_id, session_version, framework_id, framework_version),
  unique (
    session_template_id, session_version,
    framework_id, framework_version,
    bank_id, bank_version
  ),
  foreign key (framework_id, framework_version)
    references private.framework_versions (framework_id, framework_version)
    on update cascade on delete restrict,
  foreign key (bank_id, bank_version, framework_id, framework_version)
    references private.item_banks (bank_id, bank_version, framework_id, framework_version)
    on update cascade on delete restrict
);

create table private.session_items (
  session_template_id text not null,
  session_version text not null,
  framework_id text not null,
  framework_version text not null,
  bank_id text not null,
  bank_version text not null,
  item_id text not null,
  item_version text not null,
  presentation_order smallint not null check (presentation_order > 0),
  primary key (session_template_id, session_version, item_id, item_version),
  unique (session_template_id, session_version, presentation_order),
  foreign key (
    session_template_id, session_version,
    framework_id, framework_version,
    bank_id, bank_version
  ) references private.session_templates (
    session_template_id, session_version,
    framework_id, framework_version,
    bank_id, bank_version
  )
    on update cascade on delete restrict,
  foreign key (bank_id, bank_version, item_id, item_version)
    references private.bank_items (bank_id, bank_version, item_id, item_version)
    on update cascade on delete restrict,
  foreign key (framework_id, framework_version, item_id, item_version)
    references private.items (framework_id, framework_version, item_id, item_version)
    on update cascade on delete restrict
);

create table private.administrations (
  administration_id text primary key,
  session_template_id text not null,
  session_version text not null,
  enabled boolean not null default false,
  target_date date,
  code_alphabet text not null,
  code_payload_length smallint not null check (code_payload_length >= 3),
  code_multiplier smallint not null check (code_multiplier >= 2),
  sync_not_before timestamptz,
  sync_not_after timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (administration_id, session_template_id, session_version),
  foreign key (session_template_id, session_version)
    references private.session_templates (session_template_id, session_version)
    on update cascade on delete restrict
);

create table private.enrollment_codes (
  enrollment_code_id uuid primary key,
  participant_ref uuid not null unique,
  code_hash bytea not null unique,
  enabled boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  bound_auth_user_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  used_at timestamptz
);

create table private.session_authorizations (
  enrollment_code_id uuid not null references private.enrollment_codes (enrollment_code_id) on delete restrict,
  administration_id text not null references private.administrations (administration_id) on delete restrict,
  primary key (enrollment_code_id, administration_id)
);

create table private.session_attempts (
  attempt_id uuid primary key,
  enrollment_code_id uuid not null references private.enrollment_codes (enrollment_code_id) on delete restrict,
  administration_id text not null,
  auth_user_id uuid not null,
  session_template_id text not null,
  session_version text not null,
  framework_id text not null,
  framework_version text not null,
  client_started_at timestamptz,
  client_completed_at timestamptz not null,
  payload_hash bytea not null,
  source text not null check (source in ('device', 'paper')),
  received_at timestamptz not null default clock_timestamp(),
  unique (enrollment_code_id, administration_id),
  unique (attempt_id, framework_id, framework_version),
  foreign key (administration_id, session_template_id, session_version)
    references private.administrations (
      administration_id, session_template_id, session_version
    )
    on update cascade on delete restrict,
  foreign key (session_template_id, session_version, framework_id, framework_version)
    references private.session_templates (
      session_template_id, session_version, framework_id, framework_version
    )
    on update cascade on delete restrict
);

create table private.responses (
  response_id uuid primary key,
  attempt_id uuid not null,
  framework_id text not null,
  framework_version text not null,
  item_id text not null,
  item_version text not null,
  selected_option text,
  omitted boolean not null,
  response_time_ms integer,
  presentation_order smallint not null check (presentation_order > 0),
  client_recorded_at timestamptz,
  server_received_at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('device', 'paper')),
  unique (attempt_id, item_id, item_version),
  unique (attempt_id, presentation_order),
  check ((selected_option is null and omitted) or (selected_option is not null and not omitted)),
  check (response_time_ms is null or response_time_ms between 0 and 3600000),
  foreign key (attempt_id, framework_id, framework_version)
    references private.session_attempts (attempt_id, framework_id, framework_version)
    on update cascade on delete restrict,
  foreign key (framework_id, framework_version, item_id, item_version)
    references private.items (framework_id, framework_version, item_id, item_version)
    on update cascade on delete restrict
);

-- RLS remains a second line of defense; table privileges are also revoked below.
alter table private.framework_versions enable row level security;
alter table private.abilities enable row level security;
alter table private.criteria enable row level security;
alter table private.axes enable row level security;
alter table private.areas enable row level security;
alter table private.units enable row level security;
alter table private.unit_prerequisites enable row level security;
alter table private.item_banks enable row level security;
alter table private.items enable row level security;
alter table private.bank_items enable row level security;
alter table private.session_templates enable row level security;
alter table private.session_items enable row level security;
alter table private.administrations enable row level security;
alter table private.enrollment_codes enable row level security;
alter table private.session_authorizations enable row level security;
alter table private.session_attempts enable row level security;
alter table private.responses enable row level security;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

create or replace function private.normalize_enrollment_code(raw_code text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select upper(regexp_replace(normalize(raw_code, NFKC), '[[:space:]-]+', '', 'g'));
$$;

create or replace function private.valid_enrollment_code(
  raw_code text,
  alphabet text,
  payload_length integer,
  multiplier integer
)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  normalized_code text := private.normalize_enrollment_code(raw_code);
  accumulator integer := 0;
  alphabet_length integer := char_length(alphabet);
  character_position integer;
  index integer;
  expected_character text;
begin
  if char_length(normalized_code) <> payload_length + 1 or alphabet_length < 2 then
    return false;
  end if;
  for index in 1..payload_length loop
    character_position := strpos(alphabet, substr(normalized_code, index, 1));
    if character_position = 0 then return false; end if;
    accumulator := (accumulator * multiplier + character_position) % alphabet_length;
  end loop;
  expected_character := substr(alphabet, ((alphabet_length - accumulator) % alphabet_length) + 1, 1);
  return substr(normalized_code, payload_length + 1, 1) = expected_character;
end;
$$;

create or replace function private.submit_session_v1_internal(
  p_enrollment_code text,
  p_attempt_id uuid,
  p_administration_id text,
  p_session_template_id text,
  p_session_version text,
  p_framework_id text,
  p_framework_version text,
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
  expected_count integer;
  supplied_count integer;
  payload_hash bytea;
  invalid_count integer;
  submission_source text;
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

  if not private.valid_enrollment_code(p_enrollment_code, administration.code_alphabet, administration.code_payload_length, administration.code_multiplier) then
    raise exception using errcode = '22023', message = 'invalid_enrollment_code';
  end if;
  normalized_code := private.normalize_enrollment_code(p_enrollment_code);

  select ec.* into code_row
  from private.enrollment_codes ec
  join private.session_authorizations sa using (enrollment_code_id)
  where sa.administration_id = administration.administration_id
    and ec.code_hash = extensions.digest(normalized_code, 'sha256')
  for update of ec;
  if not found then raise exception using errcode = '22023', message = 'enrollment_code_inactive'; end if;

  -- A committed attempt is immutable. An exact retry may acknowledge it after the
  -- administration closes, the code expires, or the local anonymous Auth identity is lost.
  -- It must still present the authorized code, attempt id, and byte-equivalent JSON payload.
  payload_hash := extensions.digest(convert_to(jsonb_build_object(
    'attempt_id', p_attempt_id,
    'administration_id', p_administration_id,
    'session_template_id', p_session_template_id,
    'session_version', p_session_version,
    'framework_id', p_framework_id,
    'framework_version', p_framework_version,
    'started_at', p_started_at,
    'completed_at', p_completed_at,
    'responses', p_responses_json
  )::text, 'UTF8'), 'sha256');

  select * into existing_attempt from private.session_attempts where attempt_id = p_attempt_id;
  if found then
    if existing_attempt.payload_hash = payload_hash and existing_attempt.enrollment_code_id = code_row.enrollment_code_id then
      return jsonb_build_object('status', 'already_synced', 'attempt_id', p_attempt_id, 'received_at', existing_attempt.received_at);
    end if;
    raise exception using errcode = '23505', message = 'attempt_id_payload_conflict';
  end if;

  if not administration.enabled then raise exception using errcode = '22023', message = 'administration_inactive'; end if;
  if administration.sync_not_before is not null and clock_timestamp() < administration.sync_not_before then raise exception using errcode = '22023', message = 'sync_window_not_open'; end if;
  if administration.sync_not_after is not null and clock_timestamp() > administration.sync_not_after then raise exception using errcode = '22023', message = 'sync_window_closed'; end if;
  if not code_row.enabled then raise exception using errcode = '22023', message = 'enrollment_code_inactive'; end if;
  if code_row.valid_from is not null and clock_timestamp() < code_row.valid_from then raise exception using errcode = '22023', message = 'enrollment_code_not_yet_valid'; end if;
  if code_row.valid_until is not null and clock_timestamp() > code_row.valid_until then raise exception using errcode = '22023', message = 'enrollment_code_expired'; end if;

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

  -- A new attempt remains bound to the original anonymous identity.
  if code_row.bound_auth_user_id is not null and code_row.bound_auth_user_id <> caller_id then
    raise exception using errcode = '42501', message = 'enrollment_code_bound_to_another_device';
  end if;

  if exists (
    select 1 from private.session_attempts sa
    where sa.enrollment_code_id = code_row.enrollment_code_id and sa.administration_id = p_administration_id
  ) then
    raise exception using errcode = '23505', message = 'administration_already_completed';
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

  update private.enrollment_codes
  set bound_auth_user_id = caller_id,
      used_at = coalesce(used_at, clock_timestamp())
  where enrollment_code_id = code_row.enrollment_code_id;

  insert into private.session_attempts (
    attempt_id, enrollment_code_id, administration_id, auth_user_id,
    session_template_id, session_version, framework_id, framework_version,
    client_started_at, client_completed_at, payload_hash, source
  ) values (
    p_attempt_id, code_row.enrollment_code_id, p_administration_id, caller_id,
    p_session_template_id, p_session_version, p_framework_id, p_framework_version,
    p_started_at, p_completed_at, payload_hash, submission_source
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

  return jsonb_build_object('status', 'synced', 'attempt_id', p_attempt_id, 'received_at', existing_attempt.received_at);
end;
$$;

-- The exposed wrapper is a minimal security-definer bridge; privileged logic remains outside the
-- exposed schema and the client role cannot execute the internal function directly.
create or replace function api.submit_session_v1(
  p_enrollment_code text,
  p_attempt_id uuid,
  p_administration_id text,
  p_session_template_id text,
  p_session_version text,
  p_framework_id text,
  p_framework_version text,
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
    p_started_at,
    p_completed_at,
    p_responses_json
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all functions in schema api from public, anon, authenticated;
grant execute on function api.submit_session_v1(text, uuid, text, text, text, text, text, timestamptz, timestamptz, jsonb) to authenticated;

create or replace view private.raw_response_export_v1
with (security_invoker = true)
as
select
  r.response_id,
  r.attempt_id,
  ec.participant_ref,
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
join private.enrollment_codes ec using (enrollment_code_id);

revoke all on private.raw_response_export_v1 from public, anon, authenticated;

comment on table private.responses is 'Respuestas crudas. Prohibido persistir claves, acierto/error, puntajes o diagnóstico.';
comment on view private.raw_response_export_v1 is 'Exportación administrativa cruda, una fila por respuesta. Solo roles de administración.';
