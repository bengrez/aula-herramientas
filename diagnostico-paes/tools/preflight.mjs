#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { assertBundle, flattenCriteria, flattenUnits } from "../src/engine/contracts.mjs";
import { validatePilotRelease } from "./release-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const activePath = join(root, "data/active.json");
const active = JSON.parse(await readFile(activePath, "utf8"));
const activeBase = pathToFileURL(activePath);
const readReference = async (url) => JSON.parse(await readFile(fileURLToPath(new URL(url, activeBase)), "utf8"));
const bundle = assertBundle({
  active,
  framework: await readReference(active.framework_url),
  bank: await readReference(active.bank_url),
  session: await readReference(active.session_url),
  deployment: await readReference(active.deployment_url),
});

const checks = [];
function check(name, condition, detail = "") {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  checks.push(name);
}

const expected = bundle.active.validation ?? {};
for (const [label, actual, key] of [
  ["habilidades", bundle.framework.habilidades.length, "abilities"],
  ["criterios", flattenCriteria(bundle.framework).length, "criteria"],
  ["áreas", bundle.framework.areas.length, "areas"],
  ["unidades", flattenUnits(bundle.framework).length, "units"],
  ["ítems de sesión", bundle.session.items.length, "session_items"],
]) {
  if (Number.isInteger(expected[key])) check(`${expected[key]} ${label}`, actual === expected[key]);
}
if (Number.isInteger(expected.enrollment_codes)) {
  check(`${expected.enrollment_codes} códigos de enrolamiento`, bundle.deployment.enrolamiento.hashes_permitidos.length === expected.enrollment_codes);
}
const seedEnrollmentSource = await readFile(join(root, "supabase/seed-enrollment-hashes.example.sql"), "utf8");
const seedEnrollmentHashes = [...seedEnrollmentSource.matchAll(/decode\('([a-f0-9]{64})', 'hex'\)/g)].map((match) => match[1]);
check("seed público sin hashes de enrolamiento", seedEnrollmentHashes.length === 0);
check("seed público sin registros de cohorte", !/insert\s+into\s+private\.enrollment_codes/i.test(seedEnrollmentSource));
check("despliegue público sin hashes de cohorte", bundle.deployment.enrolamiento.hashes_permitidos.length === 0);

const filler = bundle.bank.estado_autoria === "relleno_tecnico_no_aplicar";
check("el relleno nunca puede liberarse", !filler || (!bundle.deployment.pilot_ready && bundle.deployment.release_status === "placeholder"));
validatePilotRelease(bundle, check);

const referencedItems = new Set(bundle.session.items.map((item) => `${item.item_id}@${item.item_version}`));
const bankItems = new Set(bundle.bank.items.map((item) => `${item.item_id}@${item.version}`));
check("banco y sesión alineados", referencedItems.size === bundle.session.items.length && [...referencedItems].every((item) => bankItems.has(item)));

const activeDir = join(root, "data");
for (const asset of bundle.active.offline_assets) {
  const url = new URL(asset, `file://${activeDir}/active.json`);
  await stat(fileURLToPath(url));
}
checks.push("recursos offline presentes");

const htmlFiles = ["index.html", "print.html", "paper.html", "backup.html", "access.html"];
for (const file of htmlFiles) {
  const source = await readFile(join(root, file), "utf8");
  const remoteRuntimeAsset = [...source.matchAll(/(?:src|href)="(https?:\/\/[^\"]+)"/g)].map((match) => match[1]);
  check(`${file} sin CDN`, remoteRuntimeAsset.length === 0, remoteRuntimeAsset.join(", "));
}

async function walk(path) {
  const output = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) output.push(...await walk(full));
    else output.push(full);
  }
  return output;
}
const executable = [...await walk(join(root, "src")), join(root, "sw.js")].filter((path) => /\.(?:m?js)$/.test(path));
for (const path of executable) {
  const source = await readFile(path, "utf8");
  for (const forbidden of ["Biología", "BIO-01", "HC-03"]) check(`motor agnóstico ${path.slice(root.length + 1)} ${forbidden}`, !source.includes(forbidden));
}

const screensSource = await readFile(join(root, "src/ui/screens.mjs"), "utf8");
check("progreso compatible con CSP sin estilo inline", !/\bstyle\s*:/.test(screensSource) && screensSource.includes('element("progress"'));
const appSource = await readFile(join(root, "src/app.mjs"), "utf8");
const accessSource = await readFile(join(root, "src/access-tool.mjs"), "utf8");
const paperSource = await readFile(join(root, "src/paper-tool.mjs"), "utf8");
for (const [label, source] of [["aplicación", appSource], ["hoja de acceso", accessSource], ["transcripción en papel", paperSource]]) {
  check(`${label} evalúa readiness en runtime`, source.includes("assessReleaseReadiness"));
}
check("demostración usa una base local separada", appSource.includes("DEMO_DATABASE_NAME"));
check("papel valida el recibo estricto", paperSource.includes("assertSyncReceipt("));

console.log(`Preflight OK — ${checks.length} comprobaciones`);
