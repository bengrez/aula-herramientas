import test from "node:test";
import assert from "node:assert/strict";
import { setSummary, unitProgressRows, suggestNextUnit, lastPracticedDay, describeDay } from "../../src/engine/practice-summary.mjs";
import { newPracticeSet, answerPracticeSet, continuePracticeSet } from "../../src/engine/practice.mjs";
import { readPracticeDocuments } from "../../tools/practice-readiness.mjs";

const uuid = "22222222-2222-4222-8222-222222222222";
const items = ["A", "B", "C"].map(n => ({ item_id: `I${n}`, version: "1", unidad_id: `U${n}`, clave: "A", alternativas: [{ id: "A" }, { id: "B" }] }));
const profile = (sets = [], extra = {}) => ({ key: "scope:synthetic", sets, remote: [], acknowledged: [], ...extra });

test("resumen de tanda sigue el orden de las preguntas y distingue omisión de error", () => {
  let set = newPracticeSet(items, { uuid });
  assert.deepEqual(setSummary(set).states, ["pending", "pending", "pending"]);
  assert.equal(setSummary(set).remaining, 3);
  set = answerPracticeSet(set, "A");
  assert.deepEqual(setSummary(set).states, ["correct", "pending", "pending"]);
  assert.equal(setSummary(set).state, "feedback");
  set = continuePracticeSet(set);
  set = continuePracticeSet(answerPracticeSet(set, null));
  set = continuePracticeSet(answerPracticeSet(set, "B"));
  const summary = setSummary(set);
  assert.deepEqual(summary.states, ["correct", "omitted", "incorrect"]);
  assert.equal(summary.answered, 2); assert.equal(summary.correct, 1); assert.equal(summary.incorrect, 1);
  assert.equal(summary.omitted, 1); assert.equal(summary.remaining, 0); assert.equal(summary.state, "completed");
});

test("filas por unidad usan etiquetas del marco, cuentan figuras y no inventan intentos", async () => {
  const bundle = await readPracticeDocuments();
  const rows = unitProgressRows(bundle, profile());
  assert.equal(rows.length, 14);
  assert.ok(rows.every(r => r.attempts === 0 && r.correct === 0 && r.last_practiced_on === null));
  const mitosis = rows.find(r => r.unidad_id === "BIO-03.02");
  assert.equal(mitosis.etiqueta, "Interfase y mitosis");
  assert.equal(mitosis.area_etiqueta, "Herencia y evolución");
  // Tres ítems, pero PV-MI-01 y PV-MI-02 comparten figura: una tanda entrega dos.
  assert.equal(mitosis.items, 2); assert.equal(mitosis.figures, 2);
  // Orden del marco, no alfabético ni por intentos.
  assert.deepEqual(rows.slice(0, 2).map(r => r.unidad_id), ["BIO-01.01", "BIO-01.03"]);
});

test("filas por unidad suman local + remoto y toman la fecha más reciente", async () => {
  const bundle = await readPracticeDocuments();
  const local = { unidad_id: "BIO-03.02", selected_option: "A", correct: true, day: "2026-09-08" };
  const p = profile(
    [{ id: uuid, state: "completed", items: [], cursor: 1, responses: [local, { ...local, selected_option: null, correct: false, day: "2026-09-09" }] }],
    { remote: [{ unidad_id: "BIO-03.02", attempts: 2, correct: 1, last_practiced_on: "2026-09-01" }] },
  );
  const row = unitProgressRows(bundle, p).find(r => r.unidad_id === "BIO-03.02");
  assert.equal(row.attempts, 3); assert.equal(row.correct, 2);
  assert.equal(row.omitted, 1, "la omisión se cuenta aparte, nunca como intento ni como error");
  // La fecha responde "cuándo viste este tema", así que avanza también con una omisión. Es la
  // misma regla que aplica practiceDelta, para que el dato no cambie al sincronizar.
  assert.equal(row.last_practiced_on, "2026-09-09");
});

test("sugerencia elige la unidad menos practicada; empata por prioridad y luego por orden", () => {
  const rows = [
    { unidad_id: "a", attempts: 2, prioridad: "alta" },
    { unidad_id: "b", attempts: 0, prioridad: "media" },
    { unidad_id: "c", attempts: 0, prioridad: "alta" },
    { unidad_id: "d", attempts: 0, prioridad: "alta" },
  ];
  assert.equal(suggestNextUnit(rows).unidad_id, "c");
  assert.equal(suggestNextUnit([]), null);
  assert.equal(suggestNextUnit(rows.slice(0, 1)).unidad_id, "a");
});

