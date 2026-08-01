import test from "node:test";
import assert from "node:assert/strict";
import { newAttempt, beginAttempt, createRawResponse, advanceAttempt, assertAttemptComplete } from "../../src/engine/session-machine.mjs";

const bundle = {
  deployment: { administracion: { administracion_id: "admin" } },
  session: { plantilla_id: "template", version: "1" },
  framework: { marco_id: "framework", version: "1" },
};
const item = { item_id: "item", version: "1", alternativas: [{ id: "A" }, { id: "B" }] };
const clock = () => "2026-08-17T12:00:00.000Z";
const uuid = () => "00000000-0000-4000-8000-000000000001";

test("la máquina avanza solo hacia adelante y completa una vez", () => {
  let attempt = newAttempt(bundle, "ABC", { now: clock, uuid });
  attempt = beginAttempt(attempt, clock);
  const response = createRawResponse(attempt, item, 1, null, 2500, { now: clock, uuid });
  attempt = advanceAttempt(attempt, 1, clock);
  assert.equal(attempt.status, "completed");
  assert.equal(response.omitted, true);
  assert.equal(assertAttemptComplete(attempt, [response], 1), true);
  assert.throws(() => advanceAttempt(attempt, 1, clock));
});
