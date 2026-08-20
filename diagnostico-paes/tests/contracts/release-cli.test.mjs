import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBundle } from "../../src/engine/contracts.mjs";
import { assessReleaseReadiness, RELEASE_GATE_IDS } from "../../src/engine/release-readiness.mjs";
import { readinessExitCode, validatePilotRelease } from "../../tools/release-policy.mjs";
import { readActiveDocuments } from "../helpers/active-documents.mjs";


async function productionBundle() {
  return assertBundle(await readActiveDocuments());
}

function makeCandidate(bundle) {
  const candidate = structuredClone(bundle);
  candidate.bank.estado_autoria = "contenido_docente_revisado";
  candidate.deployment.administracion.fecha_objetivo = "2026-09-14";
  candidate.deployment.release_status = "pilot";
  candidate.deployment.pilot_ready = true;
  candidate.deployment.backend = {
    enabled: true,
    url: "https://project.supabase.co/",
    publishable_key: "sb_publishable_00000000000000000000",
    schema: "api",
    enrollment_rpc_name: "enroll_session_v1",
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
