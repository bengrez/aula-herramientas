import { element } from "../src/ui/dom.mjs";
import { createRail } from "./question.mjs";
import { countNode, plural } from "./motion.mjs";

// Resumen al terminar una tanda: solo conteos de la tanda y del acumulado. Sin nota, nivel,
// porcentaje ni comparación con otras personas (ADR-0008).
export function renderSummary({ summary, unitRows, before, after, totalUnits, repeatLabel, repeatNote, onRepeat, onHome }) {
  const line = [plural(summary.answered, "respondida"), plural(summary.correct, "acierto")];
  if (summary.omitted) line.push(`${summary.omitted} sin responder`);
  const units = element("ul", { className: "summary-units", "aria-label": "Unidades de esta tanda" }, unitRows.map(row => {
    const detail = row.attempts ? `${plural(row.correct, "acierto")} de ${plural(row.attempts, "respuesta")}` : "sin responder";
    const omitted = row.attempts && row.omitted ? ` · ${row.omitted} sin responder` : "";
    return element("li", {}, [element("strong", { text: row.etiqueta }), element("span", { text: `${detail}${omitted}` })]);
  }));
  const metric = (label, id, value, from, suffix = "") => element("div", { className: "progress-metric" }, [
    element("dt", { text: label }),
    element("dd", {}, [countNode(value, { id, from }), suffix ? element("span", { className: "metric-suffix", text: suffix }) : null]),
  ]);
  const card = element("section", { className: "screen-card practice-summary" }, [
    element("p", { className: "eyebrow", text: "Práctica" }),
    element("h1", { text: "Tanda terminada" }),
    createRail(summary, { large: true }),
    element("p", { className: "summary-line", text: line.join(" · ") }),
    units,
    element("section", { className: "summary-total", "aria-labelledby": "summary-total-title" }, [
      element("h2", { id: "summary-total-title", text: "Ahora llevas" }),
      element("dl", { className: "progress-metrics" }, [
        metric("Respuestas", "summary-attempts", after.attempts, before?.attempts),
        metric("Aciertos", "summary-correct", after.correct, before?.correct),
        metric("Unidades practicadas", "summary-units", after.units, before?.units, ` de ${totalUnits}`),
      ]),
    ]),
    repeatNote ? element("p", { className: "field-help", text: repeatNote }) : null,
  ]);
  const actions = element("div", { className: "action-bar" }, [
    element("button", { type: "button", className: "quiet-button", text: "Volver al inicio", onclick: onHome }),
    element("button", { type: "button", className: "primary-button", text: repeatLabel, onclick: onRepeat }),
  ]);
  return element("div", { className: "practice-set" }, [card, actions]);
}
