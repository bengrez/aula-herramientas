import { element } from "../src/ui/dom.mjs";
import { practiceOverview } from "../src/engine/practice-library.mjs";
import { lastPracticedDay, describeDay, progressTotals, PRACTICE_COUNTS } from "../src/engine/practice-summary.mjs";
import { countNode, plural } from "./motion.mjs";

// Portada: una sola acción visible sin desplazarse, opciones a un toque, avance en conteos
// descriptivos y lista por unidad donde cada fila inicia una tanda. Sin jerga técnica.

function startLabel(options, figureCount) {
  if (options.figuresOnly) return `Empezar · ${figureCount} con diagrama`;
  return `Empezar · ${plural(options.count, "pregunta")}`;
}

export function renderLanding({ bundle, profile, preview, coded = false, rows, options, figureCount, today, before, onStart, onResume, onOptions, onConnect, onSync, onClose }) {
  const stats = practiceOverview(profile);
  const totals = progressTotals(rows);
  const active = profile.sets.find(s => s.state !== "completed");
  const practiced = rows.filter(r => r.attempts > 0).length;
  const firstVisit = totals.attempts === 0 && stats.completed === 0 && !active;
  const subject = (bundle.config.title.split("·").at(-1) ?? bundle.config.title).trim();
  let current = { ...options };

  // Acción principal
  const primary = element("button", { type: "button", className: "primary-button start-button" });
  const helper = element("p", { className: "start-help" });
  const sizeChips = element("div", { className: "count-chips", role: "radiogroup", "aria-label": "Cantidad de preguntas" }, [
    element("span", { className: "chips-label", "aria-hidden": "true", text: "Preguntas" }),
    ...PRACTICE_COUNTS.map(n => {
      const input = element("input", { type: "radio", name: "practice-count", id: `count-${n}`, value: String(n), checked: n === current.count });
      input.addEventListener("change", () => { current = { ...current, count: n }; sync(); });
      return element("span", { className: "chip" }, [input, element("label", { htmlFor: `count-${n}`, text: String(n) })]);
    }),
  ]);
  const figuresInput = element("input", { type: "checkbox", id: "practice-figures", checked: current.figuresOnly, disabled: figureCount === 0 });
  figuresInput.addEventListener("change", () => { current = { ...current, figuresOnly: figuresInput.checked, ensureFigure: !figuresInput.checked }; sync(); });
  const figuresToggle = element("label", { className: "chip-toggle", htmlFor: "practice-figures" }, [figuresInput, element("span", { text: figureCount ? `Solo preguntas con diagrama (${figureCount})` : "Sin diagramas disponibles" })]);
  const optionsRow = element("div", { className: "start-options" }, [sizeChips, figuresToggle]);
  sizeChips.classList.toggle("is-muted", current.figuresOnly);

  function sync() {
    primary.textContent = startLabel(current, figureCount);
    sizeChips.classList.toggle("is-muted", current.figuresOnly);
    onOptions?.(current);
  }
  if (active) {
    primary.textContent = active.state === "feedback" ? "Continuar · ver explicación pendiente" : `Continuar · pregunta ${active.cursor + 1} de ${active.items.length}`;
    primary.addEventListener("click", onResume);
    helper.textContent = "Retomas donde quedaste. Termina esta tanda para empezar otra.";
    optionsRow.hidden = true;
  } else {
    primary.textContent = startLabel(current, figureCount);
    primary.addEventListener("click", () => { primary.disabled = true; onStart(current); });
    const unpracticed = rows.length - practiced;
    helper.textContent = firstVisit
      ? "Verás la explicación después de cada pregunta. Puedes dejar una sin responder."
      : unpracticed > 0 ? `La próxima tanda prioriza unidades que aún no has practicado (${unpracticed} de ${rows.length}).` : "Cada tanda mezcla unidades y empieza con un diagrama.";
  }
  const start = element("section", { className: "home-start", "aria-labelledby": "home-title" }, [
    element("p", { className: "eyebrow", text: bundle.config.title }),
    element("h1", { id: "home-title", text: `Practica ${subject}` }),
    primary,
    helper,
    optionsRow,
  ]);

  // Avance acumulado
  const metric = (label, id, value, from, suffix = "") => element("div", { className: "progress-metric" }, [
    element("dt", { text: label }),
    element("dd", {}, [countNode(value, { id, from }), suffix ? element("span", { className: "metric-suffix", text: suffix }) : null]),
  ]);
  const lastDay = lastPracticedDay(profile);
  const progress = element("section", { className: "home-progress", "aria-labelledby": "progress-title" }, [
    element("h2", { id: "progress-title", className: "visually-hidden", text: "Tu avance" }),
    firstVisit
      ? element("p", { className: "progress-empty", text: "Aún no has respondido preguntas. Tu avance aparecerá aquí después de la primera tanda." })
      : element("dl", { className: "progress-metrics" }, [
        metric("Respuestas", "progress-attempts", totals.attempts, before?.attempts),
        metric("Aciertos", "progress-correct", totals.correct, before?.correct),
        metric("Unidades practicadas", "progress-units", totals.units, before?.units, ` de ${rows.length}`),
      ]),
    firstVisit ? null : element("p", { className: "progress-line", id: "progress-sets", text: `Última práctica: ${describeDay(lastDay, today)} · ${plural(stats.completed, "tanda terminada", "tandas terminadas")}` }),
  ]);

  // Lista por unidad, agrupada por área del marco. Cada fila inicia una tanda de esa unidad.
  const groups = new Map();
  for (const row of rows) { if (!groups.has(row.area_id)) groups.set(row.area_id, { label: row.area_etiqueta, rows: [] }); groups.get(row.area_id).rows.push(row); }
  const unitRow = row => {
    const sinResponder = row.omitted ? `${row.omitted} sin responder` : "";
    const detail = row.attempts
      ? [`${plural(row.correct, "acierto")} de ${plural(row.attempts, "respuesta")}`, sinResponder].filter(Boolean).join(" · ")
      : sinResponder || "Sin practicar todavía";
    const children = [
      element("span", { className: "unit-name", text: row.etiqueta }),
      element("span", { className: "unit-detail", text: detail }),
      element("span", { className: "unit-count", text: plural(row.items, "pregunta") }),
    ];
    if (active) return element("li", { className: "unit-row" }, children);
    const button = element("button", { type: "button", className: "unit-row", dataset: { unit: row.unidad_id }, "aria-label": `Practicar ${row.etiqueta}, ${detail.toLowerCase()}`, onclick: () => { button.disabled = true; onStart({ ...current, unitIds: [row.unidad_id], figuresOnly: false, ensureFigure: true }); } }, children);
    return element("li", {}, button);
  };
  const list = element("section", { className: "unit-list" }, element("details", { className: "unit-details" }, [
    element("summary", { text: `Ver por unidad (${practiced} de ${rows.length} practicadas)` }),
    ...[...groups.values()].map(group => element("div", { className: "unit-group" }, [element("h3", { text: group.label }), element("ul", {}, group.rows.map(unitRow))])),
  ]));

  const note = element("p", { className: "storage-note", text: preview
    ? "Tu avance se guarda solo en este navegador. No escribas datos personales."
    : coded
      ? "Tu avance se guarda en este dispositivo y en tu cuaderno. Si el teléfono es compartido, ciérralo al terminar."
      : "Tu avance se guarda solo en este teléfono. Con el código de tu tarjeta puedes verlo también en otro." });
  const account = preview ? null : element("div", { className: "practice-account" }, coded ? [
    element("button", { type: "button", className: "secondary-button", text: "Actualizar respaldo", onclick: onSync }),
    element("button", { type: "button", className: "secondary-button", text: "Cerrar cuaderno", onclick: onClose }),
  ] : [
    element("button", { type: "button", className: "secondary-button", text: "Guardar mi avance en otro teléfono", onclick: onConnect }),
  ]);
  return element("div", { className: "practice-home" }, [start, progress, list, note, account]);
}
