import { element, clear, focusHeading } from "../src/ui/dom.mjs";
import { renderLanding } from "./landing.mjs";
import { renderQuestion } from "./question.mjs";
import { renderSummary } from "./summary.mjs";
import { announce } from "./motion.mjs";
import { combinePracticeBanks, mergeDemoProfiles, mergeProfiles, practiceOverview } from "../src/engine/practice-library.mjs";
import { assertPracticeBundle, practiceReadiness, newPracticeSet, answerPracticeSet, continuePracticeSet, accumulatedProgress } from "../src/engine/practice.mjs";
import { selectPracticeItems, eligiblePracticeItems } from "../src/engine/practice-selector.mjs";
import { setSummary, unitProgressRows, setUnitRows, latestCompletedSet, resolvePracticeOptions, hasFreshItems, todayInSantiago, progressTotals } from "../src/engine/practice-summary.mjs";
import { validateCodeShape } from "../src/engine/enrollment-code.mjs";
import { PracticeStore } from "../src/infra/practice-store.mjs";
import { SupabaseHttp } from "../src/infra/supabase-http.mjs";
import { syncPractice } from "../src/infra/practice-sync.mjs";

const root = document.querySelector("#app"), message = document.querySelector("#message");
const preview = new URL(location.href).searchParams.get("demo") === "1";
const OPTIONS_KEY = "atlas-practice:options", SNAPSHOT_KEY = "atlas-practice:overview", LAST_KEY = "atlas-practice:last-set", NOTEBOOK_KEY = "atlas-practice:cuaderno";
let bundle, store, key, client, busy = false, offlineReady = false;
let view = viewFromHash();

function viewFromHash() { return location.hash === "#tanda" ? "practice" : location.hash === "#fin" ? "summary" : "home"; }
function setView(next) {
  view = next;
  const url = new URL(location.href); url.hash = next === "practice" ? "tanda" : next === "summary" ? "fin" : "";
  history.replaceState(null, "", url);
}
function connection() {
  const state = navigator.onLine ? (offlineReady ? "online-ready" : "online-pending") : (offlineReady ? "offline-ready" : "offline-pending");
  const text = { "online-ready": "Funciona sin internet", "online-pending": "Preparando uso sin internet…", "offline-ready": "Sin internet · todo listo", "offline-pending": "Sin internet · abre con internet una vez" }[state];
  const pill = document.querySelector("#connection");
  pill.dataset.state = state;
  pill.querySelector(".connection-text").textContent = text;
}
function measureHeader() { root.style.setProperty("--header-h", `${document.querySelector(".site-header").offsetHeight}px`); }
function show(node) { clear(root); root.append(node); root.setAttribute("aria-busy", "false"); measureHeader(); focusHeading(root); }
async function run(action) {
  if (busy) return;
  busy = true; message.textContent = "";
  try { await action(); }
  catch (error) {
    message.textContent = `No se pudo guardar este paso (${error.message}). Tu avance anterior sigue en este dispositivo.`;
    try { await dashboard(); } catch { /* la vista se reconstruye en la próxima acción */ }
  }
  finally { busy = false; }
}
// Sin código no hay a quién atribuir el avance: el cuaderno de invitado nunca sale del teléfono.
async function sync() {
  await syncPractice({ store, key, scope: bundle.config.scope_id, client, enabled: Boolean(client) && !preview && bundle.config.backend.enabled, online: navigator.onLine });
}
const guestKey = () => `${bundle.config.scope_id}:invitado`;

