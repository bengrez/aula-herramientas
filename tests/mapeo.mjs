// Comprueba datos/herramienta-conceptos.js contra el arreglo C de index.html y contra las tarjetas.
// Uso: node tests/mapeo.mjs   (desde la raíz de aula-herramientas)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync('index.html', 'utf8');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync('datos/herramienta-conceptos.js', 'utf8'), ctx);
const M = ctx.window.HERRAMIENTA_CONCEPTOS;
const bloque = html.slice(html.indexOf('var C = ['), html.indexOf('];', html.indexOf('var C = [')) + 2);
const ids = [...bloque.matchAll(/\['([a-z0-9]+)',\s*'/g)].map(m => m[1]);
const tarjetas = [...html.matchAll(/data-herr="([a-z0-9]+)"/g)].map(m => m[1]);
let mal = 0;
const err = s => { console.log('ERROR', s); mal++; };
console.log(`${ids.length} conceptos en C; ${Object.keys(M).length} herramientas en el mapeo; ${tarjetas.length} tarjetas`);
for (const [k, v] of Object.entries(M)) {
  if (!tarjetas.includes(k)) err(`la herramienta «${k}» no tiene tarjeta con data-herr`);
  if (!v.nombre) err(`«${k}» sin nombre`);
  const vistos = new Set();
  for (const c of v.conceptos) { if (!ids.includes(c)) err(`«${k}»: el concepto «${c}» no está en C`); if (vistos.has(c)) err(`«${k}»: «${c}» repetido`); vistos.add(c); }
  console.log(`  ${k}: ${v.conceptos.length} conceptos`);
}
for (const t of tarjetas) if (!M[t]) err(`la tarjeta «${t}» no está en el mapeo`);
const sin = ids.filter(i => !Object.values(M).some(v => v.conceptos.includes(i)));
console.log('conceptos sin herramienta (válido; sólo se ven en la red):', sin.join(' ') || 'ninguno');
process.exit(mal ? 1 : 0);
