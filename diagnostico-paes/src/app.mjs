import { assertBundle } from "./engine/contracts.mjs";
import { loadBundle, orderedItems } from "./engine/loader.mjs";
import { buildEvidenceMap } from "./engine/evidence-map.mjs";
import { newAttempt, beginAttempt, createRawResponse, advanceAttempt, assertAttemptComplete } from "./engine/session-machine.mjs";
import { encodeBackup } from "./engine/backup-code.mjs";
import { LocalStore, snapshotFromBundle } from "./infra/storage.mjs";
import { ensureQueued, syncOutbox } from "./infra/sync.mjs";
import { registerServiceWorker } from "./infra/sw-client.mjs";
import { SupabaseHttp } from "./infra/supabase-http.mjs";
import { authorizeEnrollment } from "./infra/enrollment.mjs";
import { drawQr } from "./infra/qr.mjs";
import { assessReleaseReadiness } from "./engine/release-readiness.mjs";
import { buildDemoBundle, DEMO_DATABASE_NAME } from "./engine/demo-isolation.mjs";
import { renderWelcome, renderEnrollment, renderInstructions, renderItem, renderMap, renderClosed, renderFatal } from "./ui/screens.mjs";

const root = document.querySelector("#app");
const demoMode = new URLSearchParams(location.search).get("demo") === "1";
const textSizes = ["normal", "large", "xlarge"];

let bundle;
let store;
let attempt;
let responses = [];
let profile;
let offlineReady = false;
let itemTimer = null;
let syncState = { state: "checking", pending: 0 };
let releaseReady = false;

function setBranding() {
  document.title = bundle.deployment.ui.titulo;
  document.querySelector('[data-ui="brand"]').textContent = bundle.deployment.ui.marca;
  document.querySelector('[data-ui="version"]').textContent = `v${bundle.deployment.version}`;
}

function updateConnection() {
  const node = document.querySelector('[data-ui="connection"]');
  const online = navigator.onLine;
  const label = online ? "Red disponible" : "Sin red";
  node.dataset.state = online ? "online" : "offline";
  node.setAttribute("aria-label", label);
  node.title = online ? "Hay red disponible; el respaldo en nube se confirma por separado." : "El dispositivo no tiene red disponible.";
  node.querySelector("span:last-child").textContent = label;
}

function setupTextSize() {
  const button = document.querySelector('[data-action="text-size"]');
  const status = document.querySelector('[data-ui="text-size-status"]');
  const labels = { normal: "normal", large: "grande", xlarge: "muy grande" };
  const updateLabel = (size, announce = false) => {
    button.setAttribute("aria-label", `Tamaño de texto actual: ${labels[size]}. Activar para cambiarlo.`);
    button.title = `Tamaño de texto: ${labels[size]}`;
    if (announce) status.textContent = `Tamaño de texto ${labels[size]}.`;
  };
  const stored = localStorage.getItem("diagnostic-text-size") ?? "normal";
  document.documentElement.dataset.textSize = textSizes.includes(stored) ? stored : "normal";
  updateLabel(document.documentElement.dataset.textSize);
  button.addEventListener("click", () => {
    const current = document.documentElement.dataset.textSize;
    const next = textSizes[(textSizes.indexOf(current) + 1) % textSizes.length];
    document.documentElement.dataset.textSize = next;
    localStorage.setItem("diagnostic-text-size", next);
    updateLabel(next, true);
  });
}

function snapshotTimer() {
  if (!itemTimer || !itemTimer.visibleSince) return;
  itemTimer.elapsed += performance.now() - itemTimer.visibleSince;
  itemTimer.visibleSince = null;
}

function resumeTimer() {
  if (itemTimer && !itemTimer.visibleSince && !document.hidden) itemTimer.visibleSince = performance.now();
}

function startTimer() {
  itemTimer = { elapsed: 0, visibleSince: document.hidden ? null : performance.now() };
}

function elapsedTime() {
  snapshotTimer();
  return itemTimer?.elapsed ?? 0;
}

async function restoreSnapshotIfNeeded(activeAttempt) {
  const snapshot = await store.getSnapshot(activeAttempt.attempt_id);
  if (!snapshot?.bundle) throw new Error("No existe la copia local inmutable de esta sesión");
  return assertBundle(snapshot.bundle);
}

