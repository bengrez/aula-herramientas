#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv.find((value) => value.startsWith("--port="))?.split("=")[1] ?? 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const decoded = decodeURIComponent(url.pathname);
    let relative = normalize(decoded).replace(/^[/\\]+/, "");
    let path = resolve(root, relative);
    if (!path.startsWith(`${root}/`) && path !== root) throw new Error("Ruta fuera del sitio");
    const info = await stat(path).catch(() => null);
    if (info?.isDirectory()) path = join(path, "index.html");
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("No encontrado");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Diagnostic server ready at http://127.0.0.1:${port}/`);
});
