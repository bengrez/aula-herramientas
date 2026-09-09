import { element } from "../src/ui/dom.mjs";
import { renderStimulus } from "../src/ui/stimulus-renderers.mjs";
import { publicFormatLabel } from "../src/engine/stimulus-format.mjs";
import { reducedMotion, plural } from "./motion.mjs";

// Pantalla de pregunta de la práctica. Un solo renderizador sirve para el estado "answer" (sin
// respuesta) y para "feedback" (con respuesta): el patch en vivo tras Comprobar y el montaje
// tras una recarga producen el mismo DOM. screens.mjs del diagnóstico queda intacto.

const GLYPH = { correct: "✓", incorrect: "✕", omitted: "◇", pending: "", current: "" };

export function valueText(summary) {
  const done = summary.answered + summary.omitted;
  const parts = [`${done} de ${summary.total} completadas`, plural(summary.correct, "acierto")];
  if (summary.omitted) parts.push(`${summary.omitted} sin responder`);
  return parts.join(", ");
}

export function tallyText(summary) {
  const base = `En esta tanda: ${plural(summary.correct, "acierto")} de ${plural(summary.answered, "respuesta")}`;
  return summary.omitted ? `${base} · ${summary.omitted} sin responder` : base;
}

// Riel de avance: un nodo por pregunta. `update` solo cambia atributos; no reconstruye nodos.
export function createRail(summary, { large = false } = {}) {
  const list = element("ol", { className: "set-rail", "aria-hidden": "true" }, summary.states.map((state, index) =>
    element("li", { className: "rail-node", dataset: { state, index: String(index + 1) }, text: GLYPH[state] ?? "" })));
  const counter = element("span", { className: "set-counter", tabIndex: -1, dataset: { focusTarget: "true" } });
  const wrap = element("div", { className: `set-progress${large ? " is-large" : ""}`, role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(summary.total) }, [list, counter]);
  updateRail(wrap, summary);
  return wrap;
}

export function updateRail(wrap, summary) {
  const nodes = wrap.querySelectorAll(".rail-node");
  summary.states.forEach((state, index) => {
    const node = nodes[index];
    if (!node) return;
    const current = index === summary.cursor && summary.state !== "completed";
    if (node.dataset.state !== state) {
      node.dataset.state = state;
      node.textContent = GLYPH[state] ?? "";
      if (state !== "pending") { node.classList.remove("just-changed"); void node.offsetWidth; node.classList.add("just-changed"); }
    }
    node.classList.toggle("is-current", current);
  });
  wrap.classList.toggle("is-dense", summary.total > 12);
  const done = summary.answered + summary.omitted;
  const position = summary.state === "completed" ? summary.total : Math.min(summary.cursor + 1, summary.total);
  wrap.querySelector(".set-counter").textContent = `${position} de ${summary.total}`;
  wrap.setAttribute("aria-valuenow", String(done));
  wrap.setAttribute("aria-valuetext", valueText(summary));
  wrap.setAttribute("aria-label", `Pregunta ${position} de ${summary.total}`);
}

function verdict(item, response) {
  const omitted = response.selected_option === null;
  const correct = !omitted && response.selected_option === item.clave;
  if (omitted) return { kind: "neutral", title: "Sin responder", line: `No cuenta como error ni como acierto. Igual puedes leer por qué la clave es ${item.clave}.`, correct, omitted };
  if (correct) return { kind: "success", title: "Correcta", line: "Elegiste la alternativa clave.", correct, omitted };
  return { kind: "error", title: "No es la clave", line: `Elegiste ${response.selected_option}; la clave es ${item.clave}.`, correct, omitted };
}

