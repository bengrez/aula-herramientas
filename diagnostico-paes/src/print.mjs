import { loadBundle, orderedItems } from "./engine/loader.mjs";
import { flattenCriteria } from "./engine/contracts.mjs";
import { element, clear } from "./ui/dom.mjs";
import { renderStimulus } from "./ui/stimulus-renderers.mjs";
import { registerServiceWorker } from "./infra/sw-client.mjs";
import { assessReleaseReadiness } from "./engine/release-readiness.mjs";

const root = document.querySelector("#print-root");
document.querySelector('[data-action="print"]').addEventListener("click", () => window.print());

function answerList(item) {
  return element("ol", { className: "answers" }, item.alternativas.map((alternative) => element("li", {}, [
    element("span", { className: "answer-letter", text: alternative.id }),
    element("span", { text: alternative.texto }),
  ])));
}

function itemBlock(item, index) {
  return element("article", { className: "item-print" }, [
    element("div", { className: "item-heading" }, [element("h2", { text: `Ítem ${index + 1}` }), element("span", { text: `${item.eje} · ${item.formato_estimulo.replaceAll("_", " ")}` })]),
    renderStimulus(item.estimulo),
    element("p", { className: "question", text: item.enunciado }),
    answerList(item),
  ]);
}

function answerSheet(items) {
  const optionIds = [...new Set(items.flatMap((item) => item.alternativas.map((alternative) => alternative.id)))];
  const head = element("thead", {}, element("tr", {}, ["Ítem", ...optionIds, "Sin respuesta"].map((label) => element("th", { scope: "col", text: label }))));
  const body = element("tbody");
  items.forEach((item, index) => {
    const available = new Set(item.alternativas.map((alternative) => alternative.id));
    const optionCells = optionIds.map((optionId) => element("td", {}, available.has(optionId) ? element("span", { className: "bubble", "aria-hidden": "true" }) : element("span", { text: "—", "aria-label": "No aplica" })));
    body.append(element("tr", {}, [element("th", { scope: "row", text: index + 1 }), ...optionCells, element("td", {}, element("span", { className: "bubble", "aria-hidden": "true" }))]));
  });
  return element("section", { className: "answer-sheet" }, [
    element("h2", { text: "Hoja de respuestas" }),
    element("div", { className: "identity-row" }, [element("div", { className: "identity-field" }, [element("strong", { text: "Código personal:" })]), element("div", { className: "identity-field" }, [element("strong", { text: "Fecha:" })])]),
    element("p", { text: `Marca una sola alternativa (${optionIds.join(", ")}) por ítem. Si decides omitir, marca la última columna.` }),
    element("table", { className: "answer-grid" }, [element("caption", { className: "visually-hidden", text: "Hoja para marcar una alternativa u omisión por ítem" }), head, body]),
    element("p", { className: "paper-note", text: "Transcripción docente: registrar una fila por ítem; alternativa vacía si se omitió; tiempo de respuesta sin dato; procedencia papel. No agregar acierto, puntaje ni diagnóstico al registro crudo." }),
  ]);
}

async function render() {
  const [bundle] = await Promise.all([loadBundle(), registerServiceWorker()]);
  const items = orderedItems(bundle);
  const print = bundle.deployment.impresion;
  const selectedCriteria = new Set(items.map((item) => item.criterio_id));
  const publicLabels = flattenCriteria(bundle.framework).filter((criterion) => selectedCriteria.has(criterion.id)).map((criterion) => criterion.etiqueta);
  const fragment = document.createDocumentFragment();
  if (!assessReleaseReadiness(bundle).ready) fragment.append(element("div", { className: "draft-banner", text: "BORRADOR TÉCNICO — ÍTEMS DE RELLENO — NO APLICAR" }));
  fragment.append(
    element("header", { className: "institutional-header" }, [
      element("img", { src: print.logo_url, alt: print.logo_alt }),
      element("div", { className: "institutional-copy" }, [
        element("strong", { text: print.institucion }),
        element("span", { text: print.unidad }),
        element("span", { text: print.nivel_eje }),
        element("span", { text: print.docente }),
      ]),
      element("div", { className: "character-box", text: print.caracter }),
    ]),
    element("section", { className: "document-title" }, [element("h1", { text: bundle.deployment.ui.etiqueta_sesion }), element("p", { text: bundle.deployment.ui.subtitulo })]),
    element("div", { className: "identity-row" }, [element("div", { className: "identity-field" }, [element("strong", { text: "Código personal:" })]), element("div", { className: "identity-field" }, [element("strong", { text: "Fecha:" })])]),
    element("section", { className: "metadata-block" }, [element("h2", { text: "Zonas de habilidad exploradas" }), element("ul", {}, publicLabels.map((label) => element("li", { text: label })))]),
    element("section", { className: "metadata-block" }, [element("h2", { text: "Instrucciones" }), element("ol", {}, bundle.deployment.ui.instrucciones.map((instruction) => element("li", { text: instruction })))]),
    ...items.map(itemBlock),
    answerSheet(items),
  );
  clear(root).append(fragment);
}

render().catch((error) => {
  console.error(error);
  clear(root).append(element("p", { className: "print-error", text: `No se pudo preparar la impresión: ${error.message}` }));
});
