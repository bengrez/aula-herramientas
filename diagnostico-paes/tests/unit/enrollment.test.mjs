import test from "node:test";
import assert from "node:assert/strict";
import { createCode } from "../../src/engine/enrollment-code.mjs";
import { authorizeEnrollment } from "../../src/infra/enrollment.mjs";

const enrollment = {
  alfabeto: "23456789ABCDEFGHJKMNPQRSTUVWXYZ",
  longitud_carga: 8,
  multiplicador: 7,
  grupos: [3, 3, 3],
  hashes_permitidos: [],
  hashes_demo: [],
};
const code = createCode("R3A2PAES", enrollment);
const bundle = {
  deployment: {
    enrolamiento: enrollment,
    administracion: { administracion_id: "administration-test" },
    backend: {
      enabled: true,
      url: "https://project.supabase.co",
      publishable_key: "public-test-key-long-enough",
      schema: "api",
      enrollment_rpc_name: "enroll_session_v1",
    },
  },
  session: { plantilla_id: "session-test", version: "1" },
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); },
  };
}

test("online confirma la tarjeta solo mediante el backend", async () => {
  const calls = [];
  const result = await authorizeEnrollment(code, bundle, {
    online: true,
    storage: memoryStorage(),
    fetcher: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      if (url.endsWith("/auth/v1/signup")) {
        return response({ access_token: "access", refresh_token: "refresh", expires_at: 4_102_444_800 });
      }
      return response({ status: "confirmed" });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.enrollment_status, "confirmed");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.p_enrollment_code, code);
  assert.equal("digest" in result, false);
});

test("offline acepta por checksum y marca la sesión como provisional sin solicitudes", async () => {
  let calls = 0;
  const result = await authorizeEnrollment(code, bundle, {
    online: false,
    fetcher: async () => { calls += 1; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.enrollment_status, "provisional");
  assert.equal(result.provisional_reason, "sin_conexion");
  assert.equal(calls, 0);
});

test("un rechazo definitivo de pertenencia no se convierte en provisional", async () => {
  const result = await authorizeEnrollment(code, bundle, {
    online: true,
    storage: memoryStorage(),
    fetcher: async (url) => url.endsWith("/auth/v1/signup")
      ? response({ access_token: "access", refresh_token: "refresh", expires_at: 4_102_444_800 })
      : response({ message: "enrollment_not_accepted" }, 400),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /adulto a cargo/);
});

test("un fallo transitorio permite continuar provisionalmente", async () => {
  const result = await authorizeEnrollment(code, bundle, {
    online: true,
    storage: memoryStorage(),
    fetcher: async (url) => url.endsWith("/auth/v1/signup")
      ? response({ access_token: "access", refresh_token: "refresh", expires_at: 4_102_444_800 })
      : response({ message: "temporary" }, 503),
  });
  assert.equal(result.ok, true);
  assert.equal(result.enrollment_status, "provisional");
});
