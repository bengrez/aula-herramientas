import { RELEASE_GATE_IDS } from "../src/engine/release-readiness.mjs";

export function validatePilotRelease(bundle, check) {
  if (!bundle.deployment.pilot_ready) return;
  check("liberación con contenido docente revisado", bundle.bank.estado_autoria === "contenido_docente_revisado");
  check("liberación con estado piloto", bundle.deployment.release_status === "pilot");
  check("liberación con backend configurado", bundle.deployment.backend.enabled);
  for (const id of RELEASE_GATE_IDS) {
    check(`liberación con gate ${id}`, bundle.deployment.release_gates[id]);
  }
}

export function readinessExitCode(assessment, args) {
  return args.includes("--require-go") && !assessment.ready ? 1 : 0;
}
