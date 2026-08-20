import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Los cuatro documentos se resuelven desde data/active.json, igual que la aplicación y el
// preflight. Las pruebas nombraban los archivos por su ruta literal, así que renombrar un banco o
// refechar una sesión las rompía una por una sin que nada estuviera realmente mal.

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));

export async function readActiveDocuments() {
  const activePath = join(root, "data/active.json");
  const active = JSON.parse(await readFile(activePath, "utf8"));
  const base = pathToFileURL(activePath);
  const read = async (url) => JSON.parse(await readFile(fileURLToPath(new URL(url, base)), "utf8"));
  return {
    active,
    framework: await read(active.framework_url),
    bank: await read(active.bank_url),
    session: await read(active.session_url),
    deployment: await read(active.deployment_url),
  };
}
