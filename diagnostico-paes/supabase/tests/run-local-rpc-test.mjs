#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCode } from "../../src/engine/enrollment-code.mjs";
import { readActiveDocuments } from "../../tests/helpers/active-documents.mjs";

const ledgerPath = process.argv[2];
const container = process.argv[3];
if (!ledgerPath || !container || !/^[a-zA-Z0-9_.-]+$/.test(container)) {
  console.error("Uso: node supabase/tests/run-local-rpc-test.mjs <ledger-restringido.md> <contenedor>");
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ledger = await readFile(ledgerPath, "utf8");
const records = [...ledger.matchAll(/^\| `ALN-\d+` \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \|$/gm)];
if (records.length < 3) throw new Error("Se necesitan tres registros válidos en el ledger restringido");
const enrollmentFixtures = records.slice(0, 3).map((record) => ({
  enrollmentCode: record[1],
  participantRef: record[2],
  enrollmentCodeId: record[3],
}));
const enrollmentCode = enrollmentFixtures[0].enrollmentCode;
const paperEnrollmentCode = enrollmentFixtures[1].enrollmentCode;
const validationEnrollmentCode = enrollmentFixtures[2].enrollmentCode;
const { deployment, session, bank } = await readActiveDocuments();
const orphanEnrollmentCode = createCode("ZZZZZZZZ", deployment.enrolamiento);
const itemById = new Map(bank.items.map((item) => [item.item_id, item]));
const attemptId = randomUUID();
const competingAttemptId = randomUUID();
const incompleteAttemptId = randomUUID();
const invalidOptionAttemptId = randomUUID();
const frameworkMismatchAttemptId = randomUUID();
const paperAttemptId = randomUUID();
const orphanAttemptId = randomUUID();
const authId = randomUUID();
const replacementAuthId = randomUUID();
const responses = session.items.map((ref) => {
  const item = itemById.get(ref.item_id);
  return {
    response_id: randomUUID(),
    item_id: item.item_id,
    item_version: item.version,
    selected_option: item.alternativas[0].id,
    omitted: false,
    response_time_ms: 1200 + ref.orden,
    presentation_order: ref.orden,
    client_recorded_at: "2026-08-17T12:00:00.000Z",
    source: "device",
  };
});
const paperResponses = session.items.map((ref) => {
  const item = itemById.get(ref.item_id);
  return {
    response_id: randomUUID(),
    item_id: item.item_id,
    item_version: item.version,
    selected_option: ref.orden === 3 ? null : item.alternativas[0].id,
    omitted: ref.orden === 3,
    response_time_ms: null,
    presentation_order: ref.orden,
    client_recorded_at: "2026-08-17T13:00:00.000Z",
    source: "paper",
  };
});
const orphanResponses = responses.map((response) => ({ ...response, response_id: randomUUID() }));
const invalidOptionResponses = structuredClone(responses);
invalidOptionResponses[0].selected_option = "OPTION-DOES-NOT-EXIST";
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const restrictedEnrollmentSeed = enrollmentFixtures.map((fixture) => `
insert into private.enrollment_codes (
  enrollment_code_id, participant_ref, code_hash, enabled, valid_from, valid_until
) values (
  ${quote(fixture.enrollmentCodeId)}::uuid,
  ${quote(fixture.participantRef)}::uuid,
  extensions.digest(private.normalize_enrollment_code(${quote(fixture.enrollmentCode)}), 'sha256'),
  true,
  null,
  null
)
on conflict (enrollment_code_id) do update set
  participant_ref = excluded.participant_ref,
  code_hash = excluded.code_hash,
  enabled = excluded.enabled,
  valid_from = excluded.valid_from,
  valid_until = excluded.valid_until;
insert into private.session_authorizations (enrollment_code_id, administration_id)
values (${quote(fixture.enrollmentCodeId)}::uuid, ${quote(deployment.administracion.administracion_id)})
on conflict do nothing;
`).join("\n");
const call = `api.submit_session_v1(
  ${quote(enrollmentCode)},
  ${quote(attemptId)}::uuid,
  ${quote(deployment.administracion.administracion_id)},
  ${quote(session.plantilla_id)},
  ${quote(session.version)},
  ${quote(session.marco_id)},
 ${quote(session.marco_version)},
  'confirmed',
 '2026-08-17T11:40:00.000Z'::timestamptz,
  '2026-08-17T12:00:00.000Z'::timestamptz,
  ${quote(JSON.stringify(responses))}::jsonb
)`;
const paperCall = `api.submit_session_v1(
  ${quote(paperEnrollmentCode)},
  ${quote(paperAttemptId)}::uuid,
  ${quote(deployment.administracion.administracion_id)},
  ${quote(session.plantilla_id)},
  ${quote(session.version)},
  ${quote(session.marco_id)},
 ${quote(session.marco_version)},
  'confirmed',
 null,
  '2026-08-17T12:00:00.000Z'::timestamptz,
  ${quote(JSON.stringify(paperResponses))}::jsonb
)`;
const orphanCall = `api.submit_session_v1(
  ${quote(orphanEnrollmentCode)},
  ${quote(orphanAttemptId)}::uuid,
  ${quote(deployment.administracion.administracion_id)},
  ${quote(session.plantilla_id)},
  ${quote(session.version)},
  ${quote(session.marco_id)},
  ${quote(session.marco_version)},
  'provisional',
  '2026-08-17T11:40:00.000Z'::timestamptz,
  '2026-08-17T12:00:00.000Z'::timestamptz,
  ${quote(JSON.stringify(orphanResponses))}::jsonb
)`;
const enrollCall = `api.enroll_session_v1(
  ${quote(enrollmentCode)},
  ${quote(deployment.administracion.administracion_id)},
  ${quote(session.plantilla_id)},
  ${quote(session.version)}
)`;
const competingCall = call.replace(attemptId, competingAttemptId);
const conflictCall = call.replace(JSON.stringify(responses), JSON.stringify(invalidOptionResponses));
const incompleteCall = `api.submit_session_v1(
  ${quote(validationEnrollmentCode)},
  ${quote(incompleteAttemptId)}::uuid,
  ${quote(deployment.administracion.administracion_id)},
  ${quote(session.plantilla_id)},
  ${quote(session.version)},
  ${quote(session.marco_id)},
 ${quote(session.marco_version)},
  'confirmed',
 '2026-08-17T11:40:00.000Z'::timestamptz,
  '2026-08-17T12:00:00.000Z'::timestamptz,
  ${quote(JSON.stringify(responses.slice(0, -1)))}::jsonb
)`;
const invalidOptionCall = `api.submit_session_v1(
  ${quote(validationEnrollmentCode)},
  ${quote(invalidOptionAttemptId)}::uuid,
  ${quote(deployment.administracion.administracion_id)},
  ${quote(session.plantilla_id)},
  ${quote(session.version)},
  ${quote(session.marco_id)},
 ${quote(session.marco_version)},
  'confirmed',
 '2026-08-17T11:40:00.000Z'::timestamptz,
  '2026-08-17T12:00:00.000Z'::timestamptz,
  ${quote(JSON.stringify(invalidOptionResponses))}::jsonb
)`;
const frameworkMismatchCall = call
  .replace(enrollmentCode, validationEnrollmentCode)
  .replace(attemptId, frameworkMismatchAttemptId)
  .replace(session.marco_version, `${session.marco_version}-mismatch`);
const assertReceiptSql = (tag, callSql, expectedStatus, expectedAttemptId) => `
do $${tag}$
declare
  receipt jsonb;
begin
  select ${callSql} into receipt;
  if receipt is null
     or receipt ->> 'status' is distinct from ${quote(expectedStatus)}
     or receipt ->> 'attempt_id' is distinct from ${quote(expectedAttemptId)}
     or nullif(receipt ->> 'received_at', '') is null
     or (select count(*) from jsonb_object_keys(receipt)) <> 3 then
    raise exception 'unexpected receipt: %', receipt;
  end if;
end
$${tag}$;`;
const assertEnrollmentReceiptSql = (tag, expectedStatus) => `
do $${tag}$
declare
  receipt jsonb;
begin
  select ${enrollCall} into receipt;
  if receipt is null
     or receipt ->> 'status' is distinct from ${quote(expectedStatus)}
     or (select count(*) from jsonb_object_keys(receipt)) <> 1 then
    raise exception 'unexpected enrollment receipt: %', receipt;
  end if;
end
$${tag}$;`;
const sql = `
\\set ON_ERROR_STOP on
${restrictedEnrollmentSeed}
update private.administrations set enabled = true where administration_id = ${quote(deployment.administracion.administracion_id)};
set role authenticated;
select set_config('request.jwt.claim.sub', ${quote(authId)}, false);
select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: authId, is_anonymous: true }))}, false);
${assertEnrollmentReceiptSql("expected_enrollment_receipt", "confirmed")}
${assertEnrollmentReceiptSql("expected_enrollment_retry_receipt", "already_confirmed")}
do $expected_invalid_code$
begin
  perform ${call.replace(enrollmentCode, "BAD-CODE")};
  raise exception 'invalid code unexpectedly accepted';
exception
  when sqlstate '22023' then
    if sqlerrm <> 'invalid_enrollment_code' then raise; end if;
end
$expected_invalid_code$;
select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: authId, is_anonymous: false }))}, false);
do $expected_non_anonymous$
begin
  perform ${call};
  raise exception 'non-anonymous JWT unexpectedly accepted';
exception
  when sqlstate '42501' then
    if sqlerrm <> 'anonymous_auth_required' then raise; end if;
end
$expected_non_anonymous$;
select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: authId, is_anonymous: true }))}, false);
do $expected_incomplete$
begin
  perform ${incompleteCall};
  raise exception 'incomplete response set unexpectedly accepted';
exception
  when sqlstate '22023' then
    if sqlerrm <> 'incomplete_response_set' then raise; end if;
end
$expected_incomplete$;
do $expected_invalid_option$
begin
  perform ${invalidOptionCall};
  raise exception 'invalid option unexpectedly accepted';
exception
  when sqlstate '22023' then
    if sqlerrm <> 'invalid_response_payload' then raise; end if;
end
$expected_invalid_option$;
do $expected_framework_mismatch$
begin
  perform ${frameworkMismatchCall};
  raise exception 'framework mismatch unexpectedly accepted';
exception
  when sqlstate '22023' then
    if sqlerrm <> 'session_framework_mismatch' then raise; end if;
end
$expected_framework_mismatch$;
${assertReceiptSql("expected_first_receipt", call, "synced", attemptId)}
${assertReceiptSql("expected_retry_receipt", call, "already_synced", attemptId)}
${assertReceiptSql("expected_orphan_receipt", orphanCall, "orphaned", orphanAttemptId)}
${assertReceiptSql("expected_orphan_retry_receipt", orphanCall, "already_orphaned", orphanAttemptId)}
select set_config('request.jwt.claim.sub', ${quote(replacementAuthId)}, false);
select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: replacementAuthId, is_anonymous: true }))}, false);
${assertReceiptSql("expected_auth_loss_receipt", call, "already_synced", attemptId)}
do $expected_bound_error$
begin
  perform ${competingCall};
  raise exception 'new attempt unexpectedly accepted after auth replacement';
exception
  when sqlstate '42501' then
    if sqlerrm <> 'enrollment_not_accepted' then raise; end if;
end
$expected_bound_error$;
select set_config('request.jwt.claim.sub', ${quote(authId)}, false);
select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: authId, is_anonymous: true }))}, false);
do $expected_second_attempt$
begin
  perform ${competingCall};
  raise exception 'second administration attempt unexpectedly accepted';
exception
  when sqlstate '23505' then
    if sqlerrm <> 'administration_already_completed' then raise; end if;
end
$expected_second_attempt$;
do $expected_payload_conflict$
begin
  perform ${conflictCall};
  raise exception 'conflicting attempt payload unexpectedly accepted';
exception
  when sqlstate '23505' then
    if sqlerrm <> 'attempt_id_payload_conflict' then raise; end if;
end
$expected_payload_conflict$;
${assertReceiptSql("expected_paper_receipt", paperCall, "synced", paperAttemptId)}
reset role;
update private.administrations
set enabled = false
where administration_id = ${quote(deployment.administracion.administracion_id)};
update private.enrollment_codes
set valid_until = clock_timestamp() - interval '1 second'
where code_hash = extensions.digest(private.normalize_enrollment_code(${quote(enrollmentCode)}), 'sha256');
set role authenticated;
select set_config('request.jwt.claim.sub', ${quote(replacementAuthId)}, false);
select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: replacementAuthId, is_anonymous: true }))}, false);
${assertReceiptSql("expected_closed_retry_receipt", call, "already_synced", attemptId)}
reset role;
do $$
begin
  if (select count(*) from private.session_attempts where attempt_id = ${quote(attemptId)}::uuid) <> 1 then raise exception 'attempt count'; end if;
  if (select count(*) from private.responses where attempt_id = ${quote(attemptId)}::uuid) <> 12 then raise exception 'response count'; end if;
  if (select auth_user_id from private.session_attempts where attempt_id = ${quote(attemptId)}::uuid) is distinct from ${quote(authId)}::uuid then raise exception 'original auth identity changed'; end if;
  if (select bound_auth_user_id from private.enrollment_codes where code_hash = extensions.digest(private.normalize_enrollment_code(${quote(enrollmentCode)}), 'sha256')) is distinct from ${quote(authId)}::uuid then raise exception 'code binding changed'; end if;
  if (select source from private.session_attempts where attempt_id = ${quote(paperAttemptId)}::uuid) <> 'paper' then raise exception 'paper attempt source'; end if;
  if (select count(*) from private.responses where attempt_id = ${quote(paperAttemptId)}::uuid and source = 'paper' and response_time_ms is null) <> 12 then raise exception 'paper response shape'; end if;
  if (select reconciliation_status from private.session_attempts where attempt_id = ${quote(orphanAttemptId)}::uuid) <> 'orphaned' then raise exception 'orphan status'; end if;
  if (select enrollment_code_id from private.session_attempts where attempt_id = ${quote(orphanAttemptId)}::uuid) is not null then raise exception 'orphan unexpectedly matched'; end if;
  if (select count(*) from private.responses where attempt_id = ${quote(orphanAttemptId)}::uuid) <> 12 then raise exception 'orphan response count'; end if;
  if (select count(*) from private.raw_response_export_v1 where attempt_id = ${quote(orphanAttemptId)}::uuid and participant_ref is null) <> 12 then raise exception 'orphan export count'; end if;
  perform private.reconcile_orphaned_attempt(
    ${quote(orphanAttemptId)}::uuid,
    ${quote(enrollmentFixtures[2].enrollmentCodeId)}::uuid
  );
  if (select reconciliation_status from private.session_attempts where attempt_id = ${quote(orphanAttemptId)}::uuid) <> 'resolved' then raise exception 'orphan reconciliation'; end if;
end $$;
select 'rpc-enrollment-device-paper-orphan-ok' as result;
`;

const child = spawnSync("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], {
  input: sql,
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
});
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
process.exit(child.status ?? 1);
