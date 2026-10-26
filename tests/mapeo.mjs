// Comprueba datos/herramienta-conceptos.js contra el arreglo C de index.html y contra las tarjetas, y que la red sea UNA sola componente conexa
// por la que cada herramienta alcanza a todas las demás.
// Uso: node tests/mapeo.mjs   (desde la raíz de aula-herramientas)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync('index.html', 'utf8');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync('datos/herramienta-conceptos.js', 'utf8'), ctx);
const M = ctx.window.HERRAMIENTA_CONCEPTOS;
const bloque = html.slice(html.indexOf('var C = ['), html.indexOf('];', html.indexOf('var C = [')) + 2);
const ids = [...bloque.matchAll(/\['([a-z0-9]+)',\s*'/g)].map(m => m[1]);
const C = vm.runInNewContext(bloque.slice(bloque.indexOf('['), bloque.lastIndexOf(']') + 1));   // [id, etiqueta, padre, tipo, rol, prioridad]
const bEX = html.slice(html.indexOf('var EX = ['), html.indexOf('];', html.indexOf('var EX = [')) + 1);
const EX = vm.runInNewContext(bEX.slice(bEX.indexOf('[')));                                  // relaciones cruzadas [a, b, tipo]
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

// ---- la red completa y conexa ----
// Las aristas del árbol (concepto → su padre) se trazan siempre; las cruzadas (EX) sólo si sus extremos quedan a 14–190 px, así que la conexión debe valer sólo con el árbol.
const rows = Object.fromEntries(C.map(c => [c[0], c]));
if (new Set(ids).size !== ids.length) err('ids repetidos en C');
for (const c of C) if (c[2] && !rows[c[2]]) err(`«${c[0]}»: el padre «${c[2]}» no está en C`);
for (const e of EX) for (const x of e.slice(0, 2)) if (!rows[x]) err(`EX: «${x}» no está en C`);
const raices = C.filter(c => !c[2]).map(c => c[0]);
if (raices.length !== 1) err(`debe haber una sola raíz y hay ${raices.length}: ${raices.join(' ')}`);
function ady(conCruzadas) {
  const g = Object.fromEntries(ids.map(i => [i, new Set()]));
  for (const c of C) if (c[2] && g[c[2]]) { g[c[0]].add(c[2]); g[c[2]].add(c[0]); }
  if (conCruzadas) for (const e of EX) if (g[e[0]] && g[e[1]]) { g[e[0]].add(e[1]); g[e[1]].add(e[0]); }
  return g;
}
function alcance(g, desde) { const vis = new Set(desde), pila = [...desde]; while (pila.length) for (const v of g[pila.pop()]) if (!vis.has(v)) { vis.add(v); pila.push(v); } return vis; }
for (const [nombre, conX] of [['sólo árbol', false], ['árbol + cruzadas', true]]) {
  const g = ady(conX), alc = alcance(g, [ids[0]]);
  if (alc.size !== ids.length) err(`la red (${nombre}) no es conexa: quedan fuera ${ids.filter(i => !alc.has(i)).join(' ')}`);
}
const g0 = ady(false);
for (const [k, v] of Object.entries(M)) {
  const alc = alcance(g0, v.conceptos);
  for (const [k2, v2] of Object.entries(M)) if (k2 !== k && !v2.conceptos.some(c => alc.has(c))) err(`la herramienta «${k}» no alcanza a «${k2}» por la red`);
  // ningún concepto de una herramienta queda colgando sin camino al resto de sus propios conceptos ni a las demás herramientas
  for (const c of v.conceptos) { const a = alcance(g0, [c]); if (!Object.entries(M).every(([k3, v3]) => k3 === k || v3.conceptos.some(x => a.has(x)))) err(`«${c}» (de «${k}») no alcanza a todas las demás herramientas`); }
}
console.log(`red conexa: ${ids.length} conceptos, 1 raíz (${raices[0]}), ${C.filter(c => c[2]).length} aristas de árbol y ${EX.length} cruzadas; cada una de las ${Object.keys(M).length} herramientas alcanza a las demás`);
process.exit(mal ? 1 : 0);
