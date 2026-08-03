do $$
declare
  derived_columns integer;
begin
  if (select count(*) from private.framework_versions) <> 1 then raise exception 'framework seed count'; end if;
  if (select count(*) from private.abilities) <> 5 then raise exception 'ability seed count'; end if;
  if (select count(*) from private.criteria) <> 16 then raise exception 'criterion seed count'; end if;
  if (select count(*) from private.areas) <> 11 then raise exception 'area seed count'; end if;
  if (select count(*) from private.units) <> 82 then raise exception 'unit seed count'; end if;
  if (select count(*) from private.items) <> 12 then raise exception 'item seed count'; end if;
  if (select count(*) from private.session_items) <> 12 then raise exception 'session item seed count'; end if;
  if (select count(*) from private.enrollment_codes) <> 0 then raise exception 'public enrollment seed must be empty'; end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relkind = 'r'
      and not c.relrowsecurity
  ) then raise exception 'private table without RLS'; end if;

  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'private'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then raise exception 'client role has private table or view privilege'; end if;

  if exists (
    select 1
    from information_schema.table_privileges
    where table_schema = 'api'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then raise exception 'client role has api table or view privilege'; end if;

  if exists (
    select 1
    from information_schema.usage_privileges
    where object_schema in ('private', 'api')
      and object_type = 'SEQUENCE'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then raise exception 'client role has private or api sequence privilege'; end if;

  select count(*) into derived_columns
  from information_schema.columns
  where table_schema = 'private'
    and table_name = 'responses'
    and column_name ~* '(correct|incorrect|score|percent|grade|diagnos|state|rank|puntaje|nota|acierto)';
  if derived_columns <> 0 then raise exception 'derived response columns found'; end if;

  if has_table_privilege('authenticated', 'private.responses', 'select') then raise exception 'authenticated can select responses'; end if;
  if has_table_privilege('authenticated', 'private.responses', 'insert') then raise exception 'authenticated can insert responses'; end if;
  if has_table_privilege('authenticated', 'private.responses', 'update') then raise exception 'authenticated can update responses'; end if;
  if has_table_privilege('authenticated', 'private.responses', 'delete') then raise exception 'authenticated can delete responses'; end if;
  if has_schema_privilege('authenticated', 'private', 'usage') then raise exception 'authenticated can use private schema'; end if;
  if has_function_privilege('authenticated', 'private.submit_session_v1_internal(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz,jsonb)', 'execute') then raise exception 'authenticated can execute internal submission function'; end if;
  if has_function_privilege('anon', 'api.submit_session_v1(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz,jsonb)', 'execute') then raise exception 'anon can execute submission RPC'; end if;
  if has_function_privilege('anon', 'api.enroll_session_v1(text,text,text,text)', 'execute') then raise exception 'anon can execute enrollment RPC'; end if;
  if not has_function_privilege('authenticated', 'api.submit_session_v1(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz,jsonb)', 'execute') then raise exception 'authenticated cannot execute submission RPC'; end if;
  if not has_function_privilege('authenticated', 'api.enroll_session_v1(text,text,text,text)', 'execute') then raise exception 'authenticated cannot execute enrollment RPC'; end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
    left join pg_roles grantee_role on grantee_role.oid = privilege.grantee
    where n.nspname = 'private'
      and privilege.privilege_type = 'EXECUTE'
      and (privilege.grantee = 0 or grantee_role.rolname in ('anon', 'authenticated'))
  ) then raise exception 'client role or PUBLIC can execute private function'; end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) privilege
    left join pg_roles grantee_role on grantee_role.oid = privilege.grantee
    where n.nspname = 'api'
      and privilege.privilege_type = 'EXECUTE'
      and (privilege.grantee = 0 or grantee_role.rolname = 'anon')
  ) then raise exception 'PUBLIC or anon can execute api function'; end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and p.oid not in (
        'api.submit_session_v1(text,uuid,text,text,text,text,text,text,timestamptz,timestamptz,jsonb)'::regprocedure,
        'api.enroll_session_v1(text,text,text,text)'::regprocedure
      )
  ) then raise exception 'authenticated can execute unexpected api function'; end if;
end $$;

select 'schema-contract-ok' as result;
