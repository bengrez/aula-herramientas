import { loadBundle, orderedItems } from "./engine/loader.mjs";
import { validateEnrollmentCode } from "./engine/enrollment-code.mjs";
import { buildPaperSubmission } from "./engine/paper-transcription.mjs";
import { encodeBackup } from "./engine/backup-code.mjs";
import { backupToRawRows, responsesToCsv, downloadCsv } from "./engine/csv.mjs";
import { assertSyncReceipt, createSubmissionPayload } from "./infra/sync.mjs";
import { SupabaseHttp } from "./infra/supabase-http.mjs";
import { registerServiceWorker } from "./infra/sw-client.mjs";
import { drawQr } from "./infra/qr.mjs";
import { element, clear } from "./ui/dom.mjs";
import { assessReleaseReadiness } from "./engine/release-readiness.mjs";
import { buildDemoBundle } from "./engine/demo-isolation.mjs";

const form = document.querySelector('[data-form="paper"]');
const status = document.querySelector('[data-ui="paper-status"]');
const result = document.querySelector('[data-ui="paper-result"]');
const demoMode = new URLSearchParams(location.search).get("demo") === "1";
let bundle;
let currentSubmission;

function localDatetimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function renderError(target, message) {
  target.hidden = false;
  clear(target).append(element("div", { className: "notice", dataset: { kind: "error" }, role: "alert" }, [
    element("span", { className: "notice-icon", text: "!", "aria-hidden": "true" }),
    element("p", { text: message }),
  ]));
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("No se pudo copiar automáticamente");
  }
}

function answerSelect(item, index) {
  const id = `paper-answer-${index + 1}`;
  return element("div", { className: "paper-answer" }, [
    element("label", { htmlFor: id }, [element("strong", { text: `Ítem ${index + 1}` }), element("span", { text: item.eje })]),
    element("select", { id, name: "answers", required: true }, [
      element("option", { value: "", text: "Selecciona…" }),
      ...item.alternativas.map((alternative) => element("option", { value: alternative.id, text: alternative.id })),
      element("option", { value: "omit", text: "Sin respuesta" }),
    ]),
  ]);
}

function renderForm() {
  const items = orderedItems(bundle);
  const demoNote = demoMode ? element("div", { className: "notice" }, [
    element("span", { className: "notice-icon", text: "◇", "aria-hidden": "true" }),
    element("p", { text: `Modo demostración. Código de prueba: ${bundle.deployment.enrolamiento.codigo_demo_visible}` }),
  ]) : null;
  clear(form).append(
    demoNote,
    element("div", { className: "paper-meta-grid" }, [
      element("div", { className: "field-group" }, [
        element("label", { htmlFor: "paper-code", text: "Código personal" }),
        element("input", { id: "paper-code", name: "code", required: true, autocomplete: "off", autocapitalize: "characters", spellcheck: false, value: demoMode ? bundle.deployment.enrolamiento.codigo_demo_visible : "" }),
        element("p", { className: "field-help", text: "Escribe el código de la hoja, nunca el nombre." }),
      ]),
      element("div", { className: "field-group" }, [
        element("label", { htmlFor: "paper-applied-at", text: "Término aproximado de la aplicación" }),
        element("input", { id: "paper-applied-at", name: "applied_at", type: "datetime-local", required: true, value: localDatetimeValue() }),
        element("p", { className: "field-help", text: "No se inventan tiempos por ítem; quedarán sin dato." }),
      ]),
    ]),
    element("fieldset", { className: "paper-answers" }, [
      element("legend", { text: "Marcas de la hoja" }),
      element("p", { className: "field-help", text: "Selecciona una alternativa o “Sin respuesta” para cada ítem." }),
      element("div", { className: "paper-answer-grid" }, items.map(answerSelect)),
    ]),
    element("div", { className: "button-row" }, [
      element("button", { className: "primary-button", type: "submit", text: "Validar y crear respaldo" }),
      element("button", { className: "secondary-button", type: "reset", text: "Limpiar" }),
    ]),
  );
  form.hidden = false;
  clear(status);
}

function rawTable(rows) {
  return element("div", { className: "table-scroll", role: "region", tabindex: "0", "aria-label": "Resumen de respuestas transcritas" },
    element("table", { className: "result-table" }, [
      element("caption", { className: "visually-hidden", text: "Doce respuestas crudas transcritas desde papel" }),
      element("thead", {}, element("tr", {}, ["Ítem", "Marca", "Tiempo", "Procedencia"].map((label) => element("th", { scope: "col", text: label })))),
      element("tbody", {}, rows.map((row) => element("tr", {}, [
        element("th", { scope: "row", text: row.presentation_order }),
        element("td", { text: row.selected_option ?? "Omisión" }),
        element("td", { text: "Sin dato" }),
        element("td", { text: "Papel" }),
      ]))),
    ]),
  );
}

