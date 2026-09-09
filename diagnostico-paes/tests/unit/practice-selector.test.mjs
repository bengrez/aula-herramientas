import test from "node:test";
import assert from "node:assert/strict";
import { assertBundle } from "../../src/engine/contracts.mjs";
import { selectPracticeItems } from "../../src/engine/practice-selector.mjs";
import { readActiveDocuments } from "../helpers/active-documents.mjs";

function item(id, unidad_id, unidad_rol) {
  return { item_id: id, version: "1", unidad_id, unidad_rol, estado_clave: "ok", estado_revision: "revisado_docente", clave: "A", alternativas: [{ id: "A" }, { id: "B" }] };
}

const framework = {
  areas: [
    {
      id: "AREA-1",
      eje: "Biología",
      unidades: [
        { id: "U1", prioridad_diagnostico_v1: "alta" },
        { id: "U2", prioridad_diagnostico_v1: "media" },
        { id: "U3", prioridad_diagnostico_v1: "diferida" },
      ],
    },
  ],
};

const bank = {
  items: [
    item("I1", "U1", "medicion"),
    item("I2", "U1", "medicion"),
    item("I3", "U2", "medicion"),
    item("I4", "U2", "medicion"),
    item("I5", "U3", "medicion"),
    item("I6", "U1", "contexto"),
  ],
};

const bundle = { framework, bank };

test("sólo elige ítems con unidad_rol === medicion", () => {
  const selected = selectPracticeItems(bundle, {}, { count: 20 });
  assert.ok(selected.length > 0);
  assert.ok(!selected.includes("I6"), "un ítem de contexto no debería aparecer en la selección");
  const measurementIds = new Set(bank.items.filter((entry) => entry.unidad_rol === "medicion").map((entry) => entry.item_id));
  for (const id of selected) assert.ok(measurementIds.has(id), `${id} no es un ítem de medición`);
});

test("prefiere unidades con menos intentos registrados y, en empate, mayor prioridad_diagnostico_v1", () => {
  const progress = { U1: { attempts: 5 }, U2: { attempts: 0 }, U3: { attempts: 0 } };
  const selected = selectPracticeItems(bundle, progress, { count: 3 });
  // U2 (media, 0 intentos) y U3 (diferida, 0 intentos) deberían anteceder a U1 (alta, pero ya
  // practicada 5 veces): menos intentos pesa antes que la prioridad declarada en el marco.
  assert.deepEqual(selected, ["I3", "I5", "I1"]);
});

test("evita repetir el último ítem practicado como primera elección cuando hay alternativa", () => {
  const twoItemBundle = { framework, bank: { items: [item("I1", "U1", "medicion"), item("I2", "U1", "medicion")] } };
  const selected = selectPracticeItems(twoItemBundle, {}, { count: 2, recentItemIds: ["I1"] });
  assert.notEqual(selected[0], "I1");
  assert.deepEqual(selected, ["I2", "I1"]);
});

test("no revienta con un banco vacío o sin ítems de medición", () => {
  assert.deepEqual(selectPracticeItems({ framework, bank: { items: [] } }, {}, { count: 5 }), []);
  const onlyContext = { framework, bank: { items: [item("I1", "U1", "contexto")] } };
  assert.deepEqual(selectPracticeItems(onlyContext, {}, { count: 5 }), []);
});

test("acorta la tanda si hay un solo ítem; no infla intentos repitiéndolo dentro de la tanda", () => {
  const tinyBundle = { framework, bank: { items: [item("I1", "U1", "medicion")] } };
  const selected = selectPracticeItems(tinyBundle, {}, { count: 3 });
  assert.deepEqual(selected, ["I1"]);
});

test("el bank activo real (todo unidad_rol=contexto) no produce selección ni revienta", async () => {
  const bundleReal = assertBundle(await readActiveDocuments());
  assert.equal(bundleReal.bank.items.every((entry) => entry.unidad_rol === "contexto"), true);
  assert.deepEqual(selectPracticeItems(bundleReal, {}, { count: 10 }), []);
});
