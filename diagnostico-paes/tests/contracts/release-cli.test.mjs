import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBundle } from "../../src/engine/contracts.mjs";
import { assessReleaseReadiness, RELEASE_GATE_IDS } from "../../src/engine/release-readiness.mjs";
import { readinessExitCode, validatePilotRelease } from "../../tools/release-policy.mjs";

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

function makeCandidate(bundle) {
  const candidate = structuredClone(bundle);
  candidate.bank.estado_autoria = "contenido_docente_revisado";
  candidate.deployment.release_status = "pilot";
  candidate.deployment.pilot_ready = true;
  candidate.deployment.backend = {
    enabled: true,
    url: "https://project.supabase.co/",
    publishable_key: "sb_publishable_00000000000000000000",
    schema: "api",
    rpc_name: "submit_session_v1",
  };
  for (const id of RELEASE_GATE_IDS) candidate.deployment.release_gates[id] = true;
  return assertBundle(candidate);
}

test("release-check termina con error mientras el paquete activo siga en NO-GO", async () => {
  const assessment = assessReleaseReadiness(await productionBundle());
  assert.equal(readinessExitCode(assessment, ["--require-go"]), 1);
  assert.equal(readinessExitCode(assessment, []), 0);
});

test("preflight rechaza pilot_ready cuando queda un release gate pendiente", async () => {
  const candidate = makeCandidate(await productionBundle());
  candidate.deployment.release_gates.qr_respaldo_validado = false;

  assert.throws(() => validatePilotRelease(candidate, (name, passed) => {
    if (!passed) throw new Error(name);
  }), /liberación con gate qr_respaldo_validado/);
});