// Preferencias de tanda: conveniencia de interfaz, nunca evidencia de práctica. Fuera del perfil.
// Se recuerdan cantidad y "solo diagramas"; la unidad se elige por toque en su fila, no se recuerda.
function readOptions(rows) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "null"); } catch { raw = null; }
  return resolvePracticeOptions(rows, { ...raw, unitIds: [] }, { defaultCount: bundle.config.default_count });
}
function writeOptions(options) {
  try { localStorage.setItem(OPTIONS_KEY, JSON.stringify({ count: options.count, figuresOnly: options.figuresOnly })); } catch { /* modo privado */ }
}
// Opciones de la última tanda iniciada en esta sesión, para "Otra tanda igual".
function saveLast(options) {
  try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ count: options.count, unitIds: options.unitIds, figuresOnly: options.figuresOnly })); } catch { /* sin memoria de sesión */ }
}
function readLast(rows) {
  try { const raw = JSON.parse(sessionStorage.getItem(LAST_KEY) ?? "null"); return raw ? resolvePracticeOptions(rows, raw, { defaultCount: bundle.config.default_count }) : null; } catch { return null; }
}
// Qué cuaderno quedó abierto en este teléfono. Sin esto, cada recarga devolvía al de invitado y el
// avance ya respaldado desaparecía de la pantalla pese a seguir en el servidor.
function rememberNotebook(codedKey) {
  try { localStorage.setItem(NOTEBOOK_KEY, codedKey); } catch { /* modo privado */ }
}
function forgetNotebook() {
  try { localStorage.removeItem(NOTEBOOK_KEY); } catch { /* modo privado */ }
}
function readNotebook() {
  try { const value = localStorage.getItem(NOTEBOOK_KEY); return value?.startsWith(`${bundle.config.scope_id}:`) ? value : null; } catch { return null; }
}
const totalsFor = profile => progressTotals(unitProgressRows(bundle, profile));
// Instantánea del acumulado al empezar una tanda: alimenta el count-up de la siguiente vista.
function saveSnapshot(profile) {
  try { sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(totalsFor(profile))); } catch { /* sin animación */ }
}
function takeSnapshot() {
  try { const raw = sessionStorage.getItem(SNAPSHOT_KEY); sessionStorage.removeItem(SNAPSHOT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function figureCount(options = {}) {
  return new Set(eligiblePracticeItems(bundle, { preview, unitIds: options.unitIds ?? [], figuresOnly: true }).map(i => i.estimulo.figura_id)).size;
}
function themeFor(rows, item) {
  const row = rows.find(r => r.unidad_id === item.unidad_id);
  return row ? `${row.area_etiqueta} › ${row.etiqueta}` : item.eje;
}

async function start(options) {
  const request = { ...options, count: options.figuresOnly ? Math.max(1, figureCount(options)) : options.count };
  await store.mutate(key, p => {
    if (p.sets.some(s => s.state !== "completed")) throw new Error("ya hay una tanda pendiente; continúa desde el inicio");
    const progress = Object.fromEntries(accumulatedProgress(p).map(r => [r.unidad_id, r]));
    const ids = selectPracticeItems(bundle, progress, { ...request, preview, recentItemIds: p.sets.flatMap(s => s.responses.map(r => r.item_id)) });
    if (!ids.length) throw new Error("no hay preguntas disponibles con esas opciones");
    saveSnapshot(p);
    return { ...p, sets: [...p.sets, newPracticeSet(ids.map(id => bundle.bank.items.find(i => i.item_id === id)))] };
  });
  saveLast(options);
  setView("practice"); await dashboard();
}

async function dashboard() {
  const profile = await store.read(key);
  const rows = unitProgressRows(bundle, profile);
  const active = profile.sets.find(s => s.state !== "completed");
  root.classList.toggle("is-home", view === "home" || (!active && view === "practice"));
  if (active && view === "practice") return play(active, rows);
  if (!active && view === "summary") {
    const last = latestCompletedSet(profile);
    if (last) return summary(profile, last, rows);
  }
  setView("home");
  root.classList.add("is-home");
  show(renderLanding({ bundle, profile, preview, coded: Boolean(client), rows, options: readOptions(rows), figureCount: figureCount(), today: todayInSantiago(), before: takeSnapshot(),
    onStart: options => run(() => start(options)),
    onResume: () => run(async () => { setView("practice"); await dashboard(); }),
    onOptions: writeOptions,
    onSync: () => run(async () => { await sync(); await dashboard(); }),
    onConnect: () => run(async () => { askForCode(); }),
    onClose: () => { client?.clearSession(); forgetNotebook(); location.reload(); },
  }));
}

async function mutateSet(set, transform) {
  const profile = await store.mutate(key, p => ({ ...p, sets: p.sets.map(s => {
    if (s.id !== set.id) return s;
    if (s.cursor !== set.cursor || s.state !== set.state) throw new Error("la tanda cambió en otra pestaña; vuelve a cargar");
    return transform(s);
  }) }));
  return profile.sets.find(s => s.id === set.id);
}

function play(set, rows) {
  let current = set;
  const item = set.items[set.cursor];
  const question = renderQuestion({
    item, summary: setSummary(set), theme: themeFor(rows, item),
    response: set.state === "feedback" ? set.responses.at(-1) : null,
    onCheck: option => run(async () => { current = await check(current, option, question); }),
    onSkip: () => run(async () => { current = await check(current, null, question); }),
    onNext: () => run(() => next(current)),
    onHome: () => run(async () => { setView("home"); await dashboard(); }),
  });
  show(question.node);
}

// Comprobar: se registra la respuesta y la misma pantalla se completa en el lugar. Sin re-render.
async function check(set, option, question) {
  const updated = await mutateSet(set, s => answerPracticeSet(s, option));
  const summary = setSummary(updated);
  const result = question.reveal(updated.responses.at(-1), summary);
  const verdict = result.omitted ? "Sin responder" : result.correct ? "Correcta" : "No es la clave";
  announce(`${verdict}. Pregunta ${set.cursor + 1} de ${set.items.length}.`);
  return updated;
}

async function next(set) {
  const updated = await mutateSet(set, continuePracticeSet);
  if (updated.state === "completed") {
    setView("summary");
    try { await sync(); } catch { message.textContent = "Respaldo pendiente. Tu tanda sigue guardada en este dispositivo."; }
  }
  await dashboard();
}

function summary(profile, set, rows) {
  const after = totalsFor(profile);
  const before = takeSnapshot() ?? totalsFor({ ...profile, sets: profile.sets.filter(s => s.id !== set.id) });
  const options = readLast(rows) ?? readOptions(rows);
  const fresh = hasFreshItems(bundle, profile, { ...options, preview });
  const scoped = options.unitIds.length > 0 || options.figuresOnly;
  const repeatOptions = fresh || !scoped ? options : { ...options, unitIds: [], figuresOnly: false, ensureFigure: true };
  const repeatLabel = fresh || !scoped ? "Otra tanda igual" : "Otra tanda · todos los temas";
  const repeatNote = !fresh && !scoped ? "Las preguntas pueden repetirse: el banco todavía es pequeño." : "";
  show(renderSummary({
    summary: setSummary(set), unitRows: setUnitRows(set, rows), before, after, totalUnits: rows.length, repeatLabel, repeatNote,
    onRepeat: () => run(() => start(repeatOptions)),
    onHome: () => run(async () => { setView("home"); await dashboard(); }),
  }));
}

function askForCode() {
  const input = element("input", { id: "code", className: "code-input", type: "text", inputMode: "text", autocomplete: "off", autocapitalize: "characters", spellcheck: false, maxlength: 14 });
  const error = element("p", { className: "field-error", role: "alert" });
  const submit = element("button", { type: "button", className: "primary-button", text: "Guardar mi avance", onclick: () => run(async () => {
    error.textContent = "";
    submit.disabled = true;
    try { await connect(input.value); }
    catch (failure) { error.textContent = `No se pudo guardar: ${failure.message}.`; submit.disabled = false; input.focus(); }
  }) });
  show(element("section", { className: "screen-card" }, [
    element("p", { className: "eyebrow", text: "Tu código" }),
    element("h1", { text: "Guarda tu avance" }),
    element("p", { className: "lede", text: "Con el código de tu tarjeta verás lo que practiques también en otro teléfono. Se guardará además lo que ya practicaste aquí." }),
    element("label", { className: "code-label", htmlFor: "code", text: "Código de tu tarjeta" }),
    input,
    element("p", { className: "field-help", text: "No distingue mayúsculas y puedes escribirlo con o sin guiones." }),
    error,
    element("div", { className: "button-row" }, [submit, element("button", { type: "button", className: "quiet-button", text: "Ahora no", onclick: () => run(dashboard) })]),
  ]));
  input.focus();
}

// Al asociar el código, el cuaderno de invitado se incorpora al del estudiante y desde ahí
// sincroniza. El de invitado no se borra: si algo falla, sus tandas siguen en este teléfono.
async function notebookKeyFor(code) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return `${bundle.config.scope_id}:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")}`;
}
const clientFor = codedKey => new SupabaseHttp({ ...bundle.config.backend, auth_storage_prefix: `practice-auth:${codedKey}` });

async function connect(raw) {
  // Forma y dígito verificador se comprueban aquí: llamar al backend con un código mal escrito
  // creaba una cuenta anónima permanente, y un estudiante sin código válido no debe generar
  // ningún dato en el servidor (ADR-0008 rev. 0.4).
  const shape = validateCodeShape(raw, bundle.config.enrollment);
  if (!shape.ok) throw new Error(shape.reason.replace(/\.$/, "").toLowerCase());
  const codedKey = await notebookKeyFor(shape.normalized);
  const candidate = clientFor(codedKey);
  const stored = await store.read(codedKey);
  if (navigator.onLine) {
    let receipt;
    try { receipt = await candidate.rpc("enroll_practice_v1", { p_scope: bundle.config.scope_id, p_code: shape.normalized }); }
    catch (error) { throw /not_authorized/.test(error.message) ? new Error("ese código no está en la lista del curso", { cause: error }) : error; }
    if (receipt?.status !== "enrolled") throw new Error("ese código no está autorizado");
  } else if (!stored.confirmed) throw new Error("la primera vez necesitas conexión");
  const guest = await store.read(guestKey());
  const merged = await store.mutate(codedKey, p => ({ ...mergeProfiles(p, guest), confirmed: true }));
  // Ya viven en el cuaderno del estudiante. Se retiran del de invitado para que no se atribuyan
  // después a otra persona que use este mismo teléfono y acabe enviándolas bajo su seudónimo.
  const absorbed = new Set(merged.sets.map(set => set.id));
  await store.mutate(guestKey(), p => ({ ...p, sets: p.sets.filter(set => !absorbed.has(set.id)) }));
  client = candidate;
  key = codedKey;
  rememberNotebook(codedKey);
  setView("home");
  try { await sync(); } catch (error) { message.textContent = `Tu avance quedó guardado en este teléfono; el respaldo se reintentará solo (${error.message}).`; }
  await dashboard();
}

async function loadJSON(url) { const response = await fetch(url); if (!response.ok) throw new Error(`Recurso no disponible (${response.status})`); return response.json(); }
async function init() {
  const configURL = new URL("../data/practice.json", import.meta.url);
  const config = await loadJSON(configURL);
  const [framework, banks] = await Promise.all([loadJSON(new URL(config.framework_url, configURL)), Promise.all([config.bank_url, config.visual_bank_url].filter(Boolean).map(path => loadJSON(new URL(path, configURL))))]);
  bundle = assertPracticeBundle({ config, framework, bank: combinePracticeBanks(banks) });
  if (!preview && !practiceReadiness(bundle).ready) {
    show(element("section", { className: "screen-card" }, [element("h1", { text: "Práctica aún no habilitada" }), element("p", { text: "Faltan revisión docente, decisiones de privacidad y validación operativa. El diagnóstico sigue siendo el paquete activo." }), element("a", { className: "primary-button", href: "?demo=1", text: "Revisar demostración local" })]));
    return;
  }
  store = await new PracticeStore(preview ? "atlas-practice-demo-v1" : "atlas-practice-v1").open();
  if (preview) {
    key = `${config.scope_id}:demo`;
    const legacy = await store.read(`${key}:visual`);
    await store.mutate(key, p => mergeDemoProfiles(p, legacy));
    await dashboard();
  } else {
    document.querySelector("#preview").hidden = true;
    // Se entra practicando. El código es una decisión posterior del estudiante, no un portón:
    // así una pausa del proyecto o una caída de red no impiden responder preguntas. Si ya había un
    // cuaderno asociado en este teléfono se reabre sin red: la sesión anónima vive bajo su clave.
    const remembered = readNotebook();
    const reopened = remembered && (await store.read(remembered)).confirmed;
    if (reopened) { key = remembered; client = clientFor(remembered); } else { key = guestKey(); if (remembered) forgetNotebook(); }
    await dashboard();
  }
  if ("serviceWorker" in navigator) {
    try {
      const script = new URL("./sw.js", import.meta.url);
      const registration = await navigator.serviceWorker.register(script);
      const deadline = Date.now() + 12000;
      // ready global puede corresponder todavía al worker del diagnóstico. Confirmar este scope.
      while (!registration.active || navigator.serviceWorker.controller?.scriptURL !== script.href) {
        if (Date.now() > deadline) throw new Error("Activación offline pendiente");
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      offlineReady = true; connection();
    } catch { connection(); }
  }
}
// Respaldar no debe repintar una pregunta en curso: eso borraría la alternativa marcada.
addEventListener("online", () => { connection(); if (key && !busy) run(async () => { await sync(); if (view !== "practice") await dashboard(); }); });
addEventListener("offline", connection);
addEventListener("resize", measureHeader);
// El salto de teclado mueve el foco; #app no debe reemplazar la ruta #tanda.
document.querySelector(".skip-link").addEventListener("click", event => { event.preventDefault(); root.focus(); });
document.querySelector(".wordmark").addEventListener("click", event => {
  if (!key) return;
  event.preventDefault(); run(async () => { setView("home"); await dashboard(); });
});
addEventListener("hashchange", () => { if (key) run(async () => { view = viewFromHash(); await dashboard(); }); });
connection();
init().catch(error => { root.setAttribute("aria-busy", "false"); root.textContent = `No se pudo abrir la práctica: ${error.message}`; });
