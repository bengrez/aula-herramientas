import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBundle, flattenCriteria, flattenUnits } from "../../src/engine/contracts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));

async function productionBundle() {
  return {
    active: await readJson("data/active.json"),
    framework: await readJson("data/paes-ciencias-2027/framework.v1.json"),
    bank: await readJson("data/paes-ciencias-2027/bank-anchor-placeholder.v1.json"),
    session: await readJson("data/paes-ciencias-2027/session-anchor-2026-08-17.v1.json"),
    deployment: await readJson("data/paes-ciencias-2027/deployment.v1.json"),
  };
}

test("el marco maestro conserva el inventario 5/16/11/82", async () => {
  const bundle = assertBundle(await productionBundle());
  assert.equal(bundle.framework.habilidades.length, 5);
  assert.equal(flattenCriteria(bundle.framework).length, 16);
  assert.equal(bundle.framework.areas.length, 11);
  assert.equal(flattenUnits(bundle.framework).length, 82);
  assert.equal(bundle.framework.matriz_contenido_habilidad.length, 55);
});

test("la sesión ancla es el producto de cuatro criterios por tres ejes", async () => {
  const bundle = assertBundle(await productionBundle());
  const itemById = new Map(bundle.bank.items.map((item) => [item.item_id, item]));
  assert.equal(bundle.session.items.length, 12);
  const groups = new Map();
  for (const ref of bundle.session.items) {
    const item = itemById.get(ref.item_id);
    if (!groups.has(item.criterio_id)) groups.set(item.criterio_id, []);
    groups.get(item.criterio_id).push(item);
  }
  assert.equal(groups.size, 4);
  for (const items of groups.values()) {
    assert.equal(items.length, 3);
    assert.equal(new Set(items.map((item) => item.eje)).size, 3);
    assert.equal(new Set(items.map((item) => item.formato_estimulo)).size, 3);
  }
});

test("un segundo marco satisface el mismo contrato sin tocar el motor", async () => {
  const fixture = await readJson("tests/fixtures/other-framework.bundle.json");
  assert.doesNotThrow(() => assertBundle(fixture));
});

test("el contrato rechaza tipos de estímulo sin renderizador", async () => {
  const fixture = await readJson("tests/fixtures/other-framework.bundle.json");
  fixture.bank.items[0].estimulo.tipo = "estimulo_desconocido";
  assert.throws(() => assertBundle(fixture), /tipo no soportado/);
});

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.(?:m?js)$/.test(entry.name)) files.push(full);
  }
  return files;
}

test("el código ejecutable no contiene valores propios del marco activo", async () => {
  const files = [...await walk(join(root, "src")), join(root, "sw.js")];
  const forbidden = ["Biología", "BIO-01", "HC-03"];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const value of forbidden) assert.equal(source.includes(value), false, `${file} contiene ${value}`);
  }
});

test("todos los recursos offline declarados existen", async () => {
  const active = await readJson("data/active.json");
  const activeDir = join(root, "data");
  for (const relative of active.offline_assets) {
    const resolved = new URL(relative, new URL(`file://${activeDir}/active.json`));
    const stat = await import("node:fs/promises").then(({ stat }) => stat(fileURLToPath(resolved)));
    assert.ok(stat.isFile() || stat.isDirectory(), relative);
  }
});
