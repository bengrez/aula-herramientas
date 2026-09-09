import { flattenUnits } from "./contracts.mjs";
import { accumulatedProgress } from "./progress.mjs";
import { eligiblePracticeItems } from "./practice-selector.mjs";

// Vistas puras del progreso para la interfaz de práctica. Solo describen conteos: no infieren
// dominio, nivel ni puntaje (ADR-0008). Una omisión no es un error; una unidad sin intentos es
// territorio todavía no practicado, no desempeño débil.

const PRIORITY_WEIGHT = { alta: 3, media: 2, diferida: 1 };

// Estado de cada pregunta de una tanda, en el orden de la tanda, para el riel de avance.
export function setSummary(set) {
  const states = set.items.map((item, index) => {
    const response = set.responses[index];
    if (!response) return "pending";
    if (response.selected_option === null) return "omitted";
    return response.correct ? "correct" : "incorrect";
  });
  const answered = set.responses.filter(r => r.selected_option !== null).length;
  const correct = set.responses.filter(r => r.selected_option !== null && r.correct).length;
  return {
    total: set.items.length,
    cursor: set.cursor,
    state: set.state,
    answered,
    correct,
    incorrect: answered - correct,
    omitted: set.responses.length - answered,
    remaining: set.items.length - set.responses.length,
    states,
  };
}

function laterDay(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

// Una fila por unidad que tenga preguntas en la biblioteca activa, en el orden del marco.
export function unitProgressRows(bundle, profile) {
  const progress = new Map(accumulatedProgress(profile).map(r => [r.unidad_id, r]));
  const remoteLast = new Map((profile.remote ?? []).map(r => [r.unidad_id, r.last_practiced_on ?? null]));
  const localLast = new Map();
  for (const set of profile.sets) {
    for (const r of set.responses) {
      if (!r.day) continue;
      localLast.set(r.unidad_id, laterDay(localLast.get(r.unidad_id), r.day));
    }
  }
  const areas = new Map(bundle.framework.areas.map(a => [a.id, a]));
  const items = bundle.bank.items.filter(i => i.unidad_rol === "medicion");
  return flattenUnits(bundle.framework)
    .filter(unit => items.some(i => i.unidad_id === unit.id))
    .map(unit => {
      const own = items.filter(i => i.unidad_id === unit.id);
      const row = progress.get(unit.id);
      return {
        unidad_id: unit.id,
        etiqueta: unit.etiqueta,
        eje: unit.eje,
        area_id: unit.area_id,
        area_etiqueta: areas.get(unit.area_id)?.etiqueta ?? unit.area_id,
        prioridad: unit.prioridad_diagnostico_v1,
        // Lo que una tanda puede entregar: el selector usa una sola variante por figura.
        items: new Set(own.map(i => i.estimulo?.figura_id ?? i.item_id)).size,
        figures: own.filter(i => i.estimulo?.tipo === "figura").length,
        attempts: row?.attempts ?? 0,
        correct: row?.correct ?? 0,
        omitted: Number(row?.omitted ?? 0),
        last_practiced_on: laterDay(localLast.get(unit.id) ?? null, remoteLast.get(unit.id) ?? null),
      };
    });
}

// Totales de cabecera calculados sobre las MISMAS filas que se listan. Sumarlos por otra vía
// permitía que una unidad ya retirada del banco inflara los contadores y produjera «2 de 1».
export function progressTotals(rows) {
  return rows.reduce((acc, row) => ({
    attempts: acc.attempts + row.attempts,
    correct: acc.correct + row.correct,
    units: acc.units + (row.attempts > 0 ? 1 : 0),
  }), { attempts: 0, correct: 0, units: 0 });
}

// Unidad menos practicada; empata por prioridad del marco y luego por orden del marco.
export function suggestNextUnit(rows) {
  if (!rows.length) return null;
  return rows.reduce((best, row) => {
    if (!best) return row;
    if (row.attempts !== best.attempts) return row.attempts < best.attempts ? row : best;
    const weight = (PRIORITY_WEIGHT[row.prioridad] ?? 0) - (PRIORITY_WEIGHT[best.prioridad] ?? 0);
    return weight > 0 ? row : best;
  }, null);
}

// Último día en que el estudiante vio alguna pregunta, local o respaldado. `null` si nunca abrió
// una tanda. Cuenta también las omitidas: mira una regla única en `practiceDelta`.
export function lastPracticedDay(profile) {
  let day = null;
  for (const set of profile.sets) for (const r of set.responses) if (r.day) day = laterDay(day, r.day);
  for (const r of profile.remote ?? []) day = laterDay(day, r.last_practiced_on ?? null);
  return day;
}

export function todayInSantiago(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Texto breve y relativo, para no mostrar fechas crudas al estudiante.
export function describeDay(day, today) {
  if (!day) return "aún sin practicar";
  if (day === today) return "hoy";
  const diff = Math.round((Date.parse(today) - Date.parse(day)) / 86400000);
  if (diff === 1) return "ayer";
  if (diff > 1 && diff < 7) return `hace ${diff} días`;
  if (diff >= 7 && diff < 14) return "hace una semana";
  if (diff >= 14 && diff < 60) return `hace ${Math.round(diff / 7)} semanas`;
  if (diff >= 60) return "hace más de un mes";
  return "hoy";
}

// Tanda completada más reciente (por orden de creación en el perfil), para reabrir su resumen.
export function latestCompletedSet(profile) {
  return [...profile.sets].reverse().find(s => s.state === "completed") ?? null;
}

// Filas de la tanda por unidad, en orden de aparición, con la etiqueta del marco cuando exista.
export function setUnitRows(set, rows = []) {
  const labels = new Map(rows.map(r => [r.unidad_id, r.etiqueta]));
  const byUnit = new Map();
  for (const r of set.responses) {
    const row = byUnit.get(r.unidad_id) ?? { unidad_id: r.unidad_id, etiqueta: labels.get(r.unidad_id) ?? r.unidad_id, attempts: 0, correct: 0, omitted: 0 };
    if (r.selected_option === null) row.omitted++;
    else { row.attempts++; row.correct += Number(r.correct); }
    byUnit.set(r.unidad_id, row);
  }
  return [...byUnit.values()];
}

export const PRACTICE_COUNTS = [3, 5, 10];

// Sanea las opciones recordadas (localStorage) contra la biblioteca vigente: unidades que ya no
// existen, cantidades fuera del catálogo o "solo diagramas" donde no hay figuras caen al default.
export function resolvePracticeOptions(rows, raw, { defaultCount = 5 } = {}) {
  const fallback = PRACTICE_COUNTS.includes(defaultCount) ? defaultCount : 5;
  const count = PRACTICE_COUNTS.includes(raw?.count) ? raw.count : fallback;
  const unitIds = Array.isArray(raw?.unitIds) ? raw.unitIds.filter(id => rows.some(r => r.unidad_id === id)) : [];
  const figuresAvailable = rows.some(r => (!unitIds.length || unitIds.includes(r.unidad_id)) && r.figures > 0);
  const figuresOnly = raw?.figuresOnly === true && figuresAvailable;
  return { count, unitIds, figuresOnly, ensureFigure: !figuresOnly };
}

// ¿Queda alguna pregunta elegible con estas opciones que el estudiante no haya respondido nunca?
export function hasFreshItems(bundle, profile, options = {}) {
  const seen = new Set(profile.sets.flatMap(s => s.responses.map(r => r.item_id)));
  return eligiblePracticeItems(bundle, options).some(item => !seen.has(item.item_id));
}
