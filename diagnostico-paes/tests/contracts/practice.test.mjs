import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { readPracticeDocuments } from "../../tools/practice-readiness.mjs";
import { assertPracticeBundle, practiceReadiness } from "../../src/engine/practice.mjs";
import { selectPracticeItems } from "../../src/engine/practice-selector.mjs";

test("biblioteca de 14 ítems base y 4 visuales, pendientes y fuera del manifiesto activo", async () => {
  const b = assertPracticeBundle(await readPracticeDocuments());
  assert.equal(b.bank.items.length, 18);
  assert.ok(b.bank.items.every(i => i.estado_revision === "pendiente_revision_docente"));
  assert.equal(selectPracticeItems(b).length, 0);
  assert.equal(selectPracticeItems(b, {}, {preview: true}).length, 10);
  const active = await readFile(new URL("../../data/active.json", import.meta.url), "utf8");
  assert.equal(active.includes("practica"), false); assert.equal(active.includes("practice"), false);
  assert.equal(practiceReadiness(b).ready, false);
});
test("readiness no permite saltarse revisión, privacidad, backend ni gates reales", async () => {
  const b = await readPracticeDocuments();
  b.config.pilot_ready = true;
  for (const key of Object.keys(b.config.gates)) b.config.gates[key] = true;
  assert.equal(practiceReadiness(b).ready, false);
  assert.throws(() => assertPracticeBundle({...b, bank: {...b.bank, items: [{...b.bank.items[0], criterio_id: "invalid"}]}}));
});
test("ninguna clave discutible es seleccionada, tampoco en preview", async () => {
  const b = await readPracticeDocuments(); b.bank.items.forEach(i => i.estado_clave = "discutible");
  assert.deepEqual(selectPracticeItems(b, {}, {preview: true}), []);
});
test("todos los recursos del manifiesto de práctica existen", async () => {
  const b = await readPracticeDocuments();
  for (const path of b.config.offline_assets) await access(new URL(`../../data/${path}`, import.meta.url));
});
test("el manifiesto offline cierra todas las importaciones estáticas del controlador", async () => {
  const b = await readPracticeDocuments();
  const base = new URL("../../data/practice.json", import.meta.url);
  const assets = new Set(b.config.offline_assets.map(p => new URL(p, base).href));
  const seen = new Set(), queue = [new URL("../../practice/app.mjs", import.meta.url)];
  while (queue.length) {
    const url = queue.pop(); if (seen.has(url.href)) continue; seen.add(url.href);
    assert.ok(assets.has(url.href), `Falta dependencia offline: ${url.pathname}`);
    const source = await readFile(url,"utf8");
    for (const match of source.matchAll(/(?:import|export)[^;]*?from\s+["']([^"']+)["']/g)) queue.push(new URL(match[1],url));
  }
});
test("14 claves de borrador coherentes con la revisión técnica y feedback explicativo", async () => {
  const b = await readPracticeDocuments();
  assert.deepEqual(b.bank.items.filter(i => i.item_id.startsWith("PB-")).map(i => i.clave), ["C","B","D","A","C","B","A","D","B","C","D","B","A","C"]);
  assert.ok(b.bank.items.every(i => i.alternativas.find(a=>a.id===i.clave).diagnostico.length > 40));
  assert.ok(b.bank.items.every(i => i.estado_revision === "pendiente_revision_docente"));
});
