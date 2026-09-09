import { element } from "../src/ui/dom.mjs";

// Utilidades de interfaz (no motor): movimiento respetuoso y anuncios accesibles.
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Una sola región viva (#live en index.html) recibe frases cortas por evento. Los paneles internos
// no llevan aria-live: evita la doble lectura foco + región en VoiceOver/TalkBack.
export function announce(text) {
  const live = document.querySelector("#live");
  if (!live) return;
  live.textContent = "";
  requestAnimationFrame(() => { live.textContent = text; });
}

// Número que "sube" desde `from` hasta `value`. El valor final está desde el inicio en un span
// oculto para lectores de pantalla y en data-value; lo animado es solo visual (aria-hidden).
export function countNode(value, { id, from = null, duration = 650 } = {}) {
  const visual = element("span", { className: "count-visual", "aria-hidden": "true", text: String(value) });
  const spoken = element("span", { className: "visually-hidden", text: String(value) });
  const node = element("span", { className: "count", id, dataset: { value: String(value) } }, [visual, spoken]);
  const start = Number.isFinite(from) ? from : value;
  if (start !== value && !reducedMotion()) animateNumber(visual, start, value, duration);
  return node;
}

function animateNumber(target, from, to, duration) {
  const started = performance.now();
  target.textContent = String(from);
  const step = now => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    target.textContent = String(Math.round(from + (to - from) * eased));
    if (progress < 1) requestAnimationFrame(step); else target.textContent = String(to);
  };
  requestAnimationFrame(step);
}

export function plural(n, singular, pluralForm = `${singular}s`) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