test("última práctica cuenta cualquier pregunta vista e ignora las respuestas sin día", () => {
  assert.equal(lastPracticedDay(profile()), null);
  const p = profile([{ id: uuid, state: "completed", items: [], cursor: 2, responses: [
    { unidad_id: "u", selected_option: "A", correct: true, day: "2026-09-05" },
    { unidad_id: "u", selected_option: null, correct: false, day: "2026-09-07" },
    { unidad_id: "u", selected_option: "B", correct: false, day: "2026-09-05" },
    { unidad_id: "u", selected_option: "B", correct: false },
  ] }], { remote: [{ unidad_id: "u", attempts: 1, correct: 1, last_practiced_on: "2026-09-06" }] });
  assert.equal(lastPracticedDay(p), "2026-09-07", "la omisión del 09-07 sí marca que vio el tema");
});

test("descripción relativa del día no muestra fechas crudas", () => {
  const today = "2026-09-08";
  assert.equal(describeDay(null, today), "aún sin practicar");
  assert.equal(describeDay("2026-09-08", today), "hoy");
  assert.equal(describeDay("2026-09-07", today), "ayer");
  assert.equal(describeDay("2026-09-04", today), "hace 4 días");
  assert.equal(describeDay("2026-08-30", today), "hace una semana");
  assert.equal(describeDay("2026-08-18", today), "hace 3 semanas");
  assert.equal(describeDay("2026-06-01", today), "hace más de un mes");
});

import { latestCompletedSet, setUnitRows, resolvePracticeOptions, hasFreshItems, PRACTICE_COUNTS } from "../../src/engine/practice-summary.mjs";
import { eligiblePracticeItems } from "../../src/engine/practice-selector.mjs";

test("última tanda completada y filas por unidad de una tanda distinguen omisiones", () => {
  const a = { id: "a", state: "completed", items: [], cursor: 0, responses: [{ unidad_id: "U1", selected_option: "A", correct: true }] };
  const b = { id: "b", state: "completed", items: [], cursor: 0, responses: [{ unidad_id: "U2", selected_option: null, correct: false }, { unidad_id: "U2", selected_option: "B", correct: false }] };
  const c = { id: "c", state: "answer", items: [], cursor: 0, responses: [] };
  assert.equal(latestCompletedSet(profile([a, b, c])).id, "b");
  assert.equal(latestCompletedSet(profile([c])), null);
  assert.deepEqual(setUnitRows(b, [{ unidad_id: "U2", etiqueta: "Dos" }]), [{ unidad_id: "U2", etiqueta: "Dos", attempts: 1, correct: 0, omitted: 1 }]);
  assert.equal(setUnitRows(a).at(0).etiqueta, "U1", "sin catálogo, conserva el id");
});

test("opciones recordadas se sanean contra la biblioteca vigente", () => {
  const rows = [{ unidad_id: "U1", figures: 0 }, { unidad_id: "U2", figures: 2 }];
  assert.deepEqual(resolvePracticeOptions(rows, null), { count: 5, unitIds: [], figuresOnly: false, ensureFigure: true });
  assert.deepEqual(resolvePracticeOptions(rows, { count: 7, unitIds: ["U9", "U1"], figuresOnly: true }), { count: 5, unitIds: ["U1"], figuresOnly: false, ensureFigure: true });
  assert.deepEqual(resolvePracticeOptions(rows, { count: 10, unitIds: ["U2"], figuresOnly: true }), { count: 10, unitIds: ["U2"], figuresOnly: true, ensureFigure: false });
  assert.equal(resolvePracticeOptions(rows, {}, { defaultCount: 3 }).count, 3);
  assert.equal(resolvePracticeOptions(rows, {}, { defaultCount: 99 }).count, 5);
  assert.deepEqual(PRACTICE_COUNTS, [3, 5, 10]);
});

test("preguntas nuevas: agotar una unidad de un ítem se detecta; la mezcla sigue teniendo", async () => {
  const bundle = await readPracticeDocuments();
  const unit = "BIO-01.01";
  const only = eligiblePracticeItems(bundle, { preview: true, unitIds: [unit] });
  assert.equal(only.length, 1);
  assert.equal(eligiblePracticeItems(bundle, { unitIds: [unit] }).length, 0, "sin preview, nada está aprobado");
  const empty = profile();
  assert.equal(hasFreshItems(bundle, empty, { preview: true, unitIds: [unit] }), true);
  const done = profile([{ id: uuid, state: "completed", items: [], cursor: 0, responses: [{ item_id: only[0].item_id, unidad_id: unit, selected_option: "A", correct: false }] }]);
  assert.equal(hasFreshItems(bundle, done, { preview: true, unitIds: [unit] }), false);
  assert.equal(hasFreshItems(bundle, done, { preview: true }), true);
  assert.equal(eligiblePracticeItems(bundle, { preview: true, figuresOnly: true }).length, 4);
});
