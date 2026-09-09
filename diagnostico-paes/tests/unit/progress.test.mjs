import test from "node:test";
import assert from "node:assert/strict";
import { buildProgressSummary } from "../../src/engine/progress.mjs";

function item(id, unidad_id, unidad_rol, clave = "A") {
  return { item_id: id, version: "1", unidad_id, unidad_rol, clave, alternativas: [{ id: "A" }, { id: "B" }] };
}

function response(item_id, selected_option, client_recorded_at) {
  return { item_id, item_version: "1", selected_option, client_recorded_at };
}

const bundle = {
  bank: {
    items: [
      item("I1", "U1", "medicion"),
      item("I2", "U1", "medicion"),
      item("I3", "U2", "medicion"),
      item("I4", "U1", "contexto"), // comparte unidad con I1/I2 pero no debe contarse: es contexto
      item("I5", "U3", "medicion"), // unidad presente en el banco, sin respuestas todavía
    ],
  },
};

test("calcula attempts/correct/accuracy correctamente y toma el último client_recorded_at", () => {
  const responses = [
    response("I1", "A", "2026-01-01T00:00:00.000Z"), // correcta
    response("I1", "B", "2026-01-02T00:00:00.000Z"), // incorrecta
    response("I2", "A", "2026-01-03T00:00:00.000Z"), // correcta
  ];
  const summary = buildProgressSummary(bundle, responses);
  const unitU1 = summary.find((entry) => entry.unidad_id === "U1");
  assert.deepEqual(unitU1, {
    unidad_id: "U1",
    attempts: 3,
    correct: 2,
    accuracy: 2 / 3,
    last_practiced_at: "2026-01-03T00:00:00.000Z",
  });
});

test("una unidad sin ninguna respuesta queda con attempts 0 y accuracy null, sin dividir por cero", () => {
  const summary = buildProgressSummary(bundle, []);
  const unitU3 = summary.find((entry) => entry.unidad_id === "U3");
  assert.deepEqual(unitU3, { unidad_id: "U3", attempts: 0, correct: 0, accuracy: null, last_practiced_at: null });
});

test("ignora respuestas omitidas, de ítems de contexto y de ítems que ya no existen en el banco", () => {
  const responses = [
    response("I1", null, "2026-01-01T00:00:00.000Z"), // omitida: no cuenta
    response("I4", "A", "2026-01-01T00:00:00.000Z"), // I4 es unidad_rol=contexto: no cuenta
    response("I-GHOST", "A", "2026-01-01T00:00:00.000Z"), // ya no está en el banco activo
  ];
  const summary = buildProgressSummary(bundle, responses);
  const unitU1 = summary.find((entry) => entry.unidad_id === "U1");
  assert.deepEqual(unitU1, { unidad_id: "U1", attempts: 0, correct: 0, accuracy: null, last_practiced_at: null });
});

test("el resumen incluye toda unidad con al menos un ítem de medición, ordenado por unidad_id", () => {
  const summary = buildProgressSummary(bundle, []);
  assert.deepEqual(summary.map((entry) => entry.unidad_id), ["U1", "U2", "U3"]);
});

test("muchas repeticiones no generan etiquetas de dominio ni nivel", () => {
  const summary = buildProgressSummary(bundle, Array.from({length: 100}, () => response("I1", "A")));
  assert.equal(summary[0].attempts, 100);
  assert.equal(summary[0].mastered, undefined);
  assert.equal(summary[0].level, undefined);
});
