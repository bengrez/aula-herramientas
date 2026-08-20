import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBundle } from "../../src/engine/contracts.mjs";
import { buildEvidenceMap } from "../../src/engine/evidence-map.mjs";
import { readActiveDocuments } from "../helpers/active-documents.mjs";

const bundle = assertBundle(await readActiveDocuments());

function responseFor(item, index, selected = item.clave) {
  return { item_id: item.item_id, item_version: item.version, selected_option: selected, response_time_ms: 10000, presentation_order: index + 1 };
}

test("ordena zonas por estados cualitativos sin exponer números", () => {
  const responses = bundle.bank.items.map((item, index) => responseFor(item, index));
  const map = buildEvidenceMap(bundle, responses);
  assert.equal(map.zones.length, 4);
  assert.ok(map.zones.every((zone) => zone.state_id === "evidencia_consistente"));
  assert.equal(map.pending.length, 12);
  assert.ok(map.pending.every((zone) => zone.state_id === "sin_evidencia"));
  assert.ok(map.pending.every((zone) => zone.label && !zone.label.includes("HC-")));
  assert.deepEqual(map.content_zones, []);
});

test("una unidad usada como contexto nunca aparece en el mapa de contenido", () => {
  const responses = bundle.bank.items.map((item, index) => responseFor(item, index));
  const map = buildEvidenceMap(bundle, responses);
  assert.equal(bundle.bank.items.every((item) => item.unidad_rol === "contexto"), true);
  assert.deepEqual(map.content_zones, []);
});

test("aplica de forma exhaustiva la tabla configurable de 0 a 3 evidencias", () => {
  const criterionId = "HC-02.C6";
  const items = bundle.bank.items.filter((item) => item.criterio_id === criterionId);
  const cases = new Map(bundle.framework.mapa_evidencia.tabla_inferencia.map((row) => [
    row.evidencias_evaluables + ":" + row.aciertos,
    row.estado,
  ]));
  for (const [key, expectedState] of cases) {
    const [evidenceCount, correctCount] = key.split(":").map(Number);
    if (evidenceCount > items.length) continue;
    const responses = items.slice(0, evidenceCount).map((item, index) => responseFor(
      item,
      index,
      index < correctCount ? item.clave : item.alternativas.find((alternative) => alternative.id !== item.clave).id,
    ));
    const zone = buildEvidenceMap(bundle, responses).zones.find((entry) => entry.criterion_id === criterionId);
    assert.equal(zone.state_id, expectedState, key);
  }
});

test("marca respuestas bajo 10 segundos sin excluirlas en ancla y las excluye en modo autónomo", () => {
  const responses = bundle.bank.items.map((item, index) => ({
    ...responseFor(item, index, item.item_id === "B-01" ? null : item.clave),
    response_time_ms: ["A-01", "B-01"].includes(item.item_id) ? 9999 : 10000,
  }));
  const anchorZone = buildEvidenceMap(bundle, responses).zones.find((zone) => zone.criterion_id === "HC-02.C6");
  assert.equal(anchorZone.quick_response_count, 1);
  assert.equal(anchorZone.evidence_count, 3);
  assert.equal(anchorZone.state_id, "evidencia_consistente");
  assert.equal(buildEvidenceMap(bundle, responses).zones.find((zone) => zone.criterion_id === "HC-03.C1").quick_response_count, 0);

  const autonomous = structuredClone(bundle);
  autonomous.session.reglas.tratamiento_respuestas_rapidas = "excluir_de_cobertura";
  const autonomousZone = buildEvidenceMap(autonomous, responses).zones.find((zone) => zone.criterion_id === "HC-02.C6");
  assert.equal(autonomousZone.evidence_count, 2);
  assert.equal(autonomousZone.state_id, "evidencia_inicial");
});

test("distingue falta de evidencia de dificultad", () => {
  const responses = bundle.bank.items.map((item, index) => responseFor(item, index, null));
  const map = buildEvidenceMap(bundle, responses);
  assert.ok(map.zones.every((zone) => zone.state_id === "sin_evidencia"));
  const wrong = bundle.bank.items.map((item, index) => responseFor(item, index, item.alternativas.find((alternative) => alternative.id !== item.clave).id));
  const difficult = buildEvidenceMap(bundle, wrong);
  assert.ok(difficult.zones.every((zone) => zone.state_id === "requiere_refuerzo"));
  assert.notEqual(map.zones[0].state.simbolo, difficult.zones[0].state.simbolo);
});

test("excluye del cómputo un ítem con clave discutible", () => {
  const mutated = structuredClone(bundle);
  mutated.bank.items[0].estado_clave = "discutible";
  const responses = mutated.bank.items.map((item, index) => responseFor(item, index));
  const map = buildEvidenceMap(mutated, responses);
  const zone = map.zones.find((entry) => entry.criterion_id === mutated.bank.items[0].criterio_id);
  assert.equal(zone.evidence_count, 2);
});
