import { assertFramework, assertBank, flattenUnits } from "./contracts.mjs";
import { isValidSupabaseBackendUrl, isPlausibleSupabasePublishableKey } from "./release-readiness.mjs";

export const PRACTICE_GATES = ["aviso_estudiantes_apoderados", "retiro_informacion", "retencion_operativa", "revision_docente", "telefono_offline_real", "postgres_local", "navegador_local", "backend_remoto", "operacion_docente"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertPracticeBundle(bundle) {
  const { framework, bank, config } = bundle;
  assertBank(bank, assertFramework(framework));
  if (config.mode !== "practice" || config.schema_version !== 1 || !config.scope_id) throw new Error("Configuración de práctica inválida");
  if (!Number.isInteger(config.default_count) || config.default_count < 1 || config.default_count > 50) throw new Error("Tamaño de tanda inválido");
  const enrollment = config.enrollment;
  if (typeof enrollment?.alfabeto !== "string" || enrollment.alfabeto.length < 2 || !Number.isInteger(enrollment.longitud_carga) || !Number.isInteger(enrollment.multiplicador) || !Array.isArray(enrollment.grupos)) throw new Error("Configuración de código inválida");
  const units = new Map(flattenUnits(framework).map(unit => [unit.id, unit]));
  const ids = new Set();
  for (const item of bank.items) {
    if (ids.has(item.item_id)) throw new Error("Identificador duplicado en banco de práctica");
    ids.add(item.item_id);
    if (item.unidad_rol !== "medicion" || !units.get(item.unidad_id)?.criterios_compatibles.includes(item.criterio_id)) throw new Error(`Unidad/criterio incompatible: ${item.item_id}`);
    if (!item.razonamiento_esperado?.trim() || !["pendiente_revision_docente", "revisado_docente"].includes(item.estado_revision)) throw new Error(`Revisión/feedback inválido: ${item.item_id}`);
  }
  return bundle;
}
export function practiceReadiness({ bank, config }) {
  const checks = [
    { id: "banco_aprobado", passed: bank.estado_autoria === "contenido_docente_revisado" && bank.items.length > 0 && bank.items.every(i => i.estado_revision === "revisado_docente" && i.estado_clave === "ok" && (i.estimulo?.tipo !== "figura" || i.estimulo.estado_revision === "revisado_docente")) },
    ...PRACTICE_GATES.map(id => ({ id, passed: config.gates?.[id] === true })),
    { id: "backend_habilitado", passed: config.backend?.enabled === true && isValidSupabaseBackendUrl(config.backend.url) && isPlausibleSupabasePublishableKey(config.backend.publishable_key) },
    { id: "autorizacion_publicacion", passed: config.pilot_ready === true },
  ];
  return { ready: checks.every(c => c.passed), checks };
}
export function newPracticeSet(items, { uuid = crypto.randomUUID(), now = new Date().toISOString() } = {}) {
  if (!items.length || new Set(items.map(i => i.item_id)).size !== items.length) throw new Error("La tanda requiere preguntas distintas");
  return { id: uuid, items: structuredClone(items), state: "answer", cursor: 0, responses: [], created_at: now };
}
export function answerPracticeSet(set, option, { now = new Date().toISOString() } = {}) {
  if (set.state !== "answer") throw new Error("La respuesta ya fue registrada");
  const item = set.items[set.cursor];
  if (option !== null && !item.alternativas.some(a => a.id === option)) throw new Error("Alternativa inválida");
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  return { ...set, state: "feedback", responses: [...set.responses, { item_id: item.item_id, item_version: item.version, unidad_id: item.unidad_id, selected_option: option, correct: option === item.clave, day }] };
}
export function continuePracticeSet(set) {
  if (set.state !== "feedback") throw new Error("Falta comprobar la respuesta");
  return { ...set, cursor: set.cursor + 1, state: set.cursor + 1 === set.items.length ? "completed" : "answer" };
}
const later = (left, right) => (left && right ? (left > right ? left : right) : left || right || null);

// El único payload que sale del dispositivo. No se serializa la tanda ni sus respuestas: sólo
// conteos por unidad. Las omisiones viajan en su propia columna, nunca sumadas a los intentos ni a
// los errores (ADR-0008 §Finalidad).
//
// `last_practiced_on` significa "la última vez que esta unidad apareció en una tanda", y por eso
// avanza con cualquier respuesta, contestada u omitida. La regla es una sola en cliente y servidor:
// una definición distinta a cada lado hacía que el mismo hecho cambiara de fecha al sincronizar.
export function practiceDelta(set, scope_id) {
  if (set.state !== "completed") throw new Error("Tanda incompleta");
  const buckets = new Map();
  for (const r of set.responses) {
    const b = buckets.get(r.unidad_id) ?? { unidad_id: r.unidad_id, attempts: 0, correct: 0, omitted: 0, last_practiced_on: null };
    if (r.selected_option === null) b.omitted++;
    else { b.attempts++; b.correct += Number(r.correct); }
    b.last_practiced_on = later(b.last_practiced_on, r.day);
    buckets.set(r.unidad_id, b);
  }
  const deltas = [...buckets.values()].sort((a, b) => a.unidad_id.localeCompare(b.unidad_id));
  return { scope_id, batch_id: set.id, deltas };
}
export function assertPracticeDelta(payload) {
  if (Object.keys(payload).sort().join() !== "batch_id,deltas,scope_id" || !uuidPattern.test(payload.batch_id) || typeof payload.scope_id !== "string") throw new Error("Payload no permitido");
  if (!Array.isArray(payload.deltas) || payload.deltas.length < 1 || payload.deltas.length > 50) throw new Error("Deltas inválidos");
  const ids = new Set();
  for (const d of payload.deltas) {
    if (Object.keys(d).sort().join() !== "attempts,correct,last_practiced_on,omitted,unidad_id" || typeof d.unidad_id !== "string" || ids.has(d.unidad_id)) throw new Error("Campos o unidad inválidos");
    ids.add(d.unidad_id);
    // Una unidad sólo aparece si tuvo al menos una pregunta; puede haber sido toda sin responder.
    const seen = d.attempts + d.omitted;
    if (!Number.isInteger(d.attempts) || d.attempts < 0 || !Number.isInteger(d.omitted) || d.omitted < 0 || !Number.isInteger(seen) || seen < 1 || seen > 50) throw new Error("Conteos o fecha inválidos");
    if (!Number.isInteger(d.correct) || d.correct < 0 || d.correct > d.attempts || !/^\d{4}-\d{2}-\d{2}$/.test(d.last_practiced_on) || !Number.isFinite(Date.parse(d.last_practiced_on))) throw new Error("Conteos o fecha inválidos");
  }
  if (payload.deltas.reduce((n, d) => n + d.attempts + d.omitted, 0) > 50) throw new Error("Tanda demasiado larga");
  return payload;
}
export { accumulatedProgress } from "./progress.mjs";
