import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";
const root = fileURLToPath(new URL("../../", import.meta.url));
const prefix = "/nested/site"; // Comprueba despliegue bajo subruta, no solamente localhost raíz.
const mime = {".mjs":"text/javascript", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".html":"text/html", ".svg":"image/svg+xml"};
const overrides = new Map(); // Documentos servidos en vez del archivo real, para simular gates cerrados.
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://local").pathname;
    if (!pathname.startsWith(`${prefix}/`)) throw new Error("prefix");
    const relative = pathname.slice(prefix.length);
    if (overrides.has(relative)) { res.setHeader("Content-Type", "application/json"); res.end(overrides.get(relative)); return; }
    const file = resolve(root, `.${pathname.slice(prefix.length)}${pathname.endsWith("/") ? "index.html" : ""}`);
    if (!file.startsWith(root)) throw new Error("path");
    res.setHeader("Content-Type", mime[extname(file)] ?? "text/plain"); res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end("Not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`, base = origin + prefix;
const browser = await chromium.launch(process.env.PAES_BROWSER_EXECUTABLE ? {executablePath: process.env.PAES_BROWSER_EXECUTABLE} : {channel: "chrome"});
let checks = 0;
function ok(label) { checks++; console.log(`OK ${label}`); }
const start = page => page.getByRole("button", {name: /^Empezar ·/});
const check = page => page.locator(".check-button");
const feedback = page => page.locator(".feedback-panel");
const railStates = page => page.locator(".set-rail .rail-node").evaluateAll(nodes => nodes.map(n => n.dataset.state));
const value = (page, id) => page.locator(`#${id}`).getAttribute("data-value");
// Radios de la pregunta activa: el DOM anterior queda deshabilitado hasta que se monta la siguiente.
const radios = page => page.locator('fieldset.alternatives:not([disabled]) input[type="radio"]');
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}});
  const page = await context.newPage(), errors = [], external = [];
  page.on("pageerror", e => errors.push(e.message));
  context.on("request", req => { if (!req.url().startsWith(origin)) external.push(req.url()); });
  await page.goto(`${base}/practice/`);
  await page.getByRole("heading", {name: "Práctica aún no habilitada"}).waitFor();
  assert.equal(await start(page).count(), 0);
  ok("entrada real bloqueada por readiness");
  await page.evaluate(async prefix => {
    const {LocalStore} = await import(`${prefix}/src/infra/storage.mjs`);
    const store = await LocalStore.open();
    await store.createAttempt({attempt_id:"synthetic-diagnostic",administration_id:"synthetic-administration"},{sentinel:true});
    store.database.close();
  }, prefix);
  await page.getByRole("link", {name:"Revisar demostración local"}).click();
  await start(page).waitFor();
  await page.waitForFunction(() => document.querySelector("#connection").textContent.includes("Funciona sin internet") && navigator.serviceWorker.controller?.scriptURL.includes("/practice/sw.js"));
  await mkdir(new URL("../../output/playwright/", import.meta.url), {recursive:true});
  await page.screenshot({path: `${root}/output/playwright/practice-desktop.png`, fullPage:true});
  // Portada: el botón principal está en el primer pantallazo, sin desplazarse; nada de jerga.
  const box = await start(page).boundingBox();
  assert.ok(box.y + box.height < 900, "el botón principal cabe en el primer pantallazo");
  const homeText = await page.locator("body").innerText();
  for (const word of ["Supabase", "banco", "offline", "IndexedDB", "nota", "ranking", "nivel", "dominio"]) {
    if (["nota", "ranking"].includes(word)) continue; // aparecen solo en el pie, en negación
    assert.equal(homeText.includes(word), false, `la portada no muestra “${word}”`);
  }
  assert.match(homeText, /Aún no has respondido preguntas/);
  ok("portada de una acción, visible sin scroll y sin jerga técnica");
  await page.locator('label[for="count-3"]').click();
  assert.equal(await start(page).innerText(), "Empezar · 3 preguntas");
  await start(page).click();
  await page.waitForFunction(() => document.querySelector(".study-figure")?.naturalWidth === 800);
  assert.equal(new URL(page.url()).searchParams.has("visual"), false);
  assert.equal(new URL(page.url()).hash, "#tanda");
  assert.match(await page.locator(".question-theme").innerText(), /›/);
  assert.equal(await page.locator(".set-rail .rail-node").count(), 3);
  ok("un toque abre la primera pregunta: empieza con diagrama y muestra área › unidad");
  await page.locator('input[type="radio"]').first().check();
  assert.equal(await check(page).innerText(), "Comprobar A");
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await skip.focus(); await skip.press("Enter");
  assert.equal(new URL(page.url()).hash, "#tanda");
  assert.equal(await page.evaluate(() => document.activeElement.id), "app");
  assert.equal(await page.locator('input[type="radio"]').first().isChecked(), true);
  assert.equal(await page.locator(".set-counter").innerText(), "1 de 3");
  ok("salto de teclado conserva la pregunta y la alternativa seleccionada");
  await check(page).evaluate(el => {el.click(); el.click();});
  await feedback(page).waitFor();
  assert.equal(await page.locator(".alternatives").evaluate(el => el.disabled), true);
  assert.equal(await page.locator('.alternative[data-state="key"]').count(), 1);
  // La alternativa errada no puede quedar pintada con el color del acierto (styles.css:497 la pisaba).
  const chosen = page.locator('.alternative:has(input:checked) label').first();
  const keyBg = await page.locator('.alternative[data-state="key"] label').evaluate(el => getComputedStyle(el).backgroundColor);
  const chosenState = await page.locator(".alternative:has(input:checked)").getAttribute("data-state");
  if (chosenState === "missed") assert.notEqual(await chosen.evaluate(el => getComputedStyle(el).backgroundColor), keyBg, "la alternativa errada se ve como acierto");
  assert.match(await page.locator(".set-tally").innerText(), /^En esta tanda: \d acierto/);
  assert.match((await railStates(page))[0], /^(correct|incorrect)$/);
  assert.equal(await page.evaluate(() => document.activeElement.className), "feedback-panel");
  assert.equal(await check(page).innerText(), "Siguiente pregunta");
  const revealed = await page.locator("#app").innerText();
  await context.setOffline(true); await page.reload();
  await feedback(page).waitFor();
  assert.equal(await page.locator("#app").innerText(), revealed);
  ok("feedback en el lugar, con foco; persiste tras recarga offline; doble clic no duplica");
  await page.getByRole("button", {name:"Volver al inicio", exact:false}).click();
  await page.getByRole("heading", {name:"Practica Biología"}).waitFor();
  assert.equal(await value(page, "progress-attempts"), "1");
  assert.equal(await page.locator(".start-options").isHidden(), true);
  await page.reload();
  await page.getByRole("button", {name:"Continuar · ver explicación pendiente"}).click();
  await feedback(page).waitFor();
  assert.equal(await page.locator("#app").innerText(), revealed);
  ok("inicio muestra progreso parcial; reanudar conserva explicación y no duplica tandas");
  await check(page).click();
  await radios(page).first().waitFor();
  assert.equal(await page.locator(".set-counter").innerText(), "2 de 3");
  await radios(page).first().check();
  await page.locator(".skip-button").click();
  assert.equal(await page.locator(".skip-button").innerText(), "Confirmar sin responder");
  assert.equal(await page.locator(".skip-note").isVisible(), true);
  await page.locator(".skip-button").click();
  await page.locator('.feedback-panel[data-kind="neutral"]').waitFor();
  assert.match(await feedback(page).innerText(), /Sin responder[\s\S]*No cuenta como error ni como acierto/);
  assert.equal((await railStates(page))[1], "omitted");
  ok("omisión con alternativa marcada pide confirmar; no cuenta como error");
  await check(page).click();
  await radios(page).last().waitFor();
  await radios(page).last().check();
  await check(page).click();
  await feedback(page).waitFor();
  assert.equal(await check(page).innerText(), "Terminar tanda");
  await check(page).click();
  await page.getByRole("heading", {name:"Tanda terminada"}).waitFor();
  assert.equal(new URL(page.url()).hash, "#fin");
  assert.match(await page.locator(".summary-line").innerText(), /^2 respondidas · \d acierto(s)? · 1 sin responder$/);
  assert.equal(await page.locator(".set-progress.is-large .rail-node").count(), 3);
  assert.equal(await value(page, "summary-attempts"), "2");
  assert.equal(await page.getByRole("button", {name:"Otra tanda igual"}).count(), 1);
  const summaryText = await page.locator("#app").innerText();
  for (const word of ["%", "nota", "nivel", "dominio", "puntaje", "ranking"]) assert.equal(summaryText.includes(word), false, `el resumen no dice “${word}”`);
  await page.reload();
  await page.getByRole("heading", {name:"Tanda terminada"}).waitFor();
  ok("resumen de tanda con conteos descriptivos, sin nota; sobrevive a la recarga");
  await page.getByRole("button", {name:"Volver al inicio"}).click();
  await start(page).waitFor();
  assert.match(await page.locator("#progress-sets").innerText(), /Última práctica: hoy · 1 tanda terminada/);
  assert.equal(await value(page, "progress-attempts"), "2");
  assert.equal(await value(page, "progress-units"), "2");
  ok("tanda completa offline actualiza el acumulado de la portada");
  await page.locator(".unit-details summary").click();
  const firstUnit = page.locator("button.unit-row").first();
  const unitName = await firstUnit.locator(".unit-name").innerText();
  await firstUnit.click();
  await radios(page).first().waitFor();
  assert.equal(await page.locator(".set-counter").innerText(), "1 de 1");
  assert.ok((await page.locator(".question-theme").innerText()).includes(unitName));
  await radios(page).first().check();
  await check(page).click();
  await feedback(page).waitFor();
  assert.equal(await check(page).innerText(), "Terminar tanda");
  await check(page).click();
  await page.getByRole("heading", {name:"Tanda terminada"}).waitFor();
  assert.equal(await page.getByRole("button", {name:"Otra tanda · todos los temas"}).count(), 1, "unidad de una pregunta agotada ofrece mezclar");
  await page.getByRole("button", {name:"Volver al inicio"}).click();
  await start(page).waitFor();
  await page.reload(); await start(page).waitFor();
  assert.equal(await start(page).innerText(), "Empezar · 3 preguntas", "recuerda la cantidad, no la unidad");
  const stored = await page.evaluate(async prefix => {
    const {PracticeStore} = await import(`${prefix}/src/infra/practice-store.mjs`);
    const store = await new PracticeStore("atlas-practice-demo-v1").open();
    const p = await store.read("ivb-2026-practica-ciencias:demo"); store.close(); return p;
  }, prefix);
  assert.equal(stored.sets.length,2); assert.equal(stored.sets.flatMap(s=>s.responses).length,4);
  assert.equal(stored.sets[0].responses.filter(r=>r.selected_option === null).length,1);
  assert.deepEqual(stored.acknowledged,[]); ok("varias tandas, tanda por unidad a un toque, progreso y omisiones conservados");
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  await page.screenshot({path:`${root}/output/playwright/practice-mobile-offline.png`,fullPage:true});
  await start(page).click();
  await radios(page).first().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  const bar = await page.locator(".action-bar").boundingBox();
  assert.ok(bar.y + bar.height <= 844 + 1, "la barra de acción queda a la vista sin desplazarse");
  await page.getByRole("button", {name:"Volver al inicio", exact:false}).click();
  await page.getByRole("button", {name:/^Continuar · pregunta 1 de 3/}).waitFor();
  ok("vista móvil sin desborde horizontal y con barra de acción visible (emulación, no teléfono físico)");
  await context.setOffline(false);
  const persistence = await page.evaluate(async prefix => {
    const {PracticeStore} = await import(`${prefix}/src/infra/practice-store.mjs`);
    const {LocalStore} = await import(`${prefix}/src/infra/storage.mjs`);
    const {newPracticeSet, answerPracticeSet} = await import(`${prefix}/src/engine/practice.mjs`);
    const a = await new PracticeStore("atlas-practice-demo-v1").open();
    const b = await new PracticeStore("atlas-practice-demo-v1").open();
    const item = {item_id:"SYNTHETIC",version:"1",clave:"A",unidad_id:"U",alternativas:[{id:"A"}]};
    await a.mutate("atomic", p => ({...p,sets:[newPracticeSet([item])]}));
    const results = await Promise.allSettled([a,b].map(s=>s.mutate("atomic",p=>({...p,sets:[answerPracticeSet(p.sets[0],"A")]}))));
    const atomic = await a.read("atomic"), other = await a.read("other-course:other-profile");
    const diag = await LocalStore.open(); const snapshot = await diag.getSnapshot("synthetic-diagnostic");
    diag.database.close(); a.close(); b.close();
    return {accepted:results.filter(r=>r.status==="fulfilled").length, responses:atomic.sets[0].responses.length, other:other.sets.length, sentinel:snapshot.bundle.sentinel};
  }, prefix);
  assert.deepEqual(persistence,{accepted:1,responses:1,other:0,sentinel:true});
  ok("IndexedDB transaccional entre conexiones; perfiles aislados; diagnóstico intacto");
  assert.deepEqual(external,[]); assert.deepEqual(errors,[]); ok("demostración no hace solicitudes externas ni produce errores JS");
  // Piloto visual en otra pestaña con la tanda pendiente ya creada: la termina y practica con diagramas.
  const visual=await context.newPage();visual.on("pageerror",e=>errors.push(e.message));
  await visual.setViewportSize({width:390,height:844});
  await visual.goto(`${base}/practice/?demo=1&visual=1`);
  await visual.getByRole("button",{name:/^Continuar · pregunta 1 de 3/}).waitFor();
  await visual.waitForFunction(()=>document.querySelector("#connection").textContent.includes("Funciona sin internet"));
  await context.setOffline(true);
  await visual.getByRole("button",{name:/^Continuar/}).click();
  for (let question = 0; question < 3; question++) {
    await radios(visual).first().waitFor();
    await radios(visual).first().check();
    await check(visual).click(); await feedback(visual).waitFor(); await check(visual).click();
  }
  await visual.getByRole("heading",{name:"Tanda terminada"}).waitFor();
  await visual.getByRole("button",{name:"Volver al inicio"}).click();
  await start(visual).waitFor();
  for(let round=0;round<2;round++){
    if (!(await visual.locator("#practice-figures").isChecked())) await visual.locator("#practice-figures").check();
    assert.equal(await start(visual).innerText(), "Empezar · 2 con diagrama");
    await start(visual).click();
    for(let question=0;question<2;question++){
      await radios(visual).first().waitFor();
      await visual.waitForFunction(()=>document.querySelector(".study-figure")?.naturalWidth===800);
      assert.equal(await visual.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(round===0){
        await visual.reload();await visual.waitForFunction(()=>document.querySelector(".study-figure")?.naturalWidth===800);
        await visual.screenshot({path:`${root}/output/playwright/figure-mobile-${question}.png`,fullPage:true});
      }
      await radios(visual).first().check();
      await check(visual).click();
      await feedback(visual).waitFor();
      assert.equal(await visual.locator(".study-figure").count(),1, "la figura sigue visible durante el feedback");
      await check(visual).click();
    }
    await visual.getByRole("heading",{name:"Tanda terminada"}).waitFor();
    // Primera vuelta: queda una variante con figura sin ver; segunda: las cuatro ya vistas → mezclar.
    await visual.getByRole("button",{name: round === 1 ? "Otra tanda · todos los temas" : /^Otra tanda/}).waitFor();
    await visual.getByRole("button",{name:"Volver al inicio"}).click();
    await start(visual).waitFor();
  }
  const ids=await visual.evaluate(async prefix=>{
    const {PracticeStore}=await import(`${prefix}/src/infra/practice-store.mjs`);const s=await new PracticeStore("atlas-practice-demo-v1").open();
    const p=await s.read("ivb-2026-practica-ciencias:demo");s.close();return p.sets.slice(3).flatMap(s=>s.responses.map(r=>r.item_id));
  },prefix);
  assert.equal(new Set(ids).size,4);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  ok("cuatro preguntas visuales únicas en dos tandas, SVG y feedback móviles offline");
  assert.match(await visual.locator("#progress-sets").innerText(), /5 tandas terminadas/);
  assert.equal(await value(visual, "progress-attempts"), "10");
  ok("piloto visual e inicio general comparten el progreso acumulado");
  await context.setOffline(false);
  // El service worker de diagnóstico existente no debe impedir el nuevo scope específico.
  const coexist = await browser.newContext(); const otherPage = await coexist.newPage();
  await otherPage.goto(`${base}/`);
  await otherPage.evaluate(async () => { await navigator.serviceWorker.register("./sw.js"); await navigator.serviceWorker.ready; });
  await otherPage.goto(`${base}/practice/?demo=1`);
  await start(otherPage).waitFor();
  await otherPage.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.includes("/practice/sw.js"));
  await coexist.setOffline(true); await otherPage.reload();
  await start(otherPage).waitFor();
  ok("coexisten ambos service workers y práctica abre offline bajo subruta");
  // Importa el piloto histórico sin borrar el origen ni abrir la base real.
  await otherPage.evaluate(async prefix => {
    const {PracticeStore} = await import(`${prefix}/src/infra/practice-store.mjs`);
    const {newPracticeSet, answerPracticeSet} = await import(`${prefix}/src/engine/practice.mjs`);
    const bank = await (await fetch(`${prefix}/data/paes-ciencias-2027/bank-visual-division.v0.json`)).json();
    const store = await new PracticeStore("atlas-practice-demo-v1").open();
    const set = answerPracticeSet(newPracticeSet([bank.items[0]]), bank.items[0].clave);
    await store.mutate("ivb-2026-practica-ciencias:demo:visual", p => ({...p, sets: [set]}));
    store.close();
  }, prefix);
  await otherPage.reload();
  await otherPage.getByRole("button", {name:"Continuar · ver explicación pendiente"}).waitFor();
  assert.equal(await value(otherPage, "progress-attempts"), "1");
  await otherPage.getByRole("button", {name:"Continuar · ver explicación pendiente"}).click();
  await feedback(otherPage).waitFor();
  assert.equal(await check(otherPage).innerText(), "Terminar tanda");
  await check(otherPage).click();
  await otherPage.getByRole("heading",{name:"Tanda terminada"}).waitFor();
  await otherPage.getByRole("button",{name:"Volver al inicio"}).click();
  await start(otherPage).waitFor();
  await otherPage.reload();
  await start(otherPage).waitFor();
  assert.match(await otherPage.locator("#progress-sets").innerText(), /1 tanda terminada/);
  assert.equal(await value(otherPage, "progress-attempts"), "1");
  const migration = await otherPage.evaluate(async prefix => {
    const {PracticeStore} = await import(`${prefix}/src/infra/practice-store.mjs`);
    const store = await new PracticeStore("atlas-practice-demo-v1").open();
    const target = await store.read("ivb-2026-practica-ciencias:demo"), source = await store.read("ivb-2026-practica-ciencias:demo:visual");
    store.close(); return {count: target.sets.length, state: target.sets[0].state, oldState: source.sets[0].state};
  }, prefix);
  assert.deepEqual(migration, {count: 1, state: "completed", oldState: "feedback"});
  ok("piloto antiguo se copia offline una sola vez, conserva origen y no revierte avances");
  await coexist.close(); await context.close();

  // Entrada real con todos los gates cerrados: se practica como invitado y el código es opcional.
  // El backend declarado no existe a propósito: si el cuaderno de invitado lo contactara, la
  // prueba lo delataría como petición fuera del sitio.
  const manifiesto = JSON.parse(await readFile(new URL("../../data/practice.json", import.meta.url), "utf8"));
  overrides.set("/data/practice.json", JSON.stringify({ ...manifiesto, pilot_ready: true,
    gates: Object.fromEntries(Object.keys(manifiesto.gates).map(gate => [gate, true])),
    backend: { enabled: true, url: "https://sintetico-no-existe.supabase.co/", publishable_key: "clave-sintetica-solo-para-pruebas", schema: "api" } }));
  for (const ruta of ["paes-ciencias-2027/bank-practica-biologia.v0.json", "paes-ciencias-2027/bank-visual-division.v0.json"]) {
    const banco = JSON.parse(await readFile(new URL(`../../data/${ruta}`, import.meta.url), "utf8"));
    banco.estado_autoria = "contenido_docente_revisado";
    for (const item of banco.items) {
      item.estado_revision = "revisado_docente";
      if (item.estimulo?.tipo === "figura") item.estimulo.estado_revision = "revisado_docente";
    }
    overrides.set(`/data/${ruta}`, JSON.stringify(banco));
  }
  const real = await browser.newContext({viewport: {width: 390, height: 844}});
  const invitado = await real.newPage(), fueraDelSitio = [];
  invitado.on("pageerror", e => errors.push(e.message));
  real.on("request", req => { if (!req.url().startsWith(origin)) fueraDelSitio.push(req.url()); });
  await invitado.goto(`${base}/practice/`);
  await start(invitado).waitFor();
  assert.equal(await invitado.getByRole("heading", {name:"Práctica aún no habilitada"}).count(), 0);
  assert.equal(await invitado.locator("#code").count(), 0);
  assert.equal(await invitado.locator("#preview").isHidden(), true);
  ok("con los gates cerrados se entra practicando, sin pedir código ni mostrar el aviso de revisión");
  await start(invitado).click();
  await radios(invitado).first().waitFor();
  await radios(invitado).first().check();
  await check(invitado).click();
  await feedback(invitado).waitFor();
  await invitado.getByRole("button", {name:"Volver al inicio", exact:false}).click();
  await invitado.getByRole("heading", {name:"Practica Biología"}).waitFor();
  assert.equal(await value(invitado, "progress-attempts"), "1");
  const guardar = invitado.getByRole("button", {name:"Guardar mi avance en otro teléfono"});
  assert.equal(await guardar.count(), 1);
  assert.equal(await invitado.getByRole("button", {name:"Actualizar respaldo"}).count(), 0);
  await guardar.click();
  await invitado.getByRole("heading", {name:"Guarda tu avance"}).waitFor();
  await invitado.getByRole("button", {name:"Ahora no"}).click();
  await invitado.getByRole("heading", {name:"Practica Biología"}).waitFor();
  assert.equal(await value(invitado, "progress-attempts"), "1");
  ok("el código es una acción opcional de la portada y posponerlo no pierde avance");
  const cuaderno = await invitado.evaluate(async prefix => {
    const {PracticeStore} = await import(`${prefix}/src/infra/practice-store.mjs`);
    const store = await new PracticeStore("atlas-practice-v1").open();
    const p = await store.read("ivb-2026-practica-ciencias:invitado"); store.close();
    return {sets: p.sets.length, remote: p.remote.length, acknowledged: p.acknowledged.length};
  }, prefix);
  assert.deepEqual(cuaderno, {sets: 1, remote: 0, acknowledged: 0});
  assert.deepEqual(fueraDelSitio, [], "el cuaderno de invitado no contacta al backend");
  assert.deepEqual(errors, []);
  ok("el invitado guarda en su propio cuaderno local y nunca llama al backend");

  // Asociar el código sin red: exige que el cuaderno ya estuviera confirmado en este aparato.
  const codigo = await invitado.evaluate(async prefix => {
    const {createCode} = await import(`${prefix}/src/engine/enrollment-code.mjs`);
    return createCode("23456789", {alfabeto: "23456789ABCDEFGHJKMNPQRSTUVWXYZ", longitud_carga: 8, multiplicador: 7, grupos: [3, 3, 3]});
  }, prefix);
  const codedKey = await invitado.evaluate(async code => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.replaceAll("-", "")));
    return `ivb-2026-practica-ciencias:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
  }, codigo);
  await invitado.evaluate(async ([prefix, clave]) => {
    const {PracticeStore} = await import(`${prefix}/src/infra/practice-store.mjs`);
    const store = await new PracticeStore("atlas-practice-v1").open();
    await store.mutate(clave, p => ({ ...p, confirmed: true }));
    store.close();
  }, [prefix, codedKey]);
  await real.setOffline(true);
  await invitado.getByRole("button", {name:"Guardar mi avance en otro teléfono"}).click();
  await invitado.locator("#code").fill("no-es-un-codigo");
  await invitado.getByRole("button", {name:"Guardar mi avance"}).click();
  await invitado.locator(".field-error").waitFor();
  assert.match(await invitado.locator(".field-error").innerText(), /código/i);
  ok("un código mal escrito se rechaza en el teléfono, sin crear identidad en el servidor");
  await invitado.locator("#code").fill(codigo);
  await invitado.getByRole("button", {name:"Guardar mi avance"}).click();
  await invitado.getByRole("button", {name:"Cerrar cuaderno"}).waitFor();
  const traspaso = await invitado.evaluate(async ([prefix, clave]) => {
    const {PracticeStore} = await import(`${prefix}/src/infra/practice-store.mjs`);
    const store = await new PracticeStore("atlas-practice-v1").open();
    const propio = await store.read(clave), invitado = await store.read("ivb-2026-practica-ciencias:invitado");
    store.close();
    return {propio: propio.sets.length, invitado: invitado.sets.length, recordado: localStorage.getItem("atlas-practice:cuaderno")};
  }, [prefix, codedKey]);
  // El cuaderno de invitado queda vacío: si no, la práctica de una persona acabaría atribuida a
  // la siguiente que asocie su código en el mismo teléfono compartido.
  assert.deepEqual(traspaso, {propio: 1, invitado: 0, recordado: codedKey});
  ok("asociar el código traspasa la práctica y vacía el cuaderno de invitado");
  await invitado.reload();
  await invitado.getByRole("heading", {name:"Practica Biología"}).waitFor();
  assert.equal(await invitado.getByRole("button", {name:"Cerrar cuaderno"}).count(), 1);
  assert.equal(await invitado.getByRole("button", {name:"Guardar mi avance en otro teléfono"}).count(), 0);
  assert.equal(await value(invitado, "progress-attempts"), "1", "el avance respaldado sigue a la vista");
  ok("el cuaderno asociado se reabre tras recargar, sin volver a pedir el código");
  await invitado.getByRole("button", {name:"Cerrar cuaderno"}).click();
  await start(invitado).waitFor();
  assert.equal(await invitado.getByRole("button", {name:"Guardar mi avance en otro teléfono"}).count(), 1);
  assert.equal(await invitado.evaluate(() => localStorage.getItem("atlas-practice:cuaderno")), null);
  ok("cerrar el cuaderno vuelve al de invitado y olvida la asociación");
  assert.deepEqual(fueraDelSitio, [], "nada de esto contactó al backend");
  assert.deepEqual(errors, []);
  await real.close();
  console.log(`Navegador local OK — ${checks} escenarios; Chromium ${browser.version()}.`);
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
