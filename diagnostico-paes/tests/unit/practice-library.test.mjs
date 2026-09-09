import test from "node:test";
import assert from "node:assert/strict";
import { combinePracticeBanks, mergeDemoProfiles, mergeProfiles, practiceOverview } from "../../src/engine/practice-library.mjs";
import { selectPracticeItems } from "../../src/engine/practice-selector.mjs";
import { readPracticeDocuments } from "../../tools/practice-readiness.mjs";

test("combinar no muta fuentes ni permite duplicados o marcos incompatibles", () => {
  const a = { banco_id: "a", marco_id: "m", marco_version: "1", estado_autoria: "contenido_docente_revisado", items: [{ item_id: "i" }] };
  const b = { ...a, banco_id: "b", estado_autoria: "contenido_docente_pendiente_revision", items: [{ item_id: "j" }] };
  const before = structuredClone([a, b]);
  const result = combinePracticeBanks([a, b]);
  assert.equal(result.items.length, 2);
  assert.equal(result.estado_autoria, b.estado_autoria);
  assert.deepEqual([a, b], before);
  assert.throws(() => combinePracticeBanks([]), /vacía/);
  assert.throws(() => combinePracticeBanks([a, a]), /duplicado/);
  assert.throws(() => combinePracticeBanks([a, { ...b, marco_version: "2" }]), /incompatibles/);
});

test("tanda mixta empieza con figura incluso tras practicar mucho sus unidades", async () => {
  const b = await readPracticeDocuments();
  const progress = Object.fromEntries(b.bank.items.filter(i => i.estimulo.tipo === "figura").map(i => [i.unidad_id, { attempts: 100 }]));
  for (const count of [1, 3, 5, 10, 50]) {
    const ids = selectPracticeItems(b, progress, { preview: true, count, ensureFigure: true });
    const selected = ids.map(id => b.bank.items.find(i => i.item_id === id));
    assert.equal(selected[0].estimulo.tipo, "figura");
    assert.ok(ids.length <= count);
    assert.equal(new Set(ids).size, ids.length);
    const figures = selected.filter(i => i.estimulo.tipo === "figura").map(i => i.estimulo.figura_id);
    assert.equal(new Set(figures).size, figures.length);
  }
});

test("promover figuras nunca salta la unidad elegida o la revisión docente", async () => {
  const b = await readPracticeDocuments(), unitIds = [b.bank.items[0].unidad_id];
  const selected = selectPracticeItems(b, {}, { preview: true, ensureFigure: true, unitIds });
  assert.ok(selected.length > 0);
  assert.ok(selected.every(id => b.bank.items.find(i => i.item_id === id).unidad_id === unitIds[0]));
  assert.deepEqual(selectPracticeItems(b, {}, { preview: true, figuresOnly: true, unitIds }), []);
  assert.deepEqual(selectPracticeItems(b, {}, { ensureFigure: true }), []);
  for (const i of b.bank.items) i.estado_revision = "revisado_docente";
  assert.deepEqual(selectPracticeItems(b, {}, { figuresOnly: true }), []);
  for (const i of b.bank.items) if (i.estimulo.tipo === "figura") i.estimulo.estado_revision = "revisado_docente";
  assert.equal(selectPracticeItems(b, {}, { figuresOnly: true }).length, 2);
});

test("dos tandas visuales ofrecen las cuatro variantes, sin reutilizar figura en una tanda", async () => {
  const b = await readPracticeDocuments(), options = { preview: true, figuresOnly: true, count: 10 };
  const first = selectPracticeItems(b, {}, options);
  const second = selectPracticeItems(b, {}, { ...options, recentItemIds: first });
  assert.equal(first.length, 2); assert.equal(second.length, 2);
  assert.equal(new Set([...first, ...second]).size, 4);
});

const profile = key => ({ key, sets: [], remote: [], acknowledged: [] });
test("importación demo es idempotente, conserva snapshots y el destino más reciente", () => {
  const target = { ...profile("scope:demo"), sets: [{ id: "1", state: "completed", responses: ["saved"] }] };
  const source = { ...profile("scope:demo:visual"), sets: [{ id: "1", state: "feedback" }, { id: "2", state: "answer", items: ["snapshot"] }] };
  const before = structuredClone([target, source]);
  const result = mergeDemoProfiles(target, source);
  assert.equal(result.sets.length, 2);
  assert.deepEqual(result.sets[0], target.sets[0]);
  assert.deepEqual(result.sets[1], source.sets[1]);
  assert.deepEqual(mergeDemoProfiles(result, source), result);
  assert.deepEqual([target, source], before);
});

