import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPaperSubmission } from "../../src/engine/paper-transcription.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));

test("la transcripción de papel conserva omisiones y no inventa tiempos", async () => {
  const [deployment, framework, bank, session] = await Promise.all([
    readJson("data/paes-ciencias-2027/deployment.v1.json"),
    readJson("data/paes-ciencias-2027/framework.v1.json"),
    readJson("data/paes-ciencias-2027/bank-anchor-placeholder.v1.json"),
    readJson("data/paes-ciencias-2027/session-anchor-2026-08-17.v1.json"),
  ]);
  const bundle = { deployment, framework, bank, session };
  let uuidCounter = 0;
  const selections = session.items.map((_, index) => index === 2 ? null : "A");
  const submission = buildPaperSubmission(bundle, "ABC-DEF-GHJ", selections, "2026-08-17T12:30:00.000Z", {
    now: () => "2026-08-17T13:00:00.000Z",
    uuid: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
  });

  assert.equal(submission.responses.length, 12);
  assert.equal(submission.attempt.started_at, null);
  assert.equal(submission.attempt.completed_at, "2026-08-17T12:30:00.000Z");
  assert.equal(submission.responses[2].selected_option, null);
  assert.equal(submission.responses[2].omitted, true);
  assert.ok(submission.responses.every((response) => response.source === "paper"));
  assert.ok(submission.responses.every((response) => response.response_time_ms === null));
});

test("rechaza respuestas fuera del contrato del banco", async () => {
  const [deployment, framework, bank, session] = await Promise.all([
    readJson("data/paes-ciencias-2027/deployment.v1.json"),
    readJson("data/paes-ciencias-2027/framework.v1.json"),
    readJson("data/paes-ciencias-2027/bank-anchor-placeholder.v1.json"),
    readJson("data/paes-ciencias-2027/session-anchor-2026-08-17.v1.json"),
  ]);
  assert.throws(
    () => buildPaperSubmission({ deployment, framework, bank, session }, "ABC-DEF-GHJ", Array(12).fill("Z"), "2026-08-17T12:30:00.000Z"),
    /no pertenece/,
  );
});
