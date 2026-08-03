import test from "node:test";
import assert from "node:assert/strict";
import { ensureQueued, syncOutbox } from "../../src/infra/sync.mjs";

const backend = {
  enabled: true,
  url: "https://project.example.supabase.co",
  publishable_key: "public-test-key",
  schema: "api",
  rpc_name: "submit_attempt",
};

const attempt = {
  attempt_id: "00000000-0000-4000-8000-000000000001",
  enrollment_code: "TEST-CODE-X",
  administration_id: "administration-test",
  session_template_id: "session-test",
  session_version: "1",
  framework_id: "framework-test",
  framework_version: "1",
  enrollment_status: "provisional",
  started_at: "2026-08-17T12:00:00.000Z",
  completed_at: "2026-08-17T12:20:00.000Z",
};

const responses = [{
  response_id: "00000000-0000-4000-8000-000000000002",
  item_id: "ITEM-TEST-01",
  item_version: "1",
  selected_option: null,
  omitted: true,
  response_time_ms: 1200,
  presentation_order: 1,
  client_recorded_at: "2026-08-17T12:01:00.000Z",
  source: "device",
}];

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function outboxStore() {
  const entries = new Map();
  return {
    entries,
    synced: [],
    async queueAttempt(attemptId, payload) {
      const current = entries.get(attemptId);
      entries.set(attemptId, {
        attempt_id: attemptId,
        payload,
        status: ["synced", "orphaned"].includes(current?.status) ? current.status : "pending",
        attempts: current?.attempts ?? 0,
        last_error: current?.last_error ?? null,
      });
    },
    async listPendingOutbox() {
      return [...entries.values()].filter((entry) => entry.status === "pending");
    },
    async listOrphanedOutbox() {
      return [...entries.values()].filter((entry) => entry.status === "orphaned");
    },
    async updateOutbox(entry) { entries.set(entry.attempt_id, structuredClone(entry)); },
    async markSynced(attemptId, receipt) {
      const current = entries.get(attemptId);
      entries.set(attemptId, { ...current, status: "synced", receipt, last_error: null });
      this.synced.push({ attemptId, receipt });
    },
    async markOrphaned(attemptId, receipt) {
      const current = entries.get(attemptId);
      entries.set(attemptId, { ...current, status: "orphaned", receipt, last_error: null });
    },
  };
}

function response(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); },
  };
}