test("importación demo rechaza otro scope, perfiles reales o datos remotos", () => {
  const t = profile("scope:demo"), s = profile("scope:demo:visual");
  assert.throws(() => mergeDemoProfiles(t, profile("other:demo:visual")), /incompatibles/);
  assert.throws(() => mergeDemoProfiles(profile("scope:real"), s), /incompatibles/);
  assert.throws(() => mergeDemoProfiles(t, { ...s, remote: [{}] }), /remotos/);
  assert.throws(() => mergeDemoProfiles({ ...t, acknowledged: ["x"] }, s), /remotos/);
});

test("portada vacía no inventa progreso, puntaje ni dominio", () => {
  assert.deepEqual(practiceOverview(profile("s")), { rows: [], completed: 0, attempts: 0, correct: 0, units: 0 });
});

test("progreso cuenta respuestas de una tanda pendiente, pero no la da por completada", () => {
  const response = { unidad_id: "u", selected_option: "A", correct: true, day: "2026-09-07" };
  const p = { ...profile("s"), sets: [
    { id: "a", state: "completed", responses: [response, { ...response, selected_option: null, correct: false }] },
    { id: "b", state: "feedback", responses: [{ ...response, correct: false }] },
  ] };
  const overview = practiceOverview(p);
  assert.equal(overview.completed, 1); assert.equal(overview.attempts, 2);
  assert.equal(overview.correct, 1); assert.equal(overview.units, 1);
});

test("progreso agregado respaldado no vuelve a contar su tanda local", () => {
  const p = { ...profile("s"), acknowledged: ["a"], remote: [{ unidad_id: "u", attempts: 3, correct: 2, last_practiced_on: "2026-09-07" }], sets: [
    { id: "a", state: "completed", responses: [{ unidad_id: "u", selected_option: "A", correct: true }] },
  ] };
  const overview = practiceOverview(p);
  assert.equal(overview.completed, 1); assert.equal(overview.attempts, 3); assert.equal(overview.correct, 2);
});

// El cuaderno de invitado se incorpora al del estudiante cuando éste asocia su código.
test("fusionar cuadernos suma lo que falta, respeta el destino y no toca el origen", () => {
  const guest = { ...profile("scope:invitado"), sets: [{ id: "1", state: "completed", responses: ["invitado"] }, { id: "2", state: "answer", items: ["snapshot"] }] };
  const coded = { ...profile("scope:abc123"), sets: [{ id: "1", state: "feedback", responses: ["propio"] }], confirmed: true };
  const before = structuredClone([guest, coded]);
  const merged = mergeProfiles(coded, guest);
  assert.equal(merged.sets.length, 2);
  assert.deepEqual(merged.sets[0], coded.sets[0], "ante el mismo identificador manda el destino");
  assert.deepEqual(merged.sets[1], guest.sets[1]);
  assert.equal(merged.confirmed, true, "conserva los campos del destino");
  assert.deepEqual(mergeProfiles(merged, guest), merged, "repetirlo no duplica");
  assert.deepEqual([guest, coded], before, "el origen queda intacto");
});

test("fusionar rechaza un origen que ya tenga respaldo remoto", () => {
  const coded = profile("scope:abc123");
  assert.throws(() => mergeProfiles(coded, { ...profile("scope:otro"), remote: [{ unidad_id: "u" }] }), /remotos/);
  assert.throws(() => mergeProfiles(coded, { ...profile("scope:otro"), acknowledged: ["x"] }), /remotos/);
});


// El servidor cuenta una tanda terminada por recibo; si pierde datos, lo respaldado aquí es el piso.
test("tandas terminadas toman el total remoto, sin olvidar las respaldadas por este aparato", () => {
  const done = id => ({ id, state: "completed", responses: [] });
  const p = { ...profile("s"), sets: [done("a"), done("b"), { id: "c", state: "answer", responses: [] }], acknowledged: ["a", "b"] };
  assert.equal(practiceOverview({ ...p, remote_sets: 7 }).completed, 7, "incluye tandas de otros dispositivos");
  assert.equal(practiceOverview({ ...p, remote_sets: 0 }).completed, 2, "una pérdida remota no borra las propias");
  assert.equal(practiceOverview({ ...p, remote_sets: 7, acknowledged: ["a"] }).completed, 8, "la no respaldada se suma aparte");
  assert.equal(practiceOverview(p).completed, 2, "sin respaldo remoto cuenta lo local");
});
