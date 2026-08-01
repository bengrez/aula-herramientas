#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createCode, normalizeCode, randomPayload, sha256Hex } from "../src/engine/enrollment-code.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deployment = JSON.parse(await readFile(join(root, "data/paes-ciencias-2027/deployment.v1.json"), "utf8"));
const countArgument = process.argv.find((argument) => argument.startsWith("--count="));
const count = Number(countArgument?.split("=")[1] ?? 26);
if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error("--count debe ser un entero entre 1 y 200");
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const outputValue = outputArgument?.slice("--output=".length).trim();
if (!outputValue) throw new Error("--output debe indicar un archivo restringido fuera del repositorio");
const outputPath = resolve(outputValue);
const relativeOutput = relative(root, outputPath);
const outputInsideRepository = relativeOutput === "" || (relativeOutput !== ".." && !relativeOutput.startsWith(`..${sep}`));
if (outputInsideRepository) throw new Error("--output debe quedar fuera del repositorio público");

const config = deployment.enrolamiento;
const records = [];
const codes = new Set();
const prefixes = new Set();
while (records.length < count) {
  const code = createCode(randomPayload(config), config);
  const normalized = normalizeCode(code);
  const prefix = normalized.slice(0, 3);
  if (codes.has(normalized) || prefixes.has(prefix)) continue;
  codes.add(normalized);
  prefixes.add(prefix);
  records.push({
    student_ref: `ALN-${String(records.length + 1).padStart(2, "0")}`,
    enrollment_code: code,
    enrollment_code_id: randomUUID(),
    participant_ref: randomUUID(),
    code_hash: await sha256Hex(normalized),
  });
}

const ledger = `${JSON.stringify({
  schema_version: 1,
  generated_at: new Date().toISOString(),
  deployment_id: deployment.deployment_id,
  administration_id: deployment.administracion.administracion_id,
  alphabet: config.alfabeto,
  code_payload_length: config.longitud_carga,
  records,
}, null, 2)}\n`;
await writeFile(outputPath, ledger, { encoding: "utf8", flag: "wx", mode: 0o600 });
process.stdout.write("Ledger restringido creado fuera del repositorio.\n");
