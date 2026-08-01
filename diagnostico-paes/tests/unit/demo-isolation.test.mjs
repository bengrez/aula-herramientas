import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBundle } from "../../src/engine/contracts.mjs";
import { buildDemoBundle, DEMO_DATABASE_NAME } from "../../src/engine/demo-isolation.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));

async function productionBundle() {
  return assertBundle({
    active: await readJson("data/active.json"),
    framework: await readJson("data/paes-ciencias-2027/framework.v1.json"),
    bank: await readJson("data/paes-ciencias-2027/bank-anchor-placeholder.v1.json"),
    session: await readJson("data/paes-ciencias-2027/session-anchor-2026-08-17.v1.json"),
    deployment: await readJson("data/paes-ciencias-2027/deployment.v1.json"),
  });
}

test("la demostración usa identidad, administración, códigos y backend aislados", async () => {
  const production = await productionBundle();
  assert.deepEqual(production.deployment.enrolamiento.hashes_permitidos, []);
  const syntheticProductionHash = "a".repeat(64);
  production.deployment.enrolamiento.hashes_permitidos = [syntheticProductionHash];
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
  assert.deepEqual(production.deployment.enrolamiento.hashes_permitidos, [syntheticProductionHash]);
});
