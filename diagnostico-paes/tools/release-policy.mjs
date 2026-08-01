import { RELEASE_GATE_IDS } from "../src/engine/release-readiness.mjs";

export function validatePilotRelease(bundle, check) {
  if (!bundle.deployment.pilot_ready) return;
  const filler = bundle.bank.estado_autoria === "relleno_tecnico_no_aplicar";
  check("liberación sin relleno", !filler);
  check("liberación con estado piloto", bundle.deployment.release_status === "pilot");
  check("liberación con backend configurado", bundle.deployment.backend.enabled);
  for (const id of RELEASE_GATE_IDS) {
    check(`liberación con gate ${id}`, bundle.deployment.release_gates[id]);
  }
}

export function readinessExitCode(assessment, args) {
  return args.includes("--require-go") && !assessment.ready ? 1 : 0;
}
