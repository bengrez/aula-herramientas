import { flattenUnits } from "./contracts.mjs";

// Forma del "progress snapshot" que este módulo espera como segundo argumento (opcional): un
// objeto plano indexado por `unidad_id`, donde cada entrada trae al menos `attempts` (cantidad de
// respuestas no omitidas registradas para esa unidad, históricas — puede abarcar muchos sets de
// práctica pasados). Es exactamente lo que produce `progress.mjs`'s `buildProgressSummary`, sólo
// que reindexado por clave para lookup O(1):
//
//   const summary = buildProgressSummary(bundle, allPastResponses);
//   const snapshot = Object.fromEntries(summary.map((entry) => [entry.unidad_id, entry]));
//   const itemIds = selectPracticeItems(bundle, snapshot, { count: 10 });
//
// Una unidad ausente del snapshot se trata como "nunca practicada" (attempts: 0). Este módulo no
// toca IndexedDB ni el DOM: es una función pura (bank/progress adentro, lista ordenada de
// item_id afuera), igual que session-machine.mjs y evidence-map.mjs.

const PRIORITY_WEIGHT = { alta: 3, media: 2, diferida: 1 };

function groupMeasurementItemsByUnit(bankItems, preview) {
  const byUnit = new Map();
  for (const item of bankItems) {
    if (item.unidad_rol !== "medicion") continue;
    if (item.estado_clave !== "ok") continue;
    if (!preview && item.estado_revision !== "revisado_docente") continue;
    if (!preview && item.estimulo?.tipo === "figura" && item.estimulo.estado_revision !== "revisado_docente") continue;
    if (!byUnit.has(item.unidad_id)) byUnit.set(item.unidad_id, []);
    byUnit.get(item.unidad_id).push(item);
  }
  // Orden determinístico dentro de cada unidad: por item_id. Sin esto, dos corridas con el mismo
  // bank/progress podrían devolver órdenes distintas, lo que hace imposible testear ni razonar
  // sobre la selección.
  for (const items of byUnit.values()) items.sort((left, right) => left.item_id.localeCompare(right.item_id));
  return byUnit;
}

function orderUnitsByPriority(framework, unitIds, progress) {
  const priorityWeightById = new Map(flattenUnits(framework).map((unit) => [unit.id, PRIORITY_WEIGHT[unit.prioridad_diagnostico_v1] ?? 0]));
  return [...unitIds].sort((left, right) => {
    const attemptsLeft = progress[left]?.attempts ?? 0;
    const attemptsRight = progress[right]?.attempts ?? 0;
    if (attemptsLeft !== attemptsRight) return attemptsLeft - attemptsRight; // menos intentos primero
    const weightLeft = priorityWeightById.get(left) ?? 0;
    const weightRight = priorityWeightById.get(right) ?? 0;
    if (weightLeft !== weightRight) return weightRight - weightLeft; // mayor prioridad primero
    return left.localeCompare(right); // desempate estable
  });
}

// Una sola pasada de round-robin por todas las unidades, en el orden de prioridad calculado, de
// modo que las unidades preferidas aportan sus ítems primero pero todas quedan representadas antes
// de repetir cualquier ítem.
function buildInterleavedPool(unitOrder, itemsByUnit) {
  const cursors = new Map(unitOrder.map((unitId) => [unitId, 0]));
  const pool = [];
  let addedThisRound = true;
  while (addedThisRound) {
    addedThisRound = false;
    for (const unitId of unitOrder) {
      const items = itemsByUnit.get(unitId);
      const cursor = cursors.get(unitId);
      if (cursor >= items.length) continue;
      pool.push(items[cursor]);
      cursors.set(unitId, cursor + 1);
      addedThisRound = true;
    }
  }
  return pool;
}

// Ítems que el selector aceptaría con estas opciones (misma regla de revisión docente y filtros).
// Lo usa la interfaz para contar preguntas disponibles sin duplicar la lógica de elegibilidad.
export function eligiblePracticeItems(bank, { preview = false, unitIds = [], figuresOnly = false } = {}) {
  const itemsByUnit = groupMeasurementItemsByUnit(bank.bank.items.filter(item => (!unitIds.length || unitIds.includes(item.unidad_id)) && (!figuresOnly || item.estimulo?.tipo === "figura")), preview);
  return [...itemsByUnit.values()].flat();
}

/**
 * Selecciona hasta `count` ítems distintos para una tanda, de unidades poco practicadas.
 * Por defecto exige revisión docente; `preview` solo se usa en la demostración aislada.
 *
 * @param {object} bank - bundle con `.framework` y `.bank`, misma forma que valida contracts.mjs.
 * @param {object} [progress] - snapshot por unidad, ver comentario arriba. Default: sin historial.
 * @param {object} [options]
 * @param {number} [options.count=10] - cantidad de ítems a devolver.
 * @param {string[]} [options.recentItemIds=[]] - historial reciente (más antiguo primero, el
 *   último elemento es la respuesta más reciente); sólo se usa su último elemento, para evitar que
 *   el primer ítem elegido repita exactamente el último que el estudiante ya vio.
 * @returns {string[]} lista ordenada de `item_id` (sin `@version`: dentro de un mismo bank activo
 *   el par item_id/unidad_rol/clave es estable; el llamador ya tiene el bank cargado para resolver
 *   la versión si la necesita).
 */
export function selectPracticeItems(bank, progress = {}, { count = 10, recentItemIds = [], preview = false, unitIds = [], figuresOnly = false, ensureFigure = false } = {}) {
  if (!Number.isInteger(count) || count <= 0) return [];
  const itemsByUnit = groupMeasurementItemsByUnit(bank.bank.items.filter(item => (!unitIds.length || unitIds.includes(item.unidad_id)) && (!figuresOnly || item.estimulo?.tipo === "figura")), preview);
  if (itemsByUnit.size === 0) return [];
  const seen = new Map();
  for (const id of recentItemIds) seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const items of itemsByUnit.values()) items.sort((a,b) => (seen.get(a.item_id) ?? 0) - (seen.get(b.item_id) ?? 0));

  const unitOrder = orderUnitsByPriority(bank.framework, itemsByUnit.keys(), progress);
  const pool = buildInterleavedPool(unitOrder, itemsByUnit);

  // Sin reposición dentro de una tanda. La repetición ocurre entre tandas.
  if (pool.length > 1 && pool[0].item_id === recentItemIds.at(-1)) pool.push(pool.shift());
  if (ensureFigure || figuresOnly) {
    // Una figura visible desde la primera pregunta; rota primero las variantes menos vistas.
    // El filtro de unidad y la aprobación docente ya se aplicaron arriba.
    const candidates = pool.filter(i => i.estimulo?.tipo === "figura").sort((a, b) =>
      (seen.get(a.item_id) ?? 0) - (seen.get(b.item_id) ?? 0) ||
      Number(a.item_id === recentItemIds.at(-1)) - Number(b.item_id === recentItemIds.at(-1)));
    if (candidates.length) pool.unshift(...pool.splice(pool.indexOf(candidates[0]), 1));
  }
  const figures = new Set();
  return pool.filter(item => {
    const id = item.estimulo?.figura_id;
    if (!id) return true;
    if (figures.has(id)) return false;
    figures.add(id); return true;
  }).slice(0, count).map(item => item.item_id);
}
