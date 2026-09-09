import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { assertPracticeBundle, practiceReadiness } from "../src/engine/practice.mjs";
import { combinePracticeBanks } from "../src/engine/practice-library.mjs";
export async function readPracticeDocuments() {
  const url = new URL("../data/practice.json", import.meta.url);
  const read = async u => JSON.parse(await readFile(u, "utf8"));
  const config = await read(url);
  const banks = await Promise.all([config.bank_url, config.visual_bank_url].filter(Boolean).map(path => read(new URL(path, url))));
  return {config, framework: await read(new URL(config.framework_url, url)), bank: combinePracticeBanks(banks)};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const b = assertPracticeBundle(await readPracticeDocuments());
  const r = practiceReadiness(b);
  console.log(`Práctica: contrato OK (${b.bank.items.length} ítems). ${r.ready ? "GO" : "NO-GO"} ${r.checks.filter(c => c.passed).length}/${r.checks.length}`);
  for (const check of r.checks) console.log(`${check.passed ? "OK" : "PENDIENTE"} ${check.id}`);
  if (process.argv.includes("--require-go") && !r.ready) process.exitCode = 1;
}
