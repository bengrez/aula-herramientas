import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {readPracticeDocuments} from "../../tools/practice-readiness.mjs";
import {assertPracticeBundle,practiceReadiness} from "../../src/engine/practice.mjs";
import {selectPracticeItems} from "../../src/engine/practice-selector.mjs";
import {divisionFigures} from "../../tools/division-figures.mjs";
const read=async path=>JSON.parse(await readFile(new URL(`../../${path}`,import.meta.url),"utf8"));
async function bundle(){return {...await readPracticeDocuments(),bank:await read("data/paes-ciencias-2027/bank-visual-division.v0.json")};}
test("piloto: dos figuras, cuatro preguntas y contratos compatibles",async()=>{
 const b=assertPracticeBundle(await bundle()),c=await read("data/figures.json");
 assert.equal(b.bank.items.length,4);assert.equal(c.figuras.length,2);
 for(const f of c.figuras){
   const items=b.bank.items.filter(i=>i.estimulo.figura_id===f.figura_id);assert.equal(items.length,2);
   for(const i of items) for(const k of Object.keys(i.estimulo)) assert.deepEqual(i.estimulo[k],f[k]);
 }
 assert.equal(practiceReadiness(b).ready,false);assert.equal(selectPracticeItems(b).length,0);
});
test("tandas visuales separan figura repetida y rotan sus cuatro preguntas",async()=>{
 const b=await bundle(),first=selectPracticeItems(b,{}, {preview:true,count:5});
 const second=selectPracticeItems(b,{}, {preview:true,count:5,recentItemIds:first});
 assert.equal(first.length,2);assert.equal(second.length,2);assert.equal(new Set([...first,...second]).size,4);
});
test("aprobar una pregunta no aprueba su figura; se rechazan rutas externas o traversal",async()=>{
 const b=await bundle();b.bank.items.forEach(i=>i.estado_revision="revisado_docente");
 assert.equal(selectPracticeItems(b).length,0);
 for(const archivo of ["https://example.org/f.svg","assets/figures/../../secret.svg","data:image/svg+xml,test"]){
  const altered=structuredClone(b);altered.bank.items[0].estimulo.archivo=archivo;
  assert.throws(()=>assertPracticeBundle(altered));
 }
});
test("SVG reproducibles, sin código activo, y todos incluidos offline",async()=>{
 const b=await bundle();
 for(const [name,expected] of Object.entries(divisionFigures())){
  const actual=await readFile(new URL(`../../assets/figures/${name}`,import.meta.url),"utf8");
  assert.equal(actual,expected);assert.doesNotMatch(actual,/<script|foreignObject|onload=|href=/i);
  assert.ok(b.config.offline_assets.includes(`../assets/figures/${name}`));
 }
});
test("conteos dibujados: 2n=4, cromátidas conservadas por panel y destino",()=>{
 const figures=divisionFigures();
 for(const [name,expected] of Object.entries({"mitosis.v1.svg":{A:[4,2],B:[8,1],C:[4,2],D:[8,1]},"meiosis.v1.svg":{P:[4,2],Q:[4,1]}})){
  for(const [panel,[count,chromatids]] of Object.entries(expected)){
   const body=figures[name].split(`id="panel-${panel}"`)[1].split('<g id="panel-')[0];
   const values=[...body.matchAll(/data-chromatids="(\d)"/g)].map(m=>Number(m[1]));
   assert.equal(values.length,count);assert.ok(values.every(n=>n===chromatids));
  }
 }
});
