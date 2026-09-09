-- ADR-0008: aditiva y NO aplicada a Supabase. Ningún seed real ni activación.
-- Requiere las migraciones históricas; no altera sus tablas, RPC ni exportaciones.
begin;
create table private.practice_scopes (
  scope_id text primary key,
  course_id text not null,
  period text not null,
  framework_id text not null,
  framework_version text not null,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  enabled boolean not null default false
);
create table private.practice_units (
  scope_id text references private.practice_scopes on delete cascade,
  unidad_id text not null,
  primary key (scope_id, unidad_id)
);
create table private.practice_codes (
  scope_id text references private.practice_scopes on delete cascade,
  participant_id uuid not null default gen_random_uuid(),
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  active boolean not null default true,
  revision bigint not null default 0,
  primary key (scope_id, participant_id),
  unique (scope_id, code_hash)
);
create table private.practice_bindings (
  scope_id text not null,
  auth_user_id uuid not null,
  participant_id uuid not null,
  primary key (scope_id, auth_user_id),
  foreign key (scope_id, participant_id) references private.practice_codes on delete cascade
);
create table private.practice_progress (
  scope_id text not null,
  participant_id uuid not null,
  unidad_id text not null,
  attempts bigint not null check (attempts >= 0),
  correct bigint not null check (correct between 0 and attempts),
  omitted bigint not null default 0 check (omitted >= 0),
  last_practiced_on date not null,
  primary key (scope_id, participant_id, unidad_id),
  foreign key (scope_id, participant_id) references private.practice_codes on delete cascade,
  foreign key (scope_id, unidad_id) references private.practice_units on delete cascade
);
-- Solo comprobante opaco/hash: nunca conserva el delta desglosado ni una respuesta.
create table private.practice_receipts (
  scope_id text not null,
  participant_id uuid not null,
  batch_id uuid not null,
  payload_hash text not null,
  primary key (scope_id, participant_id, batch_id),
  foreign key (scope_id, participant_id) references private.practice_codes on delete cascade
);

alter table private.practice_scopes enable row level security;
alter table private.practice_units enable row level security;
alter table private.practice_codes enable row level security;
alter table private.practice_bindings enable row level security;
alter table private.practice_progress enable row level security;
alter table private.practice_receipts enable row level security;
revoke all on private.practice_scopes, private.practice_units, private.practice_codes,
  private.practice_bindings, private.practice_progress, private.practice_receipts from public, anon, authenticated;

