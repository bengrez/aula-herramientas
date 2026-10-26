// Comprueba los textos explicativos de tabla-periodica-reactiva contra la tendencia y contra valores reales.
// Uso: node tests/tabla-periodica.mjs [carpeta]   (desde la raíz de aula-herramientas; por defecto tabla-periodica-reactiva/)
// Carga elementos.js y las funciones de razonamiento de index.html (de razonPosicion hasta predecirEnlace) en un vm.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const dir = (process.argv[2] || 'tabla-periodica-reactiva').replace(/\/$/, '');
const html = readFileSync(`${dir}/index.html`, 'utf8');
const nucleo = html.slice(html.indexOf('function razonPosicion(e)'), html.indexOf('function predecirEnlace('));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(`${dir}/elementos.js`, 'utf8') + '\n' + nucleo +
  '\nglobalThis.T = { ELEMENTOS, PORZ, razonPosicion, analizar, ambiguoEN, señalDe, porQueRadio, ' +
  '  excepcionEN: typeof excepcionEN === "function" ? excepcionEN : () => false };', ctx);
const { ELEMENTOS, PORZ, razonPosicion, analizar, ambiguoEN, señalDe, porQueRadio, excepcionEN } = ctx.T;
const plano = s => s.replace(/<[^>]+>/g, '');
// Electronegatividad de Pauling de los elementos que pregunta Practicar (BANCO), para contrastar.
const PAULING = { Li: 0.98, Be: 1.57, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Na: 0.93, Mg: 1.31, Al: 1.61, Si: 1.90,
  P: 2.19, S: 2.58, Cl: 3.16, K: 0.82, Ca: 1.00, Se: 2.55, Br: 2.96, Rb: 0.82, Sr: 0.95, Te: 2.10, I: 2.66, Cs: 0.79, Ba: 0.89,
  Ga: 1.81, Ge: 2.01, As: 2.18 };
const BANCO = [3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 19, 20, 35, 53, 56, 38, 5, 34, 52, 37, 55].map(z => PORZ[z]);
const s = x => PORZ[ELEMENTOS.find(e => e.simbolo === x).z];
let mal = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { console.log('ERROR', msg); mal++; } };

// 1. Pista de electronegatividad: en el mismo período gana el de la derecha; en el mismo grupo, el de arriba.
for (const a of BANCO) for (const b of BANCO) {
  if (a.z >= b.z || a.familia === 'nob' || b.familia === 'nob') continue;
  const t = plano(señalDe(a, b, 'en').texto);
  if (a.periodo === b.periodo) ok(/derecha/.test(t) && !/izquierda/.test(t), `pista EN ${a.simbolo}–${b.simbolo} (mismo período) no apunta a la derecha: «${t}»`);
  else if (a.grupo === b.grupo) ok(/menos niveles/.test(t) && !/gana el que tenga más niveles/.test(t), `pista EN ${a.simbolo}–${b.simbolo} (mismo grupo) no apunta al de arriba: «${t}»`);
}
ok(/señalDe\(a, b, esRadio \? "radio" : "en"\)/.test(html), 'Practicar no pasa la propiedad a señalDe (la pista de EN usaría el texto del radio)');

// 2. No hay «empate» de EN en el mismo grupo o el mismo período, ni cuando uno gana en las dos direcciones.
for (const [x, y] of [['O', 'F'], ['F', 'Cl'], ['N', 'O'], ['C', 'N'], ['N', 'P'], ['O', 'S'], ['S', 'Cl'], ['Na', 'Mg']])
  ok(!ambiguoEN(s(x), s(y)), `${x}–${y} se declara empatado en electronegatividad`);
for (const a of ELEMENTOS) for (const b of ELEMENTOS)
  if (a.z !== b.z && (a.periodo === b.periodo || (a.grupo === b.grupo && a.grupo !== 0)) && ambiguoEN(a, b) && !excepcionEN(a, b)) { ok(false, `${a.simbolo}–${b.simbolo} (misma fila o columna) se declara empatado`); }
// Excepciones conocidas de Pauling en los grupos 13 y 14 (la fila de transición): la posición no las decide.
for (const [x, y] of [['Al', 'Ga'], ['Si', 'Ge']]) ok(ambiguoEN(s(x), s(y)), `${x}–${y}: la herramienta da ganador de EN contra Pauling`);
ok(ambiguoEN(s('Li'), s('Ca')), 'Li–Ca debería seguir siendo el caso que la posición no resuelve (0,98 contra 1,00)');
// Donde la herramienta sí responde, su respuesta coincide con Pauling (se omiten los empates reales, como K–Rb):
// los elementos del BANCO de Practicar y los de los períodos 2 a 4 de Comparar (grupos principales, sin gases nobles).
const CONTRASTE = Object.keys(PAULING).map(s);
for (const a of CONTRASTE) for (const b of CONTRASTE) {
  if (a.z >= b.z || ambiguoEN(a, b)) continue;
  const d = PAULING[a.simbolo] - PAULING[b.simbolo]; if (Math.abs(d) < 0.05) continue;
  const gana = analizar(a, b).masFuerte, real = d > 0 ? a : b;
  ok(gana === real, `EN ${a.simbolo}–${b.simbolo}: la herramienta dice ${gana.simbolo}, Pauling dice ${real.simbolo}`);
}

// 3. El «por qué» del radio no dice «más a la izquierda» cuando el más grande está a la derecha.
for (const a of ELEMENTOS) for (const b of ELEMENTOS) {
  if (a.z >= b.z || a.grupo === 0 || b.grupo === 0) continue;
  const r = analizar(a, b), t = plano(porQueRadio(a, b));
  if (/más a la izquierda/.test(t)) ok(r.mayor.grupo < r.menor.grupo, `radio ${a.simbolo}–${b.simbolo}: dice que ${r.mayor.simbolo} está más a la izquierda (grupo ${r.mayor.grupo} contra ${r.menor.grupo})`);
}
ok(!/izquierda/.test(plano(porQueRadio(s('Li'), s('Ca')))), 'Li–Ca (Práctica 1 de la guía): el radio dice que Ca está más a la izquierda');

// 4. La ficha de Explorar respeta la zona: un no metal no «cede» y un metal no «atrae electrones ajenos».
for (const e of ELEMENTOS) {
  const t = plano(razonPosicion(e));
  if (e.zona === 'nometal') ok(!/tiende a ceder|(?<!no )suelta|zona central de los metales/.test(t), `ficha ${e.simbolo} (no metal): «${t}»`);
  if (e.zona === 'metal') ok(!/atrae electrones ajenos|no metal\b/.test(t), `ficha ${e.simbolo} (metal): «${t}»`);
}
ok(!/grande/.test(plano(razonPosicion(s('H')))), 'ficha H: lo describe como grande');
for (const x of ['Al', 'Ga', 'In']) ok(!/no metales de su columna/.test(plano(razonPosicion(s(x)))), `ficha ${x}: habla de no metales en la columna 13`);

console.log(`${n} comprobaciones, ${mal} con error`);
process.exit(mal ? 1 : 0);
