import { normalizeCode, validateEnrollmentCode } from "./enrollment-code.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function fail(message) {
  throw new Error(`El respaldo no coincide con la sesión activa: ${message}`);
}

export async function validateBackupForBundle(decoded, bundle, { demo = false } = {}) {
  const { attempt, responses } = decoded ?? {};
  if (!attempt || !Array.isArray(responses)) fail("estructura incompleta");
  if (!UUID.test(attempt.attempt_id)) fail("identificador de intento inválido");
  if (attempt.administration_id !== bundle.deployment.administracion.administracion_id) fail("administración distinta");
  if (attempt.session_template_id !== bundle.session.plantilla_id || attempt.session_version !== bundle.session.version) fail("plantilla o versión distinta");
  if (attempt.framework_id !== bundle.framework.marco_id || attempt.framework_version !== bundle.framework.version) fail("marco o versión distinta");
  if (!validTimestamp(attempt.completed_at)) fail("fecha de término inválida");

  const code = await validateEnrollmentCode(attempt.enrollment_code, bundle.deployment.enrolamiento, { demo });
  if (!code.ok || normalizeCode(code.formatted) !== normalizeCode(attempt.enrollment_code)) fail("código no autorizado");

  const refs = [...bundle.session.items].sort((left, right) => left.orden - right.orden);
  const bank = new Map(bundle.bank.items.map((item) => [`${item.item_id}@${item.version}`, item]));
  if (responses.length !== refs.length) fail(`se esperaban ${refs.length} respuestas`);
  const responseIds = new Set();
  let source = null;
  responses.forEach((response, index) => {
    const ref = refs[index];
    const item = bank.get(`${ref.item_id}@${ref.item_version}`);
    if (!UUID.test(response.response_id) || responseIds.has(response.response_id)) fail(`identificador inválido o repetido en el ítem ${index + 1}`);
    responseIds.add(response.response_id);
    if (response.attempt_id !== attempt.attempt_id) fail(`intento incoherente en el ítem ${index + 1}`);
    if (response.item_id !== ref.item_id || response.item_version !== ref.item_version || response.presentation_order !== index + 1) fail(`ítem, versión u orden incoherente en la posición ${index + 1}`);
    if (!item) fail(`ítem inexistente en la posición ${index + 1}`);
    if (response.selected_option !== null && !item.alternativas.some((alternative) => alternative.id === response.selected_option)) fail(`alternativa inválida en el ítem ${index + 1}`);
    if (response.omitted !== (response.selected_option === null)) fail(`omisión incoherente en el ítem ${index + 1}`);
    if (!validTimestamp(response.client_recorded_at)) fail(`fecha local inválida en el ítem ${index + 1}`);
    if (!source) source = response.source;
    if (response.source !== source) fail("procedencias mezcladas");
  });

  if (source === "device") {
    if (!validTimestamp(attempt.started_at) || Date.parse(attempt.completed_at) < Date.parse(attempt.started_at)) fail("tiempos de dispositivo inválidos");
    if (responses.some((response) => !Number.isInteger(response.response_time_ms) || response.response_time_ms < 0 || response.response_time_ms > 3_600_000)) fail("tiempo por ítem inválido");
  } else if (source === "paper") {
    if (attempt.started_at !== null || responses.some((response) => response.response_time_ms !== null)) fail("la procedencia papel no debe inventar tiempos");
  } else {
    fail("procedencia no permitida");
  }
  return { ...decoded, enrollment: code, source };
}
