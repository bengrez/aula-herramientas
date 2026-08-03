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
    bank: await readJson("data/paes-ciencias-2027/bank-anchor.v0.3.json"),
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

test("la sesión conserva el orden intercalado acordado sin criterio ni eje consecutivo", async () => {
  const bundle = assertBundle(await productionBundle());
  const expected = ["A-01", "B-02", "C-03", "D-01", "A-02", "B-03", "C-01", "D-02", "A-03", "B-01", "C-02", "D-03"];
  assert.deepEqual(bundle.session.items.map((reference) => reference.item_id), expected);
  const byId = new Map(bundle.bank.items.map((item) => [item.item_id, item]));
  const ordered = bundle.session.items.map((reference) => byId.get(reference.item_id));
  for (let index = 1; index < ordered.length; index += 1) {
    assert.notEqual(ordered[index].criterio_id, ordered[index - 1].criterio_id);
    assert.notEqual(ordered[index].eje, ordered[index - 1].eje);
  }
  assert.deepEqual(
    Object.fromEntries(["A", "B", "C", "D"].map((key) => [key, ordered.filter((item) => item.clave === key).length])),
    { A: 3, B: 3, C: 3, D: 3 },
  );
});

test("las cuatro zonas públicas y el umbral rápido provienen del marco", async () => {
  const bundle = assertBundle(await productionBundle());
  const criteria = new Map(flattenCriteria(bundle.framework).map((criterion) => [criterion.id, criterion]));
  assert.deepEqual(
    ["HC-02.C6", "HC-03.C1", "HC-03.C3", "HC-04.C1"].map((id) => [criteria.get(id).etiqueta, criteria.get(id).descripcion]),
    [
      ["Distinguir las variables de un experimento", "Ver qué se cambia, qué se mide y qué se mantiene igual."],
      ["Leer bien un gráfico o una tabla", "Mirar los ejes, las unidades y la escala antes de sacar conclusiones."],
      ["Concluir sin decir de más", "Que la conclusión no vaya más allá de lo que los datos probaron."],
      ["Encontrar la falla de un estudio", "Reconocer variables confundidas, falta de comparación o muestras sesgadas."],
    ],
  );
  assert.equal(bundle.framework.mapa_evidencia.respuestas_rapidas.umbral_ms, 10000);
});

test("los doce ítems ancla declaran la unidad solo como contexto y conservan diagnóstico por alternativa", async () => {
  const bundle = assertBundle(await productionBundle());
  assert.ok(bundle.bank.items.every((item) => item.unidad_rol === "contexto"));
  assert.ok(bundle.bank.items.every((item) => item.alternativas.every((alternative) => alternative.diagnostico)));
});

test("B-02 conserva el eje truncado, los siete puntos y el texto alternativo acordados", async () => {
  const bundle = assertBundle(await productionBundle());
  const chart = bundle.bank.items.find((item) => item.item_id === "B-02").estimulo;
  assert.equal(chart.tipo, "grafico_lineas");
  assert.deepEqual(chart.eje_x, {
    etiqueta: "Tiempo (minutos)",
    min: 0,
    max: 30,
    marcas: [0, 5, 10, 15, 20, 25, 30],
  });
  assert.equal(chart.eje_y.etiqueta, "Temperatura (°C)");
  assert.equal(chart.eje_y.min, 68);
  assert.equal(chart.eje_y.max, 72);
  assert.equal(chart.eje_y.truncado, true);
  assert.deepEqual(chart.puntos.map((point) => [point.x, point.y]), [
    [0, 71.8], [5, 71.2], [10, 70.6], [15, 70.1], [20, 69.5], [25, 68.9], [30, 68.4],
  ]);
  assert.equal(chart.texto_alternativo, "Gráfico de temperatura contra tiempo durante 30 minutos. La línea desciende de forma continua y ocupa casi toda la altura del gráfico, pero el eje vertical va solo de 68 a 72 °C: la temperatura baja de 71,8 a 68,4 °C.");
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
