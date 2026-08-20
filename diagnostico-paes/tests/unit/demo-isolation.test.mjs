import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBundle } from "../../src/engine/contracts.mjs";
import { buildDemoBundle, DEMO_DATABASE_NAME } from "../../src/engine/demo-isolation.mjs";
import { readActiveDocuments } from "../helpers/active-documents.mjs";


async function productionBundle() {
  return assertBundle(await readActiveDocuments());
}

test("la demostración usa identidad, administración, códigos y backend aislados", async () => {
  const production = await productionBundle();
  assert.deepEqual(production.deployment.enrolamiento.hashes_permitidos, []);
  const demo = buildDemoBundle(production);

  assert.match(DEMO_DATABASE_NAME, /demo/);
  assert.notEqual(demo.deployment.deployment_id, production.deployment.deployment_id);
  assert.notEqual(demo.deployment.administracion.administracion_id, production.deployment.administracion.administracion_id);
  assert.deepEqual(demo.deployment.enrolamiento.hashes_permitidos, []);
  assert.deepEqual(demo.deployment.enrolamiento.hashes_demo, production.deployment.enrolamiento.hashes_demo);
  assert.equal(demo.deployment.backend.enabled, false);
  assert.equal(demo.deployment.backend.url, "");
  assert.equal(demo.deployment.backend.publishable_key, "");
  assert.equal(demo.deployment.pilot_ready, false);
  assert.deepEqual(production.deployment.enrolamiento.hashes_permitidos, []);
});
