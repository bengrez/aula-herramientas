const LEGACY_PREFIX = "DX1";
const PREFIX = "DX2";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function crc32(value) {
  const bytes = new TextEncoder().encode(value);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0").toUpperCase();
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function fromBase64Url(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function uuidToToken(uuid) {
  if (!UUID.test(uuid)) throw new Error("El respaldo contiene un identificador inválido");
  const hex = uuid.replace(/-/g, "");
  return bytesToBase64Url(Uint8Array.from({ length: 16 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)));
}

function tokenToUuid(token) {
  const bytes = base64UrlToBytes(token);
  if (bytes.length !== 16) throw new Error("El respaldo contiene un identificador inválido");
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  if (!UUID.test(uuid)) throw new Error("El respaldo contiene un identificador inválido");
  return uuid;
}

function timestampToMs(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isSafeInteger(milliseconds)) throw new Error("El respaldo contiene una fecha inválida");
  return milliseconds;
}

function msToTimestamp(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value)) throw new Error("El respaldo contiene una fecha inválida");
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error("El respaldo contiene una fecha inválida");
  return date.toISOString();
}

function orderedReferences(bundle) {
  if (!bundle?.session?.items || !bundle?.deployment?.administracion || !bundle?.framework) {
    throw new Error("Hace falta la versión activa de la sesión para leer el respaldo");
  }
  return [...bundle.session.items].sort((left, right) => left.orden - right.orden);
}

export function backupBundleKey(bundle) {
  const references = orderedReferences(bundle);
  const identity = [
    bundle.deployment.deployment_id,
    bundle.deployment.version,
    bundle.deployment.administracion.administracion_id,
    bundle.session.plantilla_id,
    bundle.session.version,
    bundle.framework.marco_id,
    bundle.framework.version,
    ...references.flatMap((reference) => [reference.orden, reference.item_id, reference.item_version]),
  ].join("\u001f");
  return crc32(identity);
}

function compactLegacyPayload(attempt, responses) {
  return {
    v: 1,
    a: attempt.attempt_id,
    d: attempt.administration_id,
    s: attempt.session_template_id,
    sv: attempt.session_version,
    f: attempt.framework_id,
    fv: attempt.framework_version,
    c: attempt.enrollment_code,
    b: attempt.started_at,
    e: attempt.completed_at,
    r: [...responses]
      .sort((left, right) => left.presentation_order - right.presentation_order)
      .map((response) => [
        response.response_id,
        response.item_id,
        response.item_version,
        response.selected_option,
        response.response_time_ms,
        response.presentation_order,
        response.client_recorded_at,
        response.source,
      ]),
  };
}

function expandLegacyPayload(compact) {
  if (!compact || compact.v !== 1 || !Array.isArray(compact.r)) throw new Error("Versión de respaldo no compatible");
  const attempt = {
    attempt_id: compact.a,
    administration_id: compact.d,
    session_template_id: compact.s,
    session_version: compact.sv,
    framework_id: compact.f,
    framework_version: compact.fv,
    enrollment_code: compact.c,
    started_at: compact.b,
    completed_at: compact.e,
    status: "completed",
    sync_status: "manual_backup",
  };
  const responses = compact.r.map((row) => ({
    response_id: row[0],
    attempt_id: compact.a,
    administration_id: compact.d,
    session_template_id: compact.s,
    session_version: compact.sv,
    framework_id: compact.f,
    framework_version: compact.fv,
    item_id: row[1],
    item_version: row[2],
    selected_option: row[3],
    omitted: row[3] === null,
    response_time_ms: row[4],
    presentation_order: row[5],
    client_recorded_at: row[6],
    source: row[7] ?? "device",
  }));
  return { attempt, responses };
}

