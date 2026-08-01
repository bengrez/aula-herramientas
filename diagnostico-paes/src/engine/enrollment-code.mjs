export function normalizeCode(raw) {
  return String(raw ?? "").normalize("NFKC").toUpperCase().replace(/[\s-]+/g, "");
}

export function computeCheckCharacter(payload, config) {
  const alphabet = config.alfabeto;
  let accumulator = 0;
  for (const character of payload) {
    const position = alphabet.indexOf(character);
    if (position < 0) throw new Error("El código usa un carácter que no pertenece al alfabeto configurado");
    accumulator = (accumulator * config.multiplicador + position + 1) % alphabet.length;
  }
  return alphabet[(alphabet.length - accumulator) % alphabet.length];
}

export function formatCode(normalized, config) {
  const groups = [];
  let cursor = 0;
  for (const size of config.grupos) {
    groups.push(normalized.slice(cursor, cursor + size));
    cursor += size;
  }
  if (cursor < normalized.length) groups.push(normalized.slice(cursor));
  return groups.filter(Boolean).join("-");
}

export function createCode(payload, config) {
  const clean = normalizeCode(payload);
  if (clean.length !== config.longitud_carga) throw new Error("La carga del código tiene una longitud incorrecta");
  return formatCode(`${clean}${computeCheckCharacter(clean, config)}`, config);
}

export function validateCodeShape(raw, config) {
  const normalized = normalizeCode(raw);
  const expectedLength = config.longitud_carga + 1;
  if (normalized.length !== expectedLength) {
    return { ok: false, normalized, reason: `El código debe tener ${expectedLength} caracteres. Revisa que esté completo.` };
  }
  for (const character of normalized) {
    if (!config.alfabeto.includes(character)) {
      return { ok: false, normalized, reason: `El carácter “${character}” no se usa en estos códigos. Revisa el papel.` };
    }
  }
  const payload = normalized.slice(0, -1);
  const expected = computeCheckCharacter(payload, config);
  if (normalized.at(-1) !== expected) {
    return { ok: false, normalized, reason: "El código parece tener un error de escritura. Compáralo con el papel e inténtalo otra vez." };
  }
  return { ok: true, normalized, formatted: formatCode(normalized, config) };
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function validateEnrollmentCode(raw, config, { demo = false } = {}) {
  const shape = validateCodeShape(raw, config);
  if (!shape.ok) return shape;
  const digest = await sha256Hex(shape.normalized);
  const allowed = demo ? config.hashes_demo : config.hashes_permitidos;
  if (!allowed.includes(digest)) {
    return { ...shape, ok: false, reason: "Este código no pertenece a esta sesión. Pide al adulto a cargo que revise tu tarjeta." };
  }
  return { ...shape, digest };
}

export function randomPayload(config, randomBytes) {
  const alphabet = config.alfabeto;
  const bytes = randomBytes ?? globalThis.crypto.getRandomValues(new Uint8Array(config.longitud_carga * 2));
  let payload = "";
  for (const byte of bytes) {
    if (byte >= Math.floor(256 / alphabet.length) * alphabet.length) continue;
    payload += alphabet[byte % alphabet.length];
    if (payload.length === config.longitud_carga) return payload;
  }
  return randomPayload(config);
}
