import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBundle } from "../../src/engine/contracts.mjs";
import { assessReleaseReadiness, RELEASE_GATE_IDS } from "../../src/engine/release-readiness.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const EXPECTED_RELEASE_GATE_IDS = [
  "contenido_real_revisado",
  "criterios_y_reglas_aprobados",
  "telefono_offline_validado",
  "qr_respaldo_validado",
  "impresion_validada",
  "operacion_sala_validada",
];

async function productionBundle() {
  return assertBundle({
    active: await readJson("data/active.json"),
    framework: await readJson("data/paes-ciencias-2027/framework.v1.json"),
    bank: await readJson("data/paes-ciencias-2027/bank-anchor-placeholder.v1.json"),
    session: await readJson("data/paes-ciencias-2027/session-anchor-2026-08-17.v1.json"),
    deployment: await readJson("data/paes-ciencias-2027/deployment.v1.json"),
  });
}

test("los release gates son solo controles de calidad docente y operativa", () => {
  assert.deepEqual(RELEASE_GATE_IDS, EXPECTED_RELEASE_GATE_IDS);
});

test("el despliegue técnico permanece NO-GO y enumera sus gates", async () => {
  const assessment = assessReleaseReadiness(await productionBundle());
  assert.equal(assessment.ready, false);
  assert.equal(assessment.checks.find((check) => check.id === "estructura_sesion").passed, true);
  assert.equal(assessment.checks.find((check) => check.id === "contenido_real").passed, false);
  for (const id of RELEASE_GATE_IDS) {
    assert.equal(assessment.checks.find((check) => check.id === `gate.${id}`).passed, false);
  }
});

test("una liberación exige contenido, backend, gates y banderas coordinadas", async () => {
  const bundle = structuredClone(await productionBundle());
  bundle.bank.estado_autoria = "contenido_docente_revisado";
  bundle.deployment.operacion.url_publica = "https://example.test/diagnostico/";
  bundle.deployment.backend = {
    enabled: true,
    url: "https://project.supabase.co/",
    publishable_key: "sb_publishable_00000000000000000000",
    schema: "api",
    rpc_name: "submit_session_v1",
  };
  for (const id of RELEASE_GATE_IDS) bundle.deployment.release_gates[id] = true;
  bundle.deployment.release_status = "pilot";
  bundle.deployment.pilot_ready = true;
  const assessment = assessReleaseReadiness(assertBundle(bundle));
  assert.equal(assessment.ready, true);
  assert.equal(assessment.passed, assessment.total);
});

test("la autoría ausente o un backend que no sea Supabase nunca producen GO", async () => {
  const missingAuthorship = structuredClone(await productionBundle());
  delete missingAuthorship.bank.estado_autoria;
  assert.throws(() => assertBundle(missingAuthorship), /estado_autoria/);

  const invalidBackend = structuredClone(await productionBundle());
  invalidBackend.bank.estado_autoria = "contenido_docente_revisado";
  invalidBackend.deployment.backend = {
    enabled: true,
    url: "x",
    publishable_key: "publishable-test-key",
    schema: "api",
    rpc_name: "submit_session_v1",
  };
  assert.throws(() => assertBundle(invalidBackend), /URL HTTPS de proyecto Supabase/);

  invalidBackend.deployment.backend.url = "https://project.supabase.co/";
  invalidBackend.deployment.backend.publishable_key = "x";
  assert.throws(() => assertBundle(invalidBackend), /clave publicable/);
});

test("un gate omitido invalida el contrato de despliegue", async () => {
  const bundle = structuredClone(await productionBundle());
  delete bundle.deployment.release_gates.qr_respaldo_validado;
  assert.throws(() => assertBundle(bundle), /qr_respaldo_validado/);
});
