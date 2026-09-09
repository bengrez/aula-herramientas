import test from "node:test";
import assert from "node:assert/strict";
import { assertBundle } from "../../src/engine/contracts.mjs";
import { PUBLIC_FORMAT_LABELS, hasPublicFormatLabel, publicFormatLabel } from "../../src/engine/stimulus-format.mjs";
import { readActiveDocuments } from "../helpers/active-documents.mjs";

const CLOSED_LIST = ["caso", "tabla", "procedimiento", "esquema", "gráfico", "figura"];

test("la etiqueta visible sale de una lista cerrada y genérica", () => {
  for (const label of Object.values(PUBLIC_FORMAT_LABELS)) {
    assert.ok(CLOSED_LIST.includes(label), `“${label}” no pertenece a la lista cerrada`);
  }
});

test("un tipo de estímulo sin etiqueta pública se reconoce como tal", () => {
  assert.equal(hasPublicFormatLabel("grafico_lineas"), true);
  assert.equal(hasPublicFormatLabel("tipo_inventado"), false);
  assert.throws(() => publicFormatLabel({ tipo: "tipo_inventado" }), /etiqueta pública/);
});

test("ningún ítem del banco activo muestra su identificador de autoría", async () => {
  const bundle = assertBundle(await readActiveDocuments());
  for (const item of bundle.bank.items) {
    const visible = publicFormatLabel(item.estimulo);
    assert.ok(CLOSED_LIST.includes(visible), `${item.item_id}: etiqueta fuera de la lista cerrada`);
    // El identificador de autoría describe qué hace difícil al ítem —"eje truncado", "muestreo
    // sesgado"— y por eso es una frase; la etiqueta visible es una sola palabra que solo nombra la
    // forma del estímulo. Que ambas compartan el sustantivo genérico es esperable: el leak son los
    // calificativos que el slug agrega.
    assert.notEqual(visible, item.formato_estimulo, `${item.item_id}: el slug de autoría llegó a la pantalla`);
    assert.doesNotMatch(visible, /[_\s]/, `${item.item_id}: la etiqueta visible arrastra calificativos`);
  }
});

test("el contrato rechaza un estímulo que anuncia su propio diseño", async () => {
  const documents = await readActiveDocuments();
  const conAviso = structuredClone(documents);
  const chart = conAviso.bank.items.find((item) => item.estimulo.tipo === "grafico_lineas");
  chart.estimulo.aviso_rango = "Eje vertical truncado: 68–72 °C";
  assert.throws(() => assertBundle(conAviso), /describe el diseño del ítem en pantalla/);

  const conAvisoLibre = structuredClone(documents);
  conAvisoLibre.bank.items[0].estimulo.aviso_escala = "Las bases no son comparables";
  assert.throws(() => assertBundle(conAvisoLibre), /describe el diseño del ítem en pantalla/);
});
