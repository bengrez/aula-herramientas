import test from "node:test";
import assert from "node:assert/strict";
import { createCode, normalizeCode, sha256Hex, validateCodeShape, validateEnrollmentCode } from "../../src/engine/enrollment-code.mjs";

const config = {
  alfabeto: "23456789ABCDEFGHJKMNPQRSTUVWXYZ",
  longitud_carga: 8,
  multiplicador: 7,
  grupos: [3, 3, 3],
  hashes_permitidos: [],
  hashes_demo: [],
};

test("genera, formatea y valida el dígito verificador", () => {
  const code = createCode("TESTPAES", config);
  assert.equal(code, "TES-TPA-ESB");
  assert.equal(validateCodeShape(code, config).ok, true);
  assert.equal(validateCodeShape("TES-TPA-ESA", config).ok, false);
});

test("rechaza caracteres ambiguos antes de cualquier consulta externa", () => {
  assert.equal(validateCodeShape("TES-TPA-EO1", config).ok, false);
});

test("el modo demostración comprueba solo el hash sintético local", async () => {
  const code = createCode("TESTPAES", config);
  const digest = await sha256Hex(normalizeCode(code));
  const accepted = await validateEnrollmentCode(code, { ...config, hashes_demo: [digest] }, { demo: true });
  const rejected = await validateEnrollmentCode(code, config, { demo: true });
  assert.equal(accepted.ok, true);
  assert.equal(rejected.ok, false);
});

test("el modo real valida forma sin consultar pertenencia y demostración queda aislada", async () => {
  const demoCode = createCode("TESTPAES", config);
  const realCode = createCode("R3A2PAES", config);
  const demoDigest = await sha256Hex(normalizeCode(demoCode));
  const isolated = { ...config, hashes_demo: [demoDigest] };

  assert.equal((await validateEnrollmentCode(demoCode, isolated, { demo: true })).ok, true);
  assert.equal((await validateEnrollmentCode(realCode, isolated, { demo: true })).ok, false);
  assert.equal((await validateEnrollmentCode(realCode, isolated)).ok, true);
  assert.equal((await validateEnrollmentCode(demoCode, isolated)).ok, true);
  assert.equal("digest" in await validateEnrollmentCode(realCode, isolated), false);
});