export function compactBackupPayload(attempt, responses, bundle) {
  const references = orderedReferences(bundle);
  const orderedResponses = [...responses].sort((left, right) => left.presentation_order - right.presentation_order);
  if (orderedResponses.length !== references.length) throw new Error("El respaldo no contiene todas las respuestas de la sesión");
  const sources = new Set(orderedResponses.map((response) => response.source));
  if (sources.size !== 1 || !["device", "paper"].includes([...sources][0])) throw new Error("El respaldo mezcla procedencias o usa una procedencia desconocida");
  const source = [...sources][0];
  const recordedTimes = orderedResponses.map((response) => timestampToMs(response.client_recorded_at));
  const recordingBase = Math.min(...recordedTimes);

  const rows = orderedResponses.map((response, index) => {
    const reference = references[index];
    if (response.attempt_id !== attempt.attempt_id
      || response.presentation_order !== reference.orden
      || response.item_id !== reference.item_id
      || response.item_version !== reference.item_version) {
      throw new Error(`La respuesta ${index + 1} no coincide con la sesión activa`);
    }
    return [
      uuidToToken(response.response_id),
      response.selected_option,
      response.response_time_ms,
      recordedTimes[index] - recordingBase,
    ];
  });

  return [
    2,
    backupBundleKey(bundle),
    uuidToToken(attempt.attempt_id),
    attempt.enrollment_code,
    source === "device" ? "d" : "p",
    timestampToMs(attempt.started_at, { nullable: true }),
    timestampToMs(attempt.completed_at),
    recordingBase,
    rows,
  ];
}

function expandCompactPayload(compact, bundle) {
  if (!Array.isArray(compact) || compact.length !== 9 || compact[0] !== 2 || !Array.isArray(compact[8])) {
    throw new Error("Versión de respaldo no compatible");
  }
  if (compact[1] !== backupBundleKey(bundle)) throw new Error("El respaldo pertenece a otra versión de la sesión");
  const references = orderedReferences(bundle);
  if (compact[8].length !== references.length) throw new Error("El respaldo no contiene todas las respuestas de la sesión");
  const source = compact[4] === "d" ? "device" : compact[4] === "p" ? "paper" : null;
  if (!source) throw new Error("El respaldo contiene una procedencia inválida");
  const attemptId = tokenToUuid(compact[2]);
  const attempt = {
    attempt_id: attemptId,
    administration_id: bundle.deployment.administracion.administracion_id,
    session_template_id: bundle.session.plantilla_id,
    session_version: bundle.session.version,
    framework_id: bundle.framework.marco_id,
    framework_version: bundle.framework.version,
    enrollment_code: compact[3],
    started_at: msToTimestamp(compact[5], { nullable: true }),
    completed_at: msToTimestamp(compact[6]),
    status: "completed",
    sync_status: "manual_backup",
  };
  const recordingBase = compact[7];
  if (!Number.isSafeInteger(recordingBase)) throw new Error("El respaldo contiene una fecha inválida");
  const responses = compact[8].map((row, index) => {
    if (!Array.isArray(row) || row.length !== 4 || !Number.isSafeInteger(row[3])) throw new Error(`La respuesta ${index + 1} está incompleta`);
    const reference = references[index];
    return {
      response_id: tokenToUuid(row[0]),
      attempt_id: attemptId,
      administration_id: attempt.administration_id,
      session_template_id: attempt.session_template_id,
      session_version: attempt.session_version,
      framework_id: attempt.framework_id,
      framework_version: attempt.framework_version,
      item_id: reference.item_id,
      item_version: reference.item_version,
      selected_option: row[1],
      omitted: row[1] === null,
      response_time_ms: row[2],
      presentation_order: reference.orden,
      client_recorded_at: msToTimestamp(recordingBase + row[3]),
      source,
    };
  });
  return { attempt, responses };
}

export function encodeBackup(attempt, responses, bundle) {
  const json = JSON.stringify(compactBackupPayload(attempt, responses, bundle));
  const encoded = toBase64Url(json);
  return `${PREFIX}.${encoded}.${crc32(encoded)}`;
}

export function encodeLegacyBackup(attempt, responses) {
  const encoded = toBase64Url(JSON.stringify(compactLegacyPayload(attempt, responses)));
  return `${LEGACY_PREFIX}.${encoded}.${crc32(encoded)}`;
}

export function decodeBackup(code, bundle) {
  const normalized = String(code ?? "").trim().replace(/\s+/g, "");
  const [prefix, encoded, checksum, ...extra] = normalized.split(".");
  if (![PREFIX, LEGACY_PREFIX].includes(prefix) || !encoded || !checksum || extra.length) throw new Error("El código de respaldo no tiene el formato esperado");
  if (crc32(encoded) !== checksum.toUpperCase()) throw new Error("El respaldo está incompleto o fue alterado");
  try {
    const compact = JSON.parse(fromBase64Url(encoded));
    if (prefix === LEGACY_PREFIX) return expandLegacyPayload(compact);
    return expandCompactPayload(compact, bundle);
  } catch (error) {
    if (error.message.includes("respaldo") || error.message.includes("Versión") || error.message.includes("sesión")) throw error;
    throw new Error("El contenido del respaldo no se pudo leer", { cause: error });
  }
}
