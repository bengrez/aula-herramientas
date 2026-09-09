import test from "node:test";
import assert from "node:assert/strict";
import { newPracticeSet, answerPracticeSet, continuePracticeSet, practiceDelta, assertPracticeDelta, accumulatedProgress } from "../../src/engine/practice.mjs";
import { syncPractice } from "../../src/infra/practice-sync.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const item = { item_id: "ITEM", version: "1", unidad_id: "UNIT", clave: "A", alternativas: [{id: "A"}, {id: "B"}] };
const start = () => newPracticeSet([item], { uuid: id });
const complete = (answer = "A") => continuePracticeSet(answerPracticeSet(start(), answer));
const profile = sets => ({ key: "scope:synthetic", sets, remote: [], acknowledged: [] });
function memoryStore(initial) {
  let p = structuredClone(initial);
  return { read: async () => structuredClone(p), mutate: async (key, fn) => { p = fn(structuredClone(p)); return p; } };
}
test("la última respuesta pasa por feedback antes de completar; doble envío y opción inválida fallan", () => {
  const s = start(); assert.throws(() => answerPracticeSet(s, "X"));
  const f = answerPracticeSet(s, "A"); assert.equal(f.state, "feedback");
  assert.throws(() => answerPracticeSet(f, "A")); assert.throws(() => practiceDelta(f, "scope"));
  assert.equal(continuePracticeSet(f).state, "completed"); assert.equal(s.responses.length, 0);
});
test("snapshot mantiene clave y unidad aunque el banco cambie", () => {
  const s = start(); const altered = {...item, clave: "B", version: "2"};
  assert.notEqual(s.items[0].clave, altered.clave);
  const p = profile([continuePracticeSet(answerPracticeSet(s, "A"))]);
  assert.deepEqual(accumulatedProgress(p), [{ unidad_id: "UNIT", attempts: 1, correct: 1, omitted: 0 }]);
});
test("tandas múltiples acumulan y omisiones no penalizan", () => {
  const p = profile([complete(), complete("B"), complete(null)]);
  assert.equal(accumulatedProgress(p)[0].attempts, 2); assert.equal(accumulatedProgress(p)[0].correct, 1);
  assert.equal(accumulatedProgress(p)[0].omitted, 1);
  const omitida = practiceDelta(complete(null), "scope").deltas;
  assert.equal(omitida.length, 1);
  assert.equal(omitida[0].attempts, 0); assert.equal(omitida[0].correct, 0); assert.equal(omitida[0].omitted, 1);
  assert.match(omitida[0].last_practiced_on, /^\d{4}-\d{2}-\d{2}$/);
});
test("payload exacto sin ítem, alternativa ni tiempo; UUID estable", () => {
  const payload = practiceDelta(complete(), "scope"); assertPracticeDelta(payload);
  assert.equal(payload.batch_id, id); assert.equal(JSON.stringify(payload).includes("ITEM"), false);
  assert.deepEqual(Object.keys(payload.deltas[0]).sort(), ["attempts", "correct", "last_practiced_on", "omitted", "unidad_id"]);
  assert.throws(() => assertPracticeDelta({...payload, responses: []}));
  for (const change of [{correct: 2}, {attempts: -1}, {attempts: 1.5}, {selected_option: "A"}, {last_practiced_on: "bad"}]) {
    assert.throws(() => assertPracticeDelta({...payload, deltas: [{...payload.deltas[0], ...change}]}));
  }
  assert.throws(() => assertPracticeDelta({...payload, deltas: [payload.deltas[0], payload.deltas[0]]}));
});
test("preview/backend deshabilitado/offline no llaman RPC", async () => {
  const store = memoryStore(profile([complete()])); let calls = 0;
  const client = { rpc: () => { calls++; throw new Error("no"); } };
  await syncPractice({ store, key: "scope:synthetic", client });
  await syncPractice({ store, key: "scope:synthetic", client, enabled: true, online: false });
  assert.equal(calls, 0); assert.equal((await store.read()).sets.length, 1);
});
// El servidor sí recibió la tanda; lo que se perdió fue el acuse. La instantánea es la que
// concilia, y ahora corre aunque el envío haya fallado.
test("ACK perdido concilia por instantánea y no duplica progreso", async () => {
  const store = memoryStore(profile([complete()])); let calls = 0;
  const client = { rpc: async name => {
    if (name.startsWith("submit")) { calls++; throw new Error("respuesta perdida"); }
    return {scope_id: "scope", revision: 1, acknowledged: [id], sets_completed: 1, progress: [{unidad_id: "UNIT", attempts: 1, correct: 1, omitted: 0}]};
  }};
  const args = {store, key: "scope:synthetic", scope: "scope", client, enabled: true};
  await assert.rejects(syncPractice(args), /no se respaldó/);
  assert.deepEqual((await store.read()).acknowledged, [id], "la instantánea concilia pese al fallo");
  assert.equal(accumulatedProgress(await store.read())[0].attempts, 1);
  await syncPractice(args);
  assert.equal(calls, 1, "ya conciliada, no se vuelve a enviar");
  assert.equal(accumulatedProgress(await store.read())[0].attempts, 1);
});