async function renderSubmission(submission, formattedCode) {
  const rows = backupToRawRows(submission, `paper:${formattedCode}`);
  const csv = responsesToCsv(rows);
  const backup = encodeBackup(submission.attempt, submission.responses, bundle);
  const qr = element("canvas", { className: "qr-canvas", role: "img", "aria-label": "Código QR del respaldo de la transcripción" });
  await drawQr(qr, backup);
  const syncStatus = element("p", { className: "field-help", text: bundle.deployment.backend.enabled ? "Envío aún no solicitado." : "Supabase no está configurado: conserva el CSV o el respaldo manual." });
  const buttons = [
    element("button", { className: "primary-button", type: "button", text: "Descargar CSV crudo", onclick: () => downloadCsv(csv, `papel-${submission.attempt.attempt_id}.csv`) }),
    element("button", { className: "secondary-button", type: "button", text: "Copiar respaldo", onclick: async () => {
      try {
        await copyText(backup);
        syncStatus.textContent = "Respaldo copiado.";
      } catch {
        syncStatus.textContent = "No se pudo copiar automáticamente. Abre “Mostrar respaldo manual” y selecciona el texto.";
      }
    } }),
  ];
  if (bundle.deployment.backend.enabled) {
    buttons.push(element("button", { className: "secondary-button", type: "button", text: "Enviar respaldo", onclick: async (event) => {
      event.currentTarget.disabled = true;
      syncStatus.textContent = "Enviando respaldo…";
      try {
        const client = new SupabaseHttp(bundle.deployment.backend);
        const receipt = assertSyncReceipt(
          await client.rpc(bundle.deployment.backend.rpc_name, createSubmissionPayload(submission.attempt, submission.responses)),
          submission.attempt.attempt_id,
        );
        syncStatus.textContent = receipt?.status === "already_synced" ? "Este respaldo ya había sido recibido." : "Respaldo recibido por la base de datos.";
      } catch (error) {
        syncStatus.textContent = `No se pudo enviar: ${error.message}. El CSV y el código siguen disponibles.`;
        event.currentTarget.disabled = false;
      }
    }}));
  }
  result.hidden = false;
  clear(result).append(
    element("p", { className: "eyebrow", text: "Transcripción validada" }),
    element("h2", { text: `${rows.length} respuestas crudas listas`, tabindex: "-1" }),
    element("p", { text: "Revisa la tabla antes de descargar o enviar. No se usaron claves ni se calculó un resultado." }),
    rawTable(rows),
    element("div", { className: "backup-grid paper-backup" }, [
      element("details", {}, [element("summary", { text: "Mostrar respaldo manual" }), element("code", { className: "backup-code", text: backup })]),
      qr,
    ]),
    element("div", { className: "button-row" }, buttons),
    syncStatus,
  );
  result.querySelector("h2")?.focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const data = new FormData(form);
    const validation = await validateEnrollmentCode(data.get("code"), bundle.deployment.enrolamiento, { demo: demoMode });
    if (!validation.ok) throw new Error(validation.reason);
    const selections = data.getAll("answers").map((value) => value === "omit" ? null : value);
    currentSubmission = buildPaperSubmission(bundle, validation.formatted, selections, data.get("applied_at"));
    await renderSubmission(currentSubmission, validation.formatted);
  } catch (error) {
    renderError(result, error.message);
  } finally {
    submit.disabled = false;
  }
});

form.addEventListener("reset", () => {
  setTimeout(() => {
    result.hidden = true;
    clear(result);
    currentSubmission = null;
  });
});

Promise.all([loadBundle(), registerServiceWorker()]).then(([loaded]) => {
  const releaseReady = assessReleaseReadiness(loaded).ready;
  bundle = demoMode ? buildDemoBundle(loaded) : loaded;
  if (!releaseReady && !demoMode) {
    renderError(status, `${bundle.deployment.ui.aviso_placeholder} La transcripción solo se habilita en modo demostración hasta liberar el banco definitivo.`);
    return;
  }
  renderForm();
}).catch((error) => renderError(status, `No se pudo cargar la plantilla: ${error.message}`));
