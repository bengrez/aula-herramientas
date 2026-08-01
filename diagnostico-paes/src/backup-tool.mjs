import { decodeBackup } from "./engine/backup-code.mjs";
import { validateBackupForBundle } from "./engine/backup-validation.mjs";
import { backupToRawRows, responsesToCsv, downloadCsv } from "./engine/csv.mjs";
import { element, clear } from "./ui/dom.mjs";
import { registerServiceWorker } from "./infra/sw-client.mjs";
import { loadBundle } from "./engine/loader.mjs";
import { buildDemoBundle } from "./engine/demo-isolation.mjs";

const form = document.querySelector('[data-form="backup"]');
const result = document.querySelector('[data-ui="backup-result"]');
const demoMode = new URLSearchParams(location.search).get("demo") === "1";
const bundlePromise = Promise.all([loadBundle(), registerServiceWorker()]).then(([bundle]) => (
  demoMode ? buildDemoBundle(bundle) : bundle
));

function renderError(error) {
  result.hidden = false;
  clear(result).append(element("div", { className: "notice", dataset: { kind: "error" }, role: "alert" }, [element("span", { className: "notice-icon", text: "!", "aria-hidden": "true" }), element("p", { text: error.message })]));
}

function renderDecoded(decoded) {
  const rows = backupToRawRows(decoded, `manual:${decoded.attempt.enrollment_code}`);
  const csv = responsesToCsv(rows);
  const tableBody = element("tbody", {}, rows.map((row) => element("tr", {}, [
    element("th", { scope: "row", text: row.presentation_order }),
    element("td", { text: row.selected_option ?? "Omisión" }),
    element("td", { text: row.response_time_ms }),
    element("td", { text: row.client_recorded_at }),
  ])));
  result.hidden = false;
  clear(result).append(
    element("p", { className: "eyebrow", text: "Estructura verificada" }),
    element("h2", { text: "Respuestas crudas recuperadas", tabindex: "-1" }),
    element("p", { text: `Se recuperaron ${rows.length} filas que coinciden con la sesión activa. No se calculó ningún resultado; esta comprobación no acredita identidad.` }),
    element("div", { className: "table-scroll", role: "region", tabindex: "0", "aria-label": "Respuestas crudas recuperadas" },
      element("table", { className: "result-table" }, [
        element("caption", { className: "visually-hidden", text: "Filas recuperadas desde el respaldo manual" }),
        element("thead", {}, element("tr", {}, ["Orden", "Alternativa", "Tiempo (ms)", "Registro local"].map((label) => element("th", { scope: "col", text: label })))),
        tableBody,
      ])),
    element("div", { className: "button-row" }, element("button", { className: "primary-button", type: "button", text: "Descargar CSV crudo", onclick: () => downloadCsv(csv, `respaldo-${decoded.attempt.attempt_id}.csv`) })),
  );
  result.querySelector("h2")?.focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const bundle = await bundlePromise;
    const decoded = decodeBackup(new FormData(form).get("backup"), bundle);
    renderDecoded(await validateBackupForBundle(decoded, bundle, { demo: demoMode }));
  }
  catch (error) { renderError(error); }
});

form.addEventListener("reset", () => {
  result.hidden = true;
  clear(result);
});

bundlePromise.catch((error) => console.warn("No se pudo preparar el modo offline", error));