export function renderQuestion({ item, summary, theme, response = null, onCheck, onSkip, onNext, onHome }) {
  const isLast = summary.cursor + 1 >= summary.total;
  const rail = createRail(summary);
  const home = element("button", { type: "button", className: "quiet-button set-home", text: "← Inicio", "aria-label": "Volver al inicio, tu avance queda guardado", onclick: onHome });
  const bar = element("nav", { className: "set-bar", "aria-label": "Avance de la tanda" }, [home, rail]);
  const format = publicFormatLabel(item.estimulo);
  const meta = element("p", { className: "question-theme" }, [
    element("span", { className: "question-unit", text: theme }),
    format ? element("span", { className: "format-chip", text: format }) : null,
  ]);
  const stimulus = item.estimulo ? renderStimulus(item.estimulo) : null;
  const heading = element("h1", { className: "question-text", text: item.enunciado });

  const fieldset = element("fieldset", { className: "alternatives" }, element("legend", { className: "visually-hidden", text: "Elige una alternativa" }));
  const inputs = [], tags = new Map(), rows = new Map();
  for (const alternative of item.alternativas) {
    const id = `option-${summary.cursor}-${alternative.id}`;
    const input = element("input", { id, type: "radio", name: "answer", value: alternative.id });
    const tag = element("span", { className: "alt-tag", hidden: true });
    const label = element("label", { htmlFor: id }, [
      element("span", { className: "alternative-key", text: alternative.id }),
      element("span", { className: "alternative-text", text: alternative.texto }),
      tag,
    ]);
    const row = element("div", { className: "alternative" }, [input, label]);
    fieldset.append(row);
    inputs.push(input); tags.set(alternative.id, tag); rows.set(alternative.id, row);
  }
  const skipNote = element("p", { className: "skip-note", hidden: true });
  const feedback = element("div", { className: "feedback-slot" });

  const skip = element("button", { type: "button", className: "quiet-button skip-button", text: "Dejar sin responder" });
  const primary = element("button", { type: "button", className: "primary-button check-button", text: "Comprobar", disabled: true, dataset: { role: "check" } });
  const actions = element("div", { className: "action-bar" }, [skip, primary]);
  const card = element("section", { className: "screen-card practice-question" }, [meta, stimulus, heading, fieldset, skipNote, feedback]);
  const node = element("div", { className: "practice-set" }, [bar, card, actions]);

  const selected = () => inputs.find(input => input.checked)?.value ?? null;
  let armed = false;
  const disarm = () => { armed = false; skip.textContent = "Dejar sin responder"; skip.removeAttribute("aria-pressed"); skipNote.hidden = true; };
  const refresh = () => {
    const option = selected();
    primary.disabled = !option;
    primary.textContent = option ? `Comprobar ${option}` : "Comprobar";
    if (armed) disarm();
  };
  inputs.forEach(input => input.addEventListener("change", refresh));
  fieldset.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.matches('input[type="radio"]') && primary.dataset.role === "check" && !primary.disabled) { event.preventDefault(); primary.click(); }
  });
  primary.addEventListener("click", () => {
    if (primary.disabled) return;
    if (primary.dataset.role === "next") { primary.disabled = true; onNext(); return; }
    const option = selected();
    if (!option) return;
    primary.disabled = true; skip.disabled = true;
    onCheck(option);
  });
  skip.addEventListener("click", () => {
    if (skip.disabled) return;
    if (selected() && !armed) {
      // Hay una alternativa marcada: pedir confirmación explícita, sin temporizador.
      armed = true;
      skip.textContent = "Confirmar sin responder";
      skip.setAttribute("aria-pressed", "true");
      skipNote.textContent = `Tienes marcada la ${selected()}. Si confirmas, la pregunta queda sin responder: no cuenta como error.`;
      skipNote.hidden = false;
      return;
    }
    skip.disabled = true; primary.disabled = true;
    onSkip();
  });

  function reveal(resp, sum, { focus = true } = {}) {
    const result = verdict(item, resp);
    fieldset.disabled = true;
    for (const alternative of item.alternativas) {
      const row = rows.get(alternative.id), tag = tags.get(alternative.id);
      const isKey = alternative.id === item.clave, isChosen = alternative.id === resp.selected_option;
      row.dataset.state = isKey ? "key" : isChosen ? "missed" : "muted";
      if (isKey || isChosen) { tag.textContent = isKey && isChosen ? "Tu respuesta · Clave" : isKey ? "Clave" : "Tu respuesta"; tag.hidden = false; }
    }
    const chosen = result.omitted ? null : item.alternativas.find(a => a.id === resp.selected_option);
    const key = item.alternativas.find(a => a.id === item.clave);
    const panel = element("section", { className: "feedback-panel", tabIndex: -1, dataset: { kind: result.kind } }, [
      element("h2", { text: result.title }),
      element("p", { className: "feedback-line", text: result.line }),
      !result.correct && chosen?.diagnostico ? element("h3", { text: "Sobre tu respuesta" }) : null,
      !result.correct && chosen?.diagnostico ? element("p", { text: chosen.diagnostico }) : null,
      element("h3", { text: "Por qué es la clave" }),
      key ? element("p", { className: "feedback-key", text: `${key.id}. ${key.texto}` }) : null,
      element("p", { text: item.razonamiento_esperado || key?.diagnostico || "" }),
      element("p", { className: "set-tally", text: tallyText(sum) }),
    ]);
    feedback.replaceChildren(panel);
    skipNote.hidden = true;
    skip.hidden = true;
    primary.dataset.role = "next";
    primary.textContent = isLast ? "Terminar tanda" : "Siguiente pregunta";
    primary.disabled = false;
    updateRail(rail, sum);
    if (focus) requestAnimationFrame(() => {
      panel.focus({ preventScroll: true });
      panel.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    });
    return result;
  }

  if (response) reveal(response, summary, { focus: false });
  return { node, reveal };
}
