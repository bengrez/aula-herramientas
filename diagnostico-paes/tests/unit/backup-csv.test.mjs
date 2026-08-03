import test from "node:test";
import assert from "node:assert/strict";
import { encodeBackup, encodeLegacyBackup, decodeBackup } from "../../src/engine/backup-code.mjs";
import { validateBackupForBundle } from "../../src/engine/backup-validation.mjs";
import { responsesToCsv, RAW_RESPONSE_COLUMNS, assertRawColumns } from "../../src/engine/csv.mjs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));

const attempt = {
  attempt_id: "00000000-0000-4000-8000-000000000001",
  administration_id: "admin-1",
  session_template_id: "session-1",
  session_version: "1",
  framework_id: "framework-1",
  framework_version: "1",
  enrollment_code: "ABC-DEF-GHJ",
  enrollment_status: "confirmed",
  started_at: "2026-08-17T12:00:00.000Z",
  completed_at: "2026-08-17T12:20:00.000Z",
};
const responses = Array.from({ length: 12 }, (_, index) => ({
  response_id: `00000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
  attempt_id: attempt.attempt_id,
  administration_id: attempt.administration_id,
  session_template_id: attempt.session_template_id,
  session_version: attempt.session_version,
  framework_id: attempt.framework_id,
  framework_version: attempt.framework_version,
  item_id: `ITEM-${index + 1}`,
  item_version: "1",
  selected_option: index === 3 ? null : "A",
  omitted: index === 3,
  response_time_ms: 1200 + index,
  presentation_order: index + 1,
  client_recorded_at: "2026-08-17T12:00:00.000Z",
  source: "device",
}));

const miniBundle = {
  deployment: {
    deployment_id: "deployment-1",
    version: "1",
    administracion: { administracion_id: attempt.administration_id },
  },
  framework: { marco_id: attempt.framework_id, version: attempt.framework_version },
  session: {
    plantilla_id: attempt.session_template_id,
    version: attempt.session_version,
    items: responses.map((response) => ({ item_id: response.item_id, item_version: response.item_version, orden: response.presentation_order })),
  },
};

test("el respaldo realiza ida y vuelta y conserva doce filas crudas", () => {
  const encoded = encodeBackup(attempt, responses, miniBundle);
  const decoded = decodeBackup(encoded, miniBundle);
  assert.match(encoded, /^DX3\./);
  assert.ok(encoded.length < 1_300, `el respaldo compacto mide ${encoded.length} caracteres`);
  assert.equal(decoded.responses.length, 12);
  assert.equal(decoded.responses[3].selected_option, null);
  assert.equal(decoded.attempt.enrollment_code, attempt.enrollment_code);
  assert.equal(decoded.attempt.enrollment_status, "confirmed");
});

test("el respaldo alterado falla por checksum", () => {
  const encoded = encodeBackup(attempt, responses, miniBundle);
  const changed = `${encoded.slice(0, -1)}${encoded.at(-1) === "A" ? "B" : "A"}`;
  assert.throws(() => decodeBackup(changed, miniBundle), /alterado/);
});

test("el recuperador conserva compatibilidad con el respaldo DX1", () => {
  const encoded = encodeLegacyBackup(attempt, responses);
  const decoded = decodeBackup(encoded);
  assert.match(encoded, /^DX1\./);
  assert.equal(decoded.responses[11].response_id, responses[11].response_id);
});

test("el CSV tiene una fila por respuesta y ninguna columna derivada", () => {
  assert.equal(assertRawColumns(RAW_RESPONSE_COLUMNS), true);
  const csv = responsesToCsv(responses);
  assert.equal(csv.trimEnd().split("\r\n").length, 13);
  assert.doesNotMatch(csv.split("\r\n")[0], /correct|score|diagnos|acierto/i);
});

test("el CSV neutraliza fórmulas de hoja de cálculo", () => {
  const csv = responsesToCsv([{ ...responses[0], item_id: "=HYPERLINK(\"https://invalid.example\")" }]);
  assert.match(csv, /'={0,1}HYPERLINK/);
  assert.doesNotMatch(csv.split("\r\n")[1], /,=HYPERLINK/);
});

test("el recuperador contrasta el respaldo con código, sesión, ítems y alternativas activas", async () => {
  const [active, deployment, framework, bank, session] = await Promise.all([
    readJson("data/active.json"),
    readJson("data/paes-ciencias-2027/deployment.v1.json"),
    readJson("data/paes-ciencias-2027/framework.v1.json"),
    readJson("data/paes-ciencias-2027/bank-anchor.v0.3.json"),
    readJson("data/paes-ciencias-2027/session-anchor-2026-08-17.v1.json"),
  ]);
  const bundle = { active, deployment, framework, bank, session };
  const itemById = new Map(bank.items.map((item) => [item.item_id, item]));
  const liveAttempt = {
    ...attempt,
    administration_id: deployment.administracion.administracion_id,
    session_template_id: session.plantilla_id,
    session_version: session.version,
    framework_id: framework.marco_id,
    framework_version: framework.version,
    enrollment_code: deployment.enrolamiento.codigo_demo_visible,
  };
  const liveResponses = session.items.map((ref, index) => ({
    ...responses[index],
    attempt_id: liveAttempt.attempt_id,
    administration_id: liveAttempt.administration_id,
    session_template_id: liveAttempt.session_template_id,
    session_version: liveAttempt.session_version,
    framework_id: liveAttempt.framework_id,
    framework_version: liveAttempt.framework_version,
    item_id: ref.item_id,
    item_version: ref.item_version,
    selected_option: index === 3 ? null : itemById.get(ref.item_id).alternativas[0].id,
    omitted: index === 3,
    presentation_order: ref.orden,
  }));
  const decoded = decodeBackup(encodeBackup(liveAttempt, liveResponses, bundle), bundle);
  await assert.doesNotReject(() => validateBackupForBundle(decoded, bundle, { demo: true }));
  const altered = structuredClone(decoded);
  altered.responses[0].item_id = "ITEM-FUERA-DE-SESION";
  await assert.rejects(() => validateBackupForBundle(altered, bundle, { demo: true }), /ítem, versión u orden/);
});
