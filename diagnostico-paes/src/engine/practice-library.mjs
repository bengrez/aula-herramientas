import { accumulatedProgress } from "./progress.mjs";

// Biblioteca en memoria: no altera los bancos fuente ni el manifiesto activo.
export function combinePracticeBanks(banks) {
  if (!banks.length) throw new Error("Biblioteca vacía");
  const first = banks[0], ids = new Set();
  for (const bank of banks) {
    if (bank.marco_id !== first.marco_id || bank.marco_version !== first.marco_version) throw new Error("Marcos incompatibles en la biblioteca");
    for (const item of bank.items) {
      if (ids.has(item.item_id)) throw new Error("Identificador duplicado en la biblioteca");
      ids.add(item.item_id);
    }
  }
  return { ...first, banco_id: `${first.banco_id}-biblioteca`,
    estado_autoria: banks.every(b => b.estado_autoria === "contenido_docente_revisado") ? "contenido_docente_revisado" : "contenido_docente_pendiente_revision",
    items: banks.flatMap(b => b.items) };
}

// Incorpora al cuaderno de destino las tandas que el de origen tiene y él no. El destino manda
// ante un mismo identificador, así que repetir la operación nunca revierte una respuesta más
// reciente. El origen no se toca: si algo sale mal, sus tandas siguen donde estaban.
export function mergeProfiles(target, source) {
  if (source.remote?.length || source.acknowledged?.length) throw new Error("El cuaderno de origen no admite datos remotos");
  const ids = new Set(target.sets.map(s => s.id));
  const added = source.sets.filter(s => { if (ids.has(s.id)) return false; ids.add(s.id); return true; });
  return { ...target, sets: [...target.sets, ...added] };
}

// Copia recuperable del antiguo piloto, sólo entre sus dos perfiles de demostración.
export function mergeDemoProfiles(target, legacy) {
  if (!target.key.endsWith(":demo") || legacy.key !== `${target.key}:visual`) throw new Error("Perfiles de demostración incompatibles");
  if (target.remote.length || target.acknowledged.length) throw new Error("Una demostración no admite datos remotos");
  return mergeProfiles(target, legacy);
}

// El servidor cuenta una tanda terminada por recibo, así que su total cubre lo enviado desde
// cualquier dispositivo. Igual que con el agregado por unidad, lo ya respaldado por este aparato
// actúa de piso para que una pérdida en el servidor no borre tandas del cuaderno.
export function practiceOverview(profile) {
  const rows = accumulatedProgress(profile);
  const acknowledged = new Set(profile.acknowledged ?? []);
  const done = profile.sets.filter(s => s.state === "completed");
  const backed = done.filter(s => acknowledged.has(s.id)).length;
  return {
    rows,
    completed: Math.max(Number(profile.remote_sets ?? 0), backed) + (done.length - backed),
    attempts: rows.reduce((n, r) => n + r.attempts, 0),
    correct: rows.reduce((n, r) => n + r.correct, 0),
    units: rows.filter(r => r.attempts > 0).length,
  };
}