create function api.enroll_practice_v1(p_scope text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_code text; v_participant uuid; v_bound uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  v_code := upper(regexp_replace(p_code, '[[:space:]-]', '', 'g'));
  if v_code is null or v_code !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{9}$' then raise exception 'not_authorized'; end if;
  select c.participant_id into v_participant
  from private.practice_codes c join private.practice_scopes s using (scope_id)
  where c.scope_id = p_scope and c.active and s.enabled
    and (current_timestamp at time zone 'America/Santiago')::date between s.starts_on and s.ends_on
    and c.code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex') for update of c;
  if v_participant is null then raise exception 'not_authorized'; end if;
  insert into private.practice_bindings values (p_scope, auth.uid(), v_participant) on conflict do nothing;
  select participant_id into v_bound from private.practice_bindings where scope_id = p_scope and auth_user_id = auth.uid();
  if v_bound <> v_participant then raise exception 'identity_already_bound'; end if;
  return jsonb_build_object('status', 'enrolled');
end $$;

-- Todas las lecturas/escrituras del agregado toman el mismo bloqueo por seudónimo.
create function private.practice_authority(p_scope text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_participant uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select c.participant_id into v_participant
  from private.practice_bindings b join private.practice_codes c using (scope_id, participant_id)
  join private.practice_scopes s using (scope_id)
  where b.scope_id = p_scope and b.auth_user_id = auth.uid() and c.active and s.enabled
    and (current_timestamp at time zone 'America/Santiago')::date between s.starts_on and s.ends_on
  for update of c;
  if v_participant is null then raise exception 'not_authorized'; end if;
  return v_participant;
end $$;

create function api.submit_practice_delta_v1(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_scope text; v_batch uuid; v_participant uuid; v_hash text; v_existing text;
  d jsonb; v_attempts integer; v_correct integer; v_omitted integer; v_day date; v_total integer := 0;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid_payload'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_payload) k) <> array['batch_id','deltas','scope_id']
    or jsonb_typeof(p_payload->'scope_id') <> 'string' or jsonb_typeof(p_payload->'batch_id') <> 'string'
    or jsonb_typeof(p_payload->'deltas') <> 'array' then raise exception 'invalid_payload'; end if;
  v_scope := p_payload->>'scope_id'; v_batch := (p_payload->>'batch_id')::uuid;
  if v_batch is null then raise exception 'invalid_batch'; end if;
  v_participant := private.practice_authority(v_scope);
  if jsonb_array_length(p_payload->'deltas') < 1 then raise exception 'empty_delta'; end if;
  if jsonb_array_length(p_payload->'deltas') > 50 then raise exception 'too_many_units'; end if;
  if (select count(*) <> count(distinct value->>'unidad_id') from jsonb_array_elements(p_payload->'deltas')) then raise exception 'duplicate_units'; end if;
  for d in select value from jsonb_array_elements(p_payload->'deltas') loop
    if jsonb_typeof(d) <> 'object' then raise exception 'invalid_delta'; end if;
    if (select array_agg(k order by k) from jsonb_object_keys(d) k) <> array['attempts','correct','last_practiced_on','omitted','unidad_id']
      or jsonb_typeof(d->'unidad_id') <> 'string' or jsonb_typeof(d->'last_practiced_on') <> 'string'
      or jsonb_typeof(d->'attempts') <> 'number' or jsonb_typeof(d->'correct') <> 'number' or jsonb_typeof(d->'omitted') <> 'number'
      then raise exception 'invalid_delta'; end if;
    if (d->>'attempts') !~ '^[0-9]+$' or (d->>'correct') !~ '^[0-9]+$' or (d->>'omitted') !~ '^[0-9]+$' or (d->>'last_practiced_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_counts_or_date'; end if;
    v_attempts := (d->>'attempts')::integer; v_correct := (d->>'correct')::integer; v_omitted := (d->>'omitted')::integer;
    v_day := (d->>'last_practiced_on')::date; v_total := v_total + v_attempts + v_omitted;
    -- Una unidad aparece sólo si tuvo al menos una pregunta; puede haber quedado entera sin responder.
    if v_attempts + v_omitted not between 1 and 50 or v_correct not between 0 and v_attempts or v_total > 50 then raise exception 'invalid_counts'; end if;
    if not exists (select 1 from private.practice_units where scope_id = v_scope and unidad_id = d->>'unidad_id') then raise exception 'unknown_unit'; end if;
    if not exists (select 1 from private.practice_scopes where scope_id = v_scope and v_day between starts_on and least(ends_on, (current_timestamp at time zone 'America/Santiago')::date + 1)) then raise exception 'invalid_day'; end if;
  end loop;
  v_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
  select payload_hash into v_existing from private.practice_receipts where scope_id = v_scope and participant_id = v_participant and batch_id = v_batch;
  if v_existing is not null then
    if v_existing <> v_hash then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('status', 'already_accepted', 'batch_id', v_batch);
  end if;
  insert into private.practice_receipts values (v_scope, v_participant, v_batch, v_hash);
  for d in select value from jsonb_array_elements(p_payload->'deltas') loop
    insert into private.practice_progress as p (scope_id, participant_id, unidad_id, attempts, correct, omitted, last_practiced_on)
    values (v_scope, v_participant, d->>'unidad_id', (d->>'attempts')::integer, (d->>'correct')::integer, (d->>'omitted')::integer, (d->>'last_practiced_on')::date)
    on conflict (scope_id, participant_id, unidad_id) do update set
      attempts = p.attempts + excluded.attempts, correct = p.correct + excluded.correct, omitted = p.omitted + excluded.omitted,
      last_practiced_on = greatest(p.last_practiced_on, excluded.last_practiced_on);
  end loop;
  update private.practice_codes set revision = revision + 1 where scope_id = v_scope and participant_id = v_participant;
  return jsonb_build_object('status', 'accepted', 'batch_id', v_batch);
end $$;

create function api.get_practice_progress_v1(p_scope text, p_batch_ids uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_participant uuid; v_rows jsonb; v_ack jsonb; v_revision bigint; v_sets bigint;
begin
  if cardinality(p_batch_ids) > 10000 then raise exception 'too_many_receipts'; end if;
  v_participant := private.practice_authority(p_scope);
  select coalesce(jsonb_agg(jsonb_build_object('unidad_id', unidad_id, 'attempts', attempts, 'correct', correct, 'omitted', omitted, 'last_practiced_on', last_practiced_on) order by unidad_id), '[]')
  into v_rows from private.practice_progress where scope_id = p_scope and participant_id = v_participant;
  select coalesce(jsonb_agg(batch_id order by batch_id), '[]') into v_ack from private.practice_receipts
    where scope_id = p_scope and participant_id = v_participant and batch_id = any(p_batch_ids);
  -- Una tanda terminada deja exactamente un recibo, así que contarlos ya es contarlas. No hace
  -- falta una columna nueva y la idempotencia del recibo evita contar dos veces un reenvío.
  select count(*) into v_sets from private.practice_receipts where scope_id = p_scope and participant_id = v_participant;
  select revision into v_revision from private.practice_codes where scope_id = p_scope and participant_id = v_participant;
  return jsonb_build_object('scope_id', p_scope, 'progress', v_rows, 'acknowledged', v_ack, 'revision', v_revision, 'sets_completed', v_sets);
end $$;

-- Exportación puntual privada por curso × unidad; no se publica ni se entrega al navegador.
-- `students` evita leer 40 intentos como si fueran de un curso entero cuando pueden ser de uno solo;
-- `active_codes` da el denominador del curso. Ambos derivan de lo ya almacenado: ningún dato nuevo.
create view private.practice_course_export_v1 as
select s.course_id, s.period, s.framework_id, s.framework_version, p.unidad_id,
  count(distinct p.participant_id) as students,
  (select count(*) from private.practice_codes c
   where c.active and c.scope_id in (
     select cs.scope_id from private.practice_scopes cs
     where cs.course_id = s.course_id and cs.period = s.period
       and cs.framework_id = s.framework_id and cs.framework_version = s.framework_version
       and cs.enabled
       and (current_timestamp at time zone 'America/Santiago')::date between cs.starts_on and cs.ends_on
   )) as active_codes,
  sum(p.attempts) as attempts, sum(p.correct) as correct, sum(p.omitted) as omitted,
  max(p.last_practiced_on) as last_practiced_on
from private.practice_progress p join private.practice_scopes s using (scope_id)
group by s.course_id, s.period, s.framework_id, s.framework_version, p.unidad_id;
revoke all on private.practice_course_export_v1 from public, anon, authenticated;
revoke all on function private.practice_authority(text) from public, anon, authenticated;
revoke all on function api.enroll_practice_v1(text,text), api.submit_practice_delta_v1(jsonb), api.get_practice_progress_v1(text,uuid[]) from public, anon, authenticated;
grant execute on function api.enroll_practice_v1(text,text), api.submit_practice_delta_v1(jsonb), api.get_practice_progress_v1(text,uuid[]) to authenticated;
comment on table private.practice_progress is 'Solo agregado por unidad: intentos, aciertos y omisiones. Sin ítem, alternativa, tiempo, nota ni ranking. Una omisión no es un error.';
comment on table private.practice_receipts is 'Recibos idempotentes. Guarda un hash del envío, no el envío: no contiene ítem, alternativa ni tiempo. El hash NO es anónimo — el espacio de deltas posibles es pequeño, así que con acceso a la base se podría reconstruir por fuerza bruta el desglose por tanda. Trátalo como dato del mismo nivel que el agregado y bórralo con él.';
commit;
