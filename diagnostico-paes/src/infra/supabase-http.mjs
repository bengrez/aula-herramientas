const TOKEN_STORAGE_PREFIX = "diagnostic-auth";

async function parseResponse(response) {
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
  if (!response.ok) {
    const message = body?.message || body?.msg || body?.error_description || body?.error || `Solicitud rechazada (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export class SupabaseHttp {
  constructor(config, storage = globalThis.localStorage, fetcher = globalThis.fetch.bind(globalThis)) {
    this.config = config;
    this.storage = storage;
    this.fetcher = fetcher;
    this.tokenKey = `${TOKEN_STORAGE_PREFIX}:${new URL(config.url).host}`;
  }

  headers(accessToken) {
    return {
      apikey: this.config.publishable_key,
      Authorization: `Bearer ${accessToken ?? this.config.publishable_key}`,
      "Content-Type": "application/json;charset=UTF-8",
      "X-Client-Info": "diagnostic-static/0.1",
    };
  }

  getStoredSession() {
    try { return JSON.parse(this.storage.getItem(this.tokenKey)); } catch { return null; }
  }

  storeSession(session) {
    const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + Number(session.expires_in ?? 3600);
    const normalized = { ...session, expires_at: expiresAt };
    this.storage.setItem(this.tokenKey, JSON.stringify(normalized));
    return normalized;
  }

  clearSession() {
    this.storage.removeItem(this.tokenKey);
  }

  async signInAnonymously() {
    const response = await this.fetcher(`${this.config.url}/auth/v1/signup`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ data: {}, gotrue_meta_security: {} }),
    });
    const session = await parseResponse(response);
    if (!session?.access_token || !session?.refresh_token) throw new Error("La autenticación anónima no devolvió una sesión válida");
    return this.storeSession(session);
  }

  async refresh(refreshToken) {
    const response = await this.fetcher(`${this.config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const session = await parseResponse(response);
    if (!session?.access_token) throw new Error("No fue posible renovar la sesión anónima");
    return this.storeSession(session);
  }

  async accessToken() {
    const session = this.getStoredSession();
    if (!session) return (await this.signInAnonymously()).access_token;
    if (Number(session.expires_at) * 1000 - Date.now() < 60_000) {
      try { return (await this.refresh(session.refresh_token)).access_token; }
      catch (error) {
        if (error.status && error.status < 500) this.storage.removeItem(this.tokenKey);
        throw error;
      }
    }
    return session.access_token;
  }

  async rpc(name, parameters) {
    const token = await this.accessToken();
    const response = await this.fetcher(`${this.config.url}/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        ...this.headers(token),
        "Content-Profile": this.config.schema,
        "Accept-Profile": this.config.schema,
      },
      body: JSON.stringify(parameters),
    });
    return parseResponse(response);
  }
}
