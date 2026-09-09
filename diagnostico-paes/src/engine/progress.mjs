import { itemMap } from "./loader.mjs";

// Los conteos son descriptivos. No se infiere dominio con umbrales no calibrados,
// especialmente cuando varias respuestas corresponden al mismo ítem repetido.
/**
 * Calcula, a partir de un arreglo de respuestas crudas (misma forma que produce
 * `session-machine.mjs`'s `createRawResponse`, pudiendo abarcar muchos sets de práctica pasados
 * guardados localmente) más el bundle framework/bank, un resumen de progreso por `unidad_id`.
 *
 * Sólo cuentan las respuestas de ítems con `unidad_rol === "medicion"` (los de "contexto" no
 * aportan al eje de contenido) y que no fueron omitidas (`selected_option !== null`): una omisión
 * no es evidencia de acierto ni de error, igual que en evidence-map.mjs. Una respuesta que
 * referencia un `item_id@item_version` que ya no existe en el bank activo se ignora en silencio
 * (banco reemplazado entre sesiones) en vez de lanzar.
 *
 * Incluye en el resultado toda unidad que tenga al menos un ítem de medición en el bank activo,
 * aunque no tenga ninguna respuesta todavía (attempts: 0, correct: 0, accuracy: null,
 * last_practiced_at: null) — así el llamador puede pintar "aún sin practicar" sin tener que cruzar
 * el framework por su cuenta.
 *
 * Pura/local: no lee ni escribe IndexedDB.
 *
 * @param {object} bundle - con `.framework` y `.bank`, misma forma que valida contracts.mjs.
 * @param {object[]} responses - respuestas crudas, forma de `createRawResponse`.
 * @returns {{unidad_id: string, attempts: number, correct: number, accuracy: number|null, last_practiced_at: string|null}[]}
 *   ordenado por `unidad_id` para salida determinística.
 */
export function buildProgressSummary(bundle, responses) {
  const items = itemMap(bundle);
  const buckets = new Map();
  for (const item of bundle.bank.items) {
    if (item.unidad_rol !== "medicion") continue;
    if (!buckets.has(item.unidad_id)) buckets.set(item.unidad_id, { attempts: 0, correct: 0, lastPracticedAt: null });
  }

  for (const response of responses) {
    const item = items.get(`${response.item_id}@${response.item_version}`);
    if (!item || item.unidad_rol !== "medicion") continue;
    if (response.selected_option === null) continue;
    if (!buckets.has(item.unidad_id)) buckets.set(item.unidad_id, { attempts: 0, correct: 0, lastPracticedAt: null });
    const bucket = buckets.get(item.unidad_id);
    bucket.attempts += 1;
    if (response.selected_option === item.clave) bucket.correct += 1;
    const respondedAt = response.client_recorded_at ?? null;
    if (respondedAt && (!bucket.lastPracticedAt || respondedAt > bucket.lastPracticedAt)) {
      bucket.lastPracticedAt = respondedAt;
    }
  }

  return [...buckets.entries()]
    .map(([unidad_id, bucket]) => ({
      unidad_id,
      attempts: bucket.attempts,
      correct: bucket.correct,
      accuracy: bucket.attempts === 0 ? null : bucket.correct / bucket.attempts,
      last_practiced_at: bucket.lastPracticedAt,
    }))
    .sort((left, right) => left.unidad_id.localeCompare(right.unidad_id));
}

// El agregado remoto suma todos los dispositivos, así que normalmente cubre lo que este aparato ya
// respaldó. Si el servidor pierde información —el plan gratuito de Supabase no incluye respaldos
// automáticos ni recuperación a un punto en el tiempo— la instantánea vuelve más pobre que el
// historial local. Sin un piso, el cliente la aceptaría y dejaría de contar las tandas ya
// reconocidas, que nunca se reenvían: el estudiante vería caer su avance a cero en todos sus
// teléfonos pese a conservarlo intacto aquí. Por eso lo ya respaldado por este dispositivo actúa
// como mínimo por unidad. Nunca inventa avance: sólo se niega a olvidar el propio.
function countByUnit(sets, include) {
  const rows = new Map();
  for (const set of sets) {
    if (!include(set)) continue;
    for (const response of set.responses) {
      const row = rows.get(response.unidad_id) ?? { attempts: 0, correct: 0, omitted: 0 };
      // Una omisión se cuenta aparte: nunca como intento ni como error (ADR-0008 §Finalidad).
      if (response.selected_option === null) row.omitted += 1;
      else { row.attempts += 1; row.correct += Number(response.correct); }
      rows.set(response.unidad_id, row);
    }
  }
  return rows;
}

// El piso se aplica contador a contador. Elegir una fila entera por su total podía bajar `attempts`
// por debajo de lo que el servidor acababa de informar, justo en el caso que pretende proteger.
// Es seguro: como en cada fuente `correct <= attempts`, el máximo de aciertos nunca supera el
// máximo de intentos.
const atLeast = (counted, floor) => ({
  attempts: Math.max(Number(counted.attempts ?? 0), Number(floor?.attempts ?? 0)),
  correct: Math.max(Number(counted.correct ?? 0), Number(floor?.correct ?? 0)),
  omitted: Math.max(Number(counted.omitted ?? 0), Number(floor?.omitted ?? 0)),
});

export function accumulatedProgress(profile) {
  const acknowledged = new Set(profile.acknowledged ?? []);
  const backed = countByUnit(profile.sets, (set) => acknowledged.has(set.id));
  const rows = new Map();
  for (const remote of profile.remote ?? []) {
    rows.set(remote.unidad_id, { ...remote, ...atLeast(remote, backed.get(remote.unidad_id)) });
  }
  for (const [unidad_id, floor] of backed) if (!rows.has(unidad_id)) rows.set(unidad_id, { unidad_id, ...floor });
  for (const [unidad_id, pending] of countByUnit(profile.sets, (set) => !acknowledged.has(set.id))) {
    const row = rows.get(unidad_id) ?? { unidad_id, attempts: 0, correct: 0, omitted: 0 };
    rows.set(unidad_id, { ...row, attempts: row.attempts + pending.attempts, correct: row.correct + pending.correct, omitted: Number(row.omitted ?? 0) + pending.omitted });
  }
  return [...rows.values()].sort((left, right) => left.unidad_id.localeCompare(right.unidad_id));
}
