// Comprueba la red de temas del hub: datos/herramienta-conceptos.js contra los conceptos y temas de index.html (bloque RED-TEMAS) y contra las tarjetas.
// Uso: node tests/mapeo.mjs   (desde la raíz de aula-herramientas)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync('index.html', 'utf8');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync('datos/herramienta-conceptos.js', 'utf8'), ctx);
const M = ctx.window.HERRAMIENTA_CONCEPTOS;
const bloque = html.slice(html.indexOf('/*RED-TEMAS-START*/'), html.indexOf('/*RED-TEMAS-END*/'));
const arr = (nombre) => { const i = bloque.indexOf(`var ${nombre} = [`); return vm.runInNewContext(bloque.slice(i + `var ${nombre} = `.length, bloque.indexOf('];', i) + 1)); };
const C = arr('C'), TEMAS = arr('TEMAS'), EX = arr('EX');
const ids = C.map(c => c[0]);
const tarjetas = [...html.matchAll(/data-herr="([a-z0-9]+)"/g)].map(m => m[1]);
let mal = 0;
const err = s => { console.log('ERROR', s); mal++; };
console.log(`${ids.length} conceptos en C; ${TEMAS.length} temas; ${Object.keys(M).length} herramientas en el mapeo; ${tarjetas.length} tarjetas`);
// conceptos: ids únicos, padre existente, posición dentro del mundo (260 × 640) y sin nodos casi encimados
if (new Set(ids).size !== ids.length) err('ids de concepto repetidos');
for (const [id, et, x, y, padre] of C) {
  if (!et) err(`«${id}» sin nombre`);
  if (padre && !ids.includes(padre)) err(`«${id}»: el padre «${padre}» no está en C`);
  if (!(x >= 10 && x <= 250 && y >= 10 && y <= 630)) err(`«${id}» fuera del mundo (${x}, ${y})`);
}
for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) if (Math.hypot(C[i][2] - C[j][2], C[i][3] - C[j][3]) < 30) err(`«${C[i][0]}» y «${C[j][0]}» a menos de 30 unidades`);
for (const [a, b] of EX) for (const x of [a, b]) if (!ids.includes(x)) err(`relación cruzada con «${x}», que no está en C`);
// temas: cada concepto en un solo tema; la red es una sola componente conexa; todo tema tiene al menos un puente
const temaDe = {};
for (const [tid, nombre, grupos] of TEMAS) for (const [g, cs] of grupos) for (const c of cs) {
  if (!ids.includes(c)) err(`tema «${tid}»: «${c}» no está en C`);
  if (temaDe[c]) err(`«${c}» está en dos temas («${temaDe[c]}» y «${tid}»)`);
  temaDe[c] = tid;
}
for (const i of ids) if (!temaDe[i]) err(`«${i}» no está en ningún tema`);
const ar = []; for (const c of C) if (c[4]) ar.push([c[4], c[0]]); ar.push(...EX);
const ady = Object.fromEntries(ids.map(i => [i, []])); ar.forEach(([a, b]) => { ady[a].push(b); ady[b].push(a); });
const vis = new Set([ids[0]]), pila = [ids[0]]; while (pila.length) for (const v of ady[pila.pop()]) if (!vis.has(v)) { vis.add(v); pila.push(v); }
if (vis.size !== ids.length) err(`la red no es conexa: ${ids.filter(i => !vis.has(i)).join(' ')} quedan aparte`);
const puentes = {}; ar.forEach(([a, b]) => { if (temaDe[a] !== temaDe[b]) { (puentes[temaDe[a]] ||= new Set()).add(temaDe[b]); (puentes[temaDe[b]] ||= new Set()).add(temaDe[a]); } });
for (const [tid] of TEMAS) if (!puentes[tid]) err(`el tema «${tid}» no tiene puentes con otro tema`);
console.log('puentes entre temas:', Object.entries(puentes).map(([t, s]) => `${t}→${[...s].join('/')}`).join(' · '));
// herramientas
for (const [k, v] of Object.entries(M)) {
  if (!tarjetas.includes(k)) err(`la herramienta «${k}» no tiene tarjeta con data-herr`);
  if (!v.nombre) err(`«${k}» sin nombre`);
  const vistos = new Set();
  for (const c of v.conceptos) { if (!ids.includes(c)) err(`«${k}»: el concepto «${c}» no está en C`); if (vistos.has(c)) err(`«${k}»: «${c}» repetido`); vistos.add(c); }
  const ts = [...new Set(v.conceptos.map(c => temaDe[c]))];
  console.log(`  ${k}: ${v.conceptos.length} conceptos → temas: ${ts.join(', ')}`);
}
for (const t of tarjetas) if (!M[t]) err(`la tarjeta «${t}» no está en el mapeo`);
for (const [tid] of TEMAS) if (!Object.values(M).some(v => v.conceptos.some(c => temaDe[c] === tid))) console.log(`aviso: el tema «${tid}» no lo enciende ninguna herramienta`);
const sin = ids.filter(i => !Object.values(M).some(v => v.conceptos.includes(i)));
console.log('conceptos sin herramienta (válido; sólo se ven al abrir su tema):', sin.join(' ') || 'ninguno');
process.exit(mal ? 1 : 0);
