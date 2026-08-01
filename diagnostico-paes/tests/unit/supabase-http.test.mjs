import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseHttp } from "../../src/infra/supabase-http.mjs";

const config = {
  url: "https://project.example.supabase.co",
  publishable_key: "public-test-key",
  schema: "api",
};

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return body === null ? "" : JSON.stringify(body); },
  };
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

test("sin sesión crea una sesión anónima y usa su token en el RPC", async () => {
  const storage = memoryStorage();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/signup")) {
      return jsonResponse({
        access_token: "anonymous-access",
        refresh_token: "anonymous-refresh",
        expires_at: 4_102_444_800,
      });
    }
    return jsonResponse({ status: "synced", receipt_id: "receipt-1" });
  };

  const client = new SupabaseHttp(config, storage, fetcher);
  const receipt = await client.rpc("submit_attempt", { p_attempt_id: "attempt-1" });

  assert.deepEqual(receipt, { status: "synced", receipt_id: "receipt-1" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${config.url}/auth/v1/signup`);
  assert.deepEqual(JSON.parse(calls[0].options.body), { data: {}, gotrue_meta_security: {} });
  assert.equal(calls[1].url, `${config.url}/rest/v1/rpc/submit_attempt`);
  assert.equal(calls[1].options.headers.Authorization, "Bearer anonymous-access");
  assert.equal(calls[1].options.headers["Content-Profile"], "api");
  assert.deepEqual(JSON.parse(calls[1].options.body), { p_attempt_id: "attempt-1" });

  const stored = Object.values(storage.snapshot()).map(JSON.parse);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].refresh_token, "anonymous-refresh");
});

test("una sesión próxima a vencer se renueva antes del RPC", async () => {
  const tokenKey = "diagnostic-auth:project.example.supabase.co";
  const storage = memoryStorage({
    [tokenKey]: JSON.stringify({
      access_token: "stale-access",
      refresh_token: "refresh-me",
      expires_at: 1,
    }),
  });
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("grant_type=refresh_token")) {
      return jsonResponse({
        access_token: "fresh-access",
        refresh_token: "fresh-refresh",
        expires_at: 4_102_444_800,
      });
    }
    return jsonResponse({ status: "already_synced" });
  };

  const client = new SupabaseHttp(config, storage, fetcher);
  const receipt = await client.rpc("submit_attempt", {});

  assert.equal(receipt.status, "already_synced");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=refresh_token$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { refresh_token: "refresh-me" });
  assert.equal(calls[1].options.headers.Authorization, "Bearer fresh-access");
  assert.equal(JSON.parse(storage.getItem(tokenKey)).refresh_token, "fresh-refresh");
});

test("un refresh rechazado elimina la sesión inválida y propaga el error", async () => {
  const tokenKey = "diagnostic-auth:project.example.supabase.co";
  const storage = memoryStorage({
    [tokenKey]: JSON.stringify({ access_token: "stale", refresh_token: "invalid", expires_at: 1 }),
  });
  const fetcher = async () => jsonResponse({ message: "Refresh token invalid" }, { status: 401 });
  const client = new SupabaseHttp(config, storage, fetcher);

  await assert.rejects(() => client.accessToken(), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.message, "Refresh token invalid");
    return true;
  });
  assert.equal(storage.getItem(tokenKey), null);
});

test("clearSession elimina el token anónimo del dispositivo", () => {
  const tokenKey = "diagnostic-auth:project.example.supabase.co";
  const storage = memoryStorage({ [tokenKey]: JSON.stringify({ access_token: "temporary" }) });
  const client = new SupabaseHttp(config, storage, async () => { throw new Error("no debe tocar la red"); });

  client.clearSession();

  assert.equal(storage.getItem(tokenKey), null);
});
