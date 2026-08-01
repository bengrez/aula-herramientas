import { assertBundle } from "./contracts.mjs";

export const DEMO_DATABASE_NAME = "diagnostic-engine-v1-demo";

export function buildDemoBundle(bundle) {
  const demo = structuredClone(bundle);
  demo.deployment.deployment_id = `${bundle.deployment.deployment_id}::demo`;
  demo.deployment.administracion.administracion_id = `${bundle.deployment.administracion.administracion_id}::demo`;
  demo.deployment.enrolamiento.hashes_permitidos = [];
  demo.deployment.backend = {
    ...demo.deployment.backend,
    enabled: false,
    url: "",
    publishable_key: "",
  };
  demo.deployment.pilot_ready = false;
  return assertBundle(demo);
}
