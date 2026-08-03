import { validateEnrollmentCode } from "../engine/enrollment-code.mjs";
import { SupabaseHttp } from "./supabase-http.mjs";

const ACCEPTED_RECEIPTS = new Set(["confirmed", "already_confirmed"]);

function transientFailure(error) {
  return !Number.isInteger(error?.status)
    || error.status === 408
    || error.status === 429
    || error.status >= 500;
}

export function assertEnrollmentReceipt(receipt) {
  if (!receipt || !ACCEPTED_RECEIPTS.has(receipt.status)) {
    throw new Error("El servidor no confirmó la tarjeta con un estado reconocido");
  }
  return receipt;
}

export async function authorizeEnrollment(rawCode, bundle, {
  demo = false,
  online = globalThis.navigator?.onLine !== false,
  storage = globalThis.localStorage,
  fetcher = globalThis.fetch?.bind(globalThis),
} = {}) {
  const local = await validateEnrollmentCode(rawCode, bundle.deployment.enrolamiento, { demo });
  if (!local.ok) return local;
  if (demo) {
    return { ...local, enrollment_status: "confirmed", checked_at: new Date().toISOString() };
  }

  const backend = bundle.deployment.backend;
  if (!online || !backend.enabled) {
    return {
      ...local,
      enrollment_status: "provisional",
      provisional_reason: online ? "backend_no_disponible" : "sin_conexion",
      checked_at: null,
    };
  }

  try {
    const client = new SupabaseHttp(backend, storage, fetcher);
    const receipt = assertEnrollmentReceipt(await client.rpc(backend.enrollment_rpc_name, {
      p_enrollment_code: local.formatted,
      p_administration_id: bundle.deployment.administracion.administracion_id,
      p_session_template_id: bundle.session.plantilla_id,
      p_session_version: bundle.session.version,
    }));
    return {
      ...local,
      enrollment_status: "confirmed",
      checked_at: new Date().toISOString(),
      receipt_status: receipt.status,
    };
  } catch (error) {
    if (transientFailure(error)) {
      return {
        ...local,
        enrollment_status: "provisional",
        provisional_reason: "comprobacion_temporalmente_no_disponible",
        checked_at: null,
      };
    }
    return {
      ...local,
      ok: false,
      reason: "La tarjeta no pudo confirmarse para esta sesión. Pide al adulto a cargo que la revise.",
    };
  }
}