async function showWelcome() {
  renderWelcome(root, bundle, {
    demo: demoMode,
    releaseReady,
    hasProfile: Boolean(profile),
    offlineReady,
    onStart: async () => {
      if (!profile) return renderEnrollment(root, bundle, { demo: demoMode, onSubmit: enroll });
      const validation = await refreshProvisionalProfile(profile);
      if (!validation.ok) {
        await store.deleteProfile(bundle.deployment.deployment_id);
        profile = null;
        return renderEnrollment(root, bundle, { demo: demoMode, onSubmit: enroll, initialError: validation.reason });
      }
      await createAttempt(profile);
    },
  });
}

async function refreshProvisionalProfile(enrollmentProfile) {
  if (enrollmentProfile.enrollment_status === "confirmed") return { ok: true };
  const validation = await authorizeEnrollment(enrollmentProfile.enrollment_code, bundle, { demo: demoMode });
  if (!validation.ok) return validation;
  profile = {
    ...enrollmentProfile,
    enrollment_status: validation.enrollment_status,
    enrollment_checked_at: validation.checked_at,
    provisional_reason: validation.provisional_reason ?? null,
  };
  await store.putProfile(profile);
  return validation;
}

async function enroll(rawCode) {
  const validation = await authorizeEnrollment(rawCode, bundle, { demo: demoMode });
  if (!validation.ok) return validation;
  profile = {
    deployment_id: bundle.deployment.deployment_id,
    enrollment_code: validation.formatted,
    enrollment_status: validation.enrollment_status,
    enrollment_checked_at: validation.checked_at,
    provisional_reason: validation.provisional_reason ?? null,
    demo: demoMode,
    enrolled_at: new Date().toISOString(),
  };
  await store.putProfile(profile);
  navigator.storage?.persist?.().catch(() => false);
  await createAttempt(profile);
  return validation;
}

async function createAttempt(enrollmentProfile) {
  attempt = newAttempt(bundle, enrollmentProfile.enrollment_code, {
    enrollmentStatus: enrollmentProfile.enrollment_status ?? "provisional",
  });
  await store.createAttempt(attempt, snapshotFromBundle(bundle));
  responses = [];
  renderInstructions(root, bundle, startAttempt, { enrollmentStatus: attempt.enrollment_status });
}

async function startAttempt() {
  if (attempt.enrollment_status === "provisional") {
    const validation = await refreshProvisionalProfile(profile ?? {
      deployment_id: bundle.deployment.deployment_id,
      enrollment_code: attempt.enrollment_code,
      enrollment_status: attempt.enrollment_status,
      demo: demoMode,
    });
    if (!validation.ok) {
      await store.discardInstructionAttempt({
        attemptId: attempt.attempt_id,
        deploymentId: bundle.deployment.deployment_id,
      });
      attempt = null;
      responses = [];
      profile = null;
      renderEnrollment(root, bundle, { demo: demoMode, onSubmit: enroll, initialError: validation.reason });
      return;
    }
    attempt = { ...attempt, enrollment_status: profile.enrollment_status };
  }
  attempt = beginAttempt(attempt);
  await store.putAttempt(attempt);
  showCurrentItem();
}

function showCurrentItem() {
  const items = orderedItems(bundle);
  const item = items[attempt.position];
  if (!item) throw new Error("La sesión perdió la referencia al ítem actual");
  startTimer();
  renderItem(root, item, {
    position: attempt.position,
    total: items.length,
    onAnswer: async (selectedOption) => {
      const raw = createRawResponse(attempt, item, attempt.position + 1, selectedOption, elapsedTime());
      const nextAttempt = advanceAttempt(attempt, items.length);
      await store.recordResponseAndAdvance(raw, nextAttempt);
      responses.push(raw);
      attempt = nextAttempt;
      itemTimer = null;
      if (attempt.status === "completed") {
        assertAttemptComplete(attempt, responses, items.length);
        await ensureQueued(store, attempt, responses);
        await showMap();
      } else {
        showCurrentItem();
      }
    },
  });
}

