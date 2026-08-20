import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPaperSubmission } from "../../src/engine/paper-transcription.mjs";
import { readActiveDocuments } from "../helpers/active-documents.mjs";


test("la transcripción de papel conserva omisiones y no inventa tiempos", async () => {
  const { deployment, framework, bank, session } = await readActiveDocuments();
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
  const { deployment, framework, bank, session } = await readActiveDocuments();
  assert.throws(
    () => buildPaperSubmission({ deployment, framework, bank, session }, "ABC-DEF-GHJ", Array(12).fill("Z"), "2026-08-17T12:30:00.000Z"),
    /no pertenece/,
  );
});