function installBrowserGlobals(online) {
  const descriptors = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    localStorage: Object.getOwnPropertyDescriptor(globalThis, "localStorage"),
  };
  Object.defineProperties(globalThis, {
    navigator: { configurable: true, value: { onLine: online } },
    localStorage: { configurable: true, value: memoryStorage() },
  });
  return {
    setOnline(value) { globalThis.navigator.onLine = value; },
    restore() {
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test("ensureQueued guarda un payload crudo sin campos derivados", async () => {
  const store = outboxStore();
  const payload = await ensureQueued(store, attempt, responses);
  const queued = store.entries.get(attempt.attempt_id);

  assert.deepEqual(queued.payload, payload);
  assert.equal(payload.p_responses_json.length, 1);
  assert.equal(payload.p_responses_json[0].omitted, true);
  assert.equal(payload.p_responses_json[0].selected_option, null);
  assert.equal(payload.p_enrollment_status, "provisional");
  assert.doesNotMatch(JSON.stringify(payload), /correct|score|diagnos|acierto/i);
});

test("la cola queda intacta sin red y se reintenta al recuperar conexión", async (t) => {
  const globals = installBrowserGlobals(false);
  t.after(() => globals.restore());
  const store = outboxStore();
  await ensureQueued(store, attempt, responses);
  const states = [];
  let fetchCalls = 0;
  const fetcher = async (url) => {
    fetchCalls += 1;
    if (url.endsWith("/auth/v1/signup")) {
      return response({ access_token: "access", refresh_token: "refresh", expires_at: 4_102_444_800 });
    }
    return response({ status: "synced", attempt_id: attempt.attempt_id, received_at: "2026-08-17T12:00:01.000Z" });
  };

  const offline = await syncOutbox(store, backend, { fetcher, onChange: (state) => states.push(state) });
  assert.deepEqual(offline, { state: "offline", pending: 1 });
  assert.equal(fetchCalls, 0);
  assert.equal(store.entries.get(attempt.attempt_id).status, "pending");

  globals.setOnline(true);
  const online = await syncOutbox(store, backend, { fetcher, onChange: (state) => states.push(state) });
  assert.deepEqual(online, { state: "synced", pending: 0, failures: 0 });
  assert.equal(fetchCalls, 2);
  assert.equal(store.entries.get(attempt.attempt_id).status, "synced");
  assert.deepEqual(states.map(({ state }) => state), ["offline", "syncing", "synced"]);
});

test("un recibo idempotente already_synced marca la entrada como sincronizada", async (t) => {
  const globals = installBrowserGlobals(true);
  t.after(() => globals.restore());
  const store = outboxStore();
  await ensureQueued(store, attempt, responses);
  const fetcher = async (url) => {
    if (url.endsWith("/auth/v1/signup")) {
      return response({ access_token: "access", refresh_token: "refresh", expires_at: 4_102_444_800 });
    }
    return response({ status: "already_synced", attempt_id: attempt.attempt_id, received_at: "2026-08-17T12:00:01.000Z" });
  };

  const result = await syncOutbox(store, backend, { fetcher });

  assert.equal(result.state, "synced");
  assert.equal(store.synced.length, 1);
  assert.equal(store.synced[0].receipt.status, "already_synced");
  assert.equal((await store.listPendingOutbox()).length, 0);
});

test("un recibo orphaned termina el reintento y conserva el registro para conciliación", async (t) => {
  const globals = installBrowserGlobals(true);
  t.after(() => globals.restore());
  const store = outboxStore();
  await ensureQueued(store, attempt, responses);
  const fetcher = async (url) => {
    if (url.endsWith("/auth/v1/signup")) {
      return response({ access_token: "access", refresh_token: "refresh", expires_at: 4_102_444_800 });
    }
    return response({ status: "orphaned", attempt_id: attempt.attempt_id, received_at: "2026-08-17T12:00:01.000Z" });
  };

  const first = await syncOutbox(store, backend, { fetcher });
  assert.equal(first.state, "orphaned");
  assert.equal(store.entries.get(attempt.attempt_id).status, "orphaned");
  assert.equal((await store.listPendingOutbox()).length, 0);
  const second = await syncOutbox(store, backend, { fetcher: async () => { throw new Error("no debe reintentar"); } });
  assert.equal(second.state, "orphaned");
});

test("un huérfano terminal sigue visible sin red y no vuelve a la cola", async (t) => {
  const globals = installBrowserGlobals(false);
  t.after(() => globals.restore());
  const store = outboxStore();
  await ensureQueued(store, attempt, responses);
  await store.markOrphaned(attempt.attempt_id, { status: "orphaned", attempt_id: attempt.attempt_id });

  const result = await syncOutbox(store, backend, {
    attemptId: attempt.attempt_id,
    administrationId: attempt.administration_id,
    fetcher: async () => { throw new Error("no debe reintentar"); },
  });

  assert.deepEqual(result, { state: "orphaned", pending: 0, orphaned: 1 });
});

test("la sincronización queda acotada al intento y administración activos", async (t) => {
  const globals = installBrowserGlobals(true);
  t.after(() => globals.restore());
  const store = outboxStore();
  const historical = {
    ...attempt,
    attempt_id: "00000000-0000-4000-8000-000000000099",
    administration_id: "administration-old",
  };
  await ensureQueued(store, historical, responses.map((entry) => ({ ...entry, attempt_id: historical.attempt_id })));
  await store.markOrphaned(historical.attempt_id, { status: "orphaned", attempt_id: historical.attempt_id });
  await ensureQueued(store, attempt, responses);
  const fetcher = async (url) => {
    if (url.endsWith("/auth/v1/signup")) {
      return response({ access_token: "access", refresh_token: "refresh", expires_at: 4_102_444_800 });
    }
    return response({ status: "synced", attempt_id: attempt.attempt_id, received_at: "2026-08-17T12:00:01.000Z" });
  };

  const result = await syncOutbox(store, backend, {
    attemptId: attempt.attempt_id,
    administrationId: attempt.administration_id,
    fetcher,
  });

  assert.equal(result.state, "synced");
  assert.equal(store.entries.get(attempt.attempt_id).status, "synced");
  assert.equal(store.entries.get(historical.attempt_id).status, "orphaned");
});

test("un fallo conserva el payload pendiente e incrementa sus intentos", async (t) => {
  const globals = installBrowserGlobals(true);
  t.after(() => globals.restore());
  const store = outboxStore();
  await ensureQueued(store, attempt, responses);
  const originalPayload = structuredClone(store.entries.get(attempt.attempt_id).payload);
  const fetcher = async (url) => {
    if (url.endsWith("/auth/v1/signup")) {
      return response({ access_token: "access", refresh_token: "refresh", expires_at: 4_102_444_800 });
    }
    return response({ message: "temporary outage" }, { status: 503 });
  };

  const result = await syncOutbox(store, backend, { fetcher });
  const retained = store.entries.get(attempt.attempt_id);

  assert.deepEqual(result, { state: "pending", pending: 1, failures: 1 });
  assert.equal(retained.status, "pending");
  assert.equal(retained.attempts, 1);
  assert.equal(retained.last_error, "temporary outage");
  assert.deepEqual(retained.payload, originalPayload);
});

test("una respuesta HTTP exitosa sin recibo válido no marca el intento como sincronizado", async (t) => {
  const globals = installBrowserGlobals(true);
  t.after(() => globals.restore());
  const store = outboxStore();
  await ensureQueued(store, attempt, responses);
  const fetcher = async (url) => {
    if (url.endsWith("/auth/v1/signup")) {
      return response({ access_token: "access", refresh_token: "refresh", expires_at: 4_102_444_800 });
    }
    return response({ status: "accepted", attempt_id: attempt.attempt_id });
  };

  const result = await syncOutbox(store, backend, { fetcher });
  const retained = store.entries.get(attempt.attempt_id);

  assert.equal(result.state, "pending");
  assert.equal(retained.status, "pending");
  assert.match(retained.last_error, /estado reconocido/);
  assert.equal(store.synced.length, 0);
});

test("un recibo de otro intento conserva la cola pendiente", async (t) => {
  const globals = installBrowserGlobals(true);
  t.after(() => globals.restore());
  const store = outboxStore();
  await ensureQueued(store, attempt, responses);
  const fetcher = async (url) => {
    if (url.endsWith("/auth/v1/signup")) {
      return response({ access_token: "access", refresh_token: "refresh", expires_at: 4_102_444_800 });
    }
    return response({ status: "synced", attempt_id: "00000000-0000-4000-8000-000000000099" });
  };

  const result = await syncOutbox(store, backend, { fetcher });

  assert.equal(result.state, "pending");
  assert.match(store.entries.get(attempt.attempt_id).last_error, /intento distinto/);
  assert.equal(store.synced.length, 0);
});