// Una tanda rechazada de forma permanente no puede dejar sin respaldo a las que vienen después.
test("una tanda rechazada no bloquea la cola de las demás", async () => {
  const otro = "33333333-3333-4333-8333-333333333333";
  const rota = { ...complete(), id: otro, responses: [{ ...complete().responses[0], unidad_id: "MALA" }] };
  const store = memoryStore(profile([rota, complete()])); const enviados = [];
  const client = { rpc: async (name, params) => {
    if (name.startsWith("submit")) {
      const batch = params.p_payload.batch_id;
      if (batch === otro) throw new Error("unknown_unit");
      enviados.push(batch); return {status: "accepted", batch_id: batch};
    }
    return {scope_id: "scope", revision: 1, acknowledged: enviados, sets_completed: enviados.length, progress: [{unidad_id: "UNIT", attempts: 1, correct: 1, omitted: 0}]};
  }};
  await assert.rejects(syncPractice({store, key: "scope:synthetic", scope: "scope", client, enabled: true}), /unknown_unit/);
  assert.deepEqual(enviados, [id], "la tanda sana sí llegó");
  assert.deepEqual((await store.read()).acknowledged, [id]);
});
test("recibo ajeno o HTTP exitoso sin comprobante no confirman", async () => {
  for (const receipt of [{}, {status: "accepted", batch_id: "wrong"}]) {
    const store = memoryStore(profile([complete()]));
    await assert.rejects(syncPractice({store, key: "scope:synthetic", scope: "scope", enabled: true, client: {rpc: async () => receipt}}));
    assert.equal((await store.read()).acknowledged.length, 0);
  }
});
test("snapshot viejo de otra pestaña no pisa totales más recientes", async () => {
  const p = {...profile([]), remote_revision: 5, remote: [{unidad_id: "UNIT", attempts: 5, correct: 4, omitted: 0}]};
  const store = memoryStore(p);
  await syncPractice({store, key: "scope:synthetic", scope: "scope", enabled: true, client: {rpc: async () => ({scope_id: "scope", revision: 4, acknowledged: [], sets_completed: 0, progress: []})}});
  assert.equal((await store.read()).remote_revision, 5); assert.equal(accumulatedProgress(await store.read())[0].attempts, 5);
});
test("una cola de otro curso no se envía; snapshot de otro scope se rechaza", async () => {
  const store = memoryStore(profile([])); let calls = 0;
  const client = {rpc: async () => {calls++; return {scope_id:"another",revision:0,progress:[],acknowledged:[],sets_completed:0};}};
  await assert.rejects(syncPractice({store,key:"foreign:synthetic",scope:"scope",client,enabled:true}));
  assert.equal(calls,0);
  await assert.rejects(syncPractice({store,key:"scope:synthetic",scope:"scope",client,enabled:true}));
});

// El plan gratuito de Supabase no trae respaldos automáticos: una pérdida en el servidor no debe
// borrar del cuaderno lo que este dispositivo ya envió y conserva en su historial local.
test("una instantánea remota vacía no borra el avance que este dispositivo respaldó", () => {
  const answered = { unidad_id: "UNIT", selected_option: "A", correct: true, day: "2026-09-09" };
  const p = { ...profile([{ id: id, state: "completed", items: [], cursor: 1, responses: [answered, { ...answered, correct: false, selected_option: "B" }] }]), acknowledged: [id] };
  assert.deepEqual(accumulatedProgress({ ...p, remote: [{ unidad_id: "UNIT", attempts: 2, correct: 1, last_practiced_on: "2026-09-09" }] })[0].attempts, 2);
  const wiped = accumulatedProgress({ ...p, remote: [] });
  assert.deepEqual(wiped, [{ unidad_id: "UNIT", attempts: 2, correct: 1, omitted: 0 }]);
});

test("una instantánea remota parcial no reduce lo respaldado, y la tanda pendiente sigue sumando", () => {
  const answered = { unidad_id: "UNIT", selected_option: "A", correct: true };
  const other = "22222222-2222-4222-8222-222222222222";
  const p = { ...profile([
    { id, state: "completed", items: [], cursor: 3, responses: [answered, answered, answered] },
    { id: other, state: "feedback", items: [], cursor: 1, responses: [answered] },
  ]), acknowledged: [id], remote: [{ unidad_id: "UNIT", attempts: 1, correct: 1, last_practiced_on: "2026-09-01" }] };
  // El servidor dice 1 y este aparato respaldó 3: manda el piso local, más la tanda sin respaldar.
  assert.equal(accumulatedProgress(p)[0].attempts, 4);
  assert.equal(accumulatedProgress(p)[0].correct, 4);
  // Con el servidor íntegro (5 incluye otro dispositivo), manda el remoto.
  const healthy = { ...p, remote: [{ unidad_id: "UNIT", attempts: 5, correct: 5, last_practiced_on: "2026-09-01" }] };
  assert.equal(accumulatedProgress(healthy)[0].attempts, 6);
});
