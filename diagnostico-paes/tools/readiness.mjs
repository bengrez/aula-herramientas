#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { assertBundle } from "../src/engine/contracts.mjs";
import { assessReleaseReadiness } from "../src/engine/release-readiness.mjs";
import { readinessExitCode } from "./release-policy.mjs";

const activeUrl = new URL("../data/active.json", import.meta.url);
const readJson = async (url) => JSON.parse(await readFile(fileURLToPath(url), "utf8"));
const active = await readJson(activeUrl);
const bundle = assertBundle({
  active,
  deployment: await readJson(new URL(active.deployment_url, activeUrl)),
  framework: await readJson(new URL(active.framework_url, activeUrl)),
  bank: await readJson(new URL(active.bank_url, activeUrl)),
  session: await readJson(new URL(active.session_url, activeUrl)),
});
const assessment = assessReleaseReadiness(bundle);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    deployment_id: bundle.deployment.deployment_id,
    release_status: bundle.deployment.release_status,
    ...assessment,
  }, null, 2));
} else {
  console.log(`Estado de liberación: ${assessment.ready ? "GO" : "NO-GO"} (${assessment.passed}/${assessment.total})`);
  for (const check of assessment.checks) console.log(`${check.passed ? "OK" : "PENDIENTE"}\t${check.id}\t${check.label}`);
}

process.exitCode = readinessExitCode(assessment, process.argv);
