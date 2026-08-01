import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBundle } from "../../src/engine/contracts.mjs";
import { buildEvidenceMap } from "../../src/engine/evidence-map.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const bundle = assertBundle({
  active: await readJson("data/active.json"),
  framework: await readJson("data/paes-ciencias-2027/framework.v1.json"),
  bank: await readJson("data/paes-ciencias-2027/bank-anchor-placeholder.v1.json"),
  session: await readJson("data/paes-ciencias-2027/session-anchor-2026-08-17.v1.json"),
  deployment: await readJson("data/paes-ciencias-2027/deployment.v1.json"),
});

function responseFor(item, index, selected = item.clave) {
  return { item_id: item.item_id, item_version: item.version, selected_option: selected, presentation_order: index + 1 };
}

test("ordena zonas por estados cualitativos sin exponer números", () => {
  const responses = bundle.bank.items.map((item, index) => responseFor(item, index));
  const map = buildEvidenceMap(bundle, responses);
  assert.equal(map.zones.length, 4);
  assert.ok(map.zones.every((zone) => zone.state_id === "evidencia_consistente"));
  assert.equal(map.pending.length, 12);
  assert.ok(map.pending.every((zone) => zone.state_id === "sin_evidencia"));
  assert.ok(map.pending.every((zone) => zone.label && !zone.label.includes("HC-")));
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
