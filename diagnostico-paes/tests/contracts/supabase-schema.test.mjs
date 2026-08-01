import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generatedContentSeed } from "../../tools/generate-content-seed.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = join(root, "supabase/migrations/202607310001_diagnostic_engine.sql");
const contractPath = join(root, "supabase/tests/schema-contract.sql");
const harnessPath = join(root, "supabase/tests/run-local-rpc-test.mjs");
const seedPath = join(root, "supabase/seed-content-placeholder.sql");

test("Supabase SQL preserves the closed-schema and relational-integrity contract", async () => {
  const [migration, contract] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(contractPath, "utf8"),
  ]);

  assert.match(migration, /revoke all on all functions in schema api from public, anon, authenticated;/);
  assert.match(migration, /alter default privileges in schema api revoke all on functions from public, anon, authenticated;/);
  assert.match(contract, /from information_schema\.table_privileges/);
  assert.doesNotMatch(contract, /information_schema\.role_table_grants/);
  assert.match(contract, /authenticated can execute unexpected api function/);

  assert.match(migration, /foreign key \(bank_id, bank_version, framework_id, framework_version\)[\s\S]*?references private\.item_banks \(bank_id, bank_version, framework_id, framework_version\)/);
  assert.match(migration, /references private\.session_templates \([\s\S]*?framework_id, framework_version,[\s\S]*?bank_id, bank_version/);
  assert.match(migration, /references private\.bank_items \(bank_id, bank_version, item_id, item_version\)/);

  const retryLookup = migration.indexOf("select * into existing_attempt");
  const mutableGate = migration.indexOf("if not administration.enabled");
  assert.ok(retryLookup > 0 && mutableGate > retryLookup, "exact retry must precede mutable gates");
  assert.match(migration, /from private\.administrations a[\s\S]*?for share;/);
});

test("the generated content seed matches the checked-in SQL", async () => {
  const seed = await readFile(seedPath, "utf8");
  assert.equal(generatedContentSeed, seed);

  const sessionInsertCount = [...seed.matchAll(/insert into private\.session_items \([^\n]+bank_id, bank_version/g)].length;
  assert.equal(sessionInsertCount, 12);
});

test("the local RPC harness asserts receipts, closed retries, and original Auth binding", async () => {
  const harness = await readFile(harnessPath, "utf8");
  assert.match(harness, /expected_first_receipt[\s\S]*?"synced"/);
  assert.match(harness, /expected_closed_retry_receipt[\s\S]*?"already_synced"/);
  assert.match(harness, /original auth identity changed/);
  assert.match(harness, /code binding changed/);
  assert.match(harness, /session_framework_mismatch/);
});