function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyBackup(code) {
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = code;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

async function runSync({ rerender = true } = {}) {
  syncState = await syncOutbox(store, bundle.deployment.backend, {
    onChange: (state) => { syncState = state; },
    attemptId: attempt.attempt_id,
    administrationId: attempt.administration_id,
  });
  if (["synced", "orphaned"].includes(syncState.state)) {
    attempt = await store.getAttemptByAdministration(attempt.administration_id);
  }
  if (rerender && ["completed", "synced"].includes(attempt.status)) await showMap({ sync: false });
  return syncState;
}

async function purgeLocalCopy() {
  if (syncState.state !== "synced" || !bundle.deployment.backend.enabled) return;
  const confirmed = window.confirm("Se borrarán de este teléfono el código, las respuestas y el mapa. La entrega ya recibida en la nube no se borrará. ¿Continuar?");
  if (!confirmed) return;
  try {
    new SupabaseHttp(bundle.deployment.backend).clearSession();
    await store.purgeSyncedAttempt({
      attemptId: attempt.attempt_id,
      administrationId: attempt.administration_id,
      deploymentId: bundle.deployment.deployment_id,
      completedAt: attempt.completed_at,
    });
  } catch (error) {
    window.alert(`No se borró la copia local: ${error.message}. Inténtalo de nuevo o avisa al adulto a cargo.`);
    return;
  }
  attempt = null;
  responses = [];
  profile = null;
  renderClosed(root, bundle);
}

async function showMap({ sync = true } = {}) {
  responses = await store.getResponses(attempt.attempt_id);
  const items = orderedItems(bundle);
  assertAttemptComplete(attempt, responses, items.length);
  await ensureQueued(store, attempt, responses);
  const map = buildEvidenceMap(bundle, responses);
  const backupCode = encodeBackup(attempt, responses, bundle);
  const qrCanvas = document.createElement("canvas");
  qrCanvas.className = "qr-canvas";
  qrCanvas.setAttribute("role", "img");
  renderMap(root, map, bundle, {
    syncState,
    backupCode,
    qrCanvas,
    onCopyBackup: () => copyBackup(backupCode),
    onDownloadBackup: () => downloadText(`${backupCode}\n`, `respaldo-${attempt.attempt_id}.txt`),
    onRetrySync: () => runSync(),
    onPurgeLocal: bundle.deployment.backend.enabled ? purgeLocalCopy : null,
  });
  try { drawQr(qrCanvas, backupCode); }
  catch (error) {
    qrCanvas.replaceWith(Object.assign(document.createElement("p"), { className: "field-help", textContent: "El código de texto sigue disponible; este dispositivo no pudo dibujar el QR." }));
    console.warn(error);
  }
  if (sync) await runSync();
}

async function resume() {
  const receipt = await store.getCompletionReceipt(bundle.deployment.administracion.administracion_id);
  if (receipt) return renderClosed(root, bundle);
  const existing = await store.getAttemptByAdministration(bundle.deployment.administracion.administracion_id);
  if (!existing) return showWelcome();
  attempt = existing;
  bundle = await restoreSnapshotIfNeeded(attempt);
  setBranding();
  responses = await store.getResponses(attempt.attempt_id);
  if (attempt.status === "instructions") return renderInstructions(root, bundle, startAttempt, { enrollmentStatus: attempt.enrollment_status });
  if (attempt.status === "in_progress") return showCurrentItem();
  if (["completed", "synced"].includes(attempt.status)) return showMap();
  throw new Error("El estado local de la sesión no es reconocible");
}

async function initialize() {
  setupTextSize();
  updateConnection();
  addEventListener("online", async () => { updateConnection(); if (attempt && ["completed", "synced"].includes(attempt.status)) await runSync(); });
  addEventListener("offline", updateConnection);
  addEventListener("focus", async () => { if (attempt && ["completed", "synced"].includes(attempt.status)) await runSync(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) snapshotTimer(); else resumeTimer();
  });
  const [loadedBundle, localStore, serviceWorker] = await Promise.all([
    loadBundle(),
    LocalStore.open(demoMode ? DEMO_DATABASE_NAME : undefined),
    registerServiceWorker(),
  ]);
  releaseReady = assessReleaseReadiness(loadedBundle).ready;
  bundle = demoMode ? buildDemoBundle(loadedBundle) : loadedBundle;
  store = localStore;
  offlineReady = serviceWorker.ready;
  setBranding();
  profile = await store.getProfile(bundle.deployment.deployment_id);
  if (!releaseReady && !demoMode) return showWelcome();
  await resume();
}

initialize().catch((error) => {
  console.error(error);
  renderFatal(root, error);
});
