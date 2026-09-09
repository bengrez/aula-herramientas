import { assertPracticeDelta, practiceDelta } from "../engine/practice.mjs";

// Encolar no necesita red. Cada tanda conserva el mismo UUID en todos sus reintentos.
export async function syncPractice({ store, key, scope, client, enabled = false, online = true }) {
  if (!enabled || !online) return { status: "local" };
  if (typeof key !== "string" || !key.startsWith(`${scope}:`)) throw new Error("Perfil fuera del período/curso activo");
  const profile = await store.read(key);
  const completed = profile.sets.filter(s => s.state === "completed");
  // Una tanda que el servidor rechace de forma permanente no puede detener la cola: antes el bucle
  // lanzaba al primer rechazo y cada reintento volvía a empezar por ella, de modo que ninguna tanda
  // posterior se respaldaba nunca. Se intentan todas y el fallo se reporta al final.
  const failures = [];
  for (const set of completed.filter(s => !profile.acknowledged.includes(s.id))) {
    try {
      const payload = assertPracticeDelta(practiceDelta(set, scope));
      const receipt = await client.rpc("submit_practice_delta_v1", { p_payload: payload });
      if (receipt?.batch_id !== set.id || !["accepted", "already_accepted"].includes(receipt.status)) throw new Error("recibo de práctica inválido");
    } catch (error) { failures.push(error); }
  }
  // El servidor toma una instantánea coherente de recibos + agregado. Resuelve el ACK perdido
  // sin sumar otra vez una tanda que ya estaba incluida en los totales remotos.
  const snapshot = await client.rpc("get_practice_progress_v1", { p_scope: scope, p_batch_ids: completed.map(s => s.id) });
  if (snapshot?.scope_id !== scope || !Number.isSafeInteger(snapshot?.revision) || snapshot.revision < 0 || !Array.isArray(snapshot?.progress) || !Array.isArray(snapshot?.acknowledged) || snapshot.acknowledged.some(id => !completed.some(s => s.id === id))) throw new Error("Instantánea de práctica inválida");
  if (!Number.isSafeInteger(snapshot?.sets_completed) || snapshot.sets_completed < 0) throw new Error("Instantánea de práctica inválida");
  if (snapshot.progress.some(r => typeof r.unidad_id !== "string" || !Number.isSafeInteger(r.attempts) || r.attempts < 0 || !Number.isSafeInteger(r.correct) || r.correct < 0 || r.correct > r.attempts || !Number.isSafeInteger(r.omitted) || r.omitted < 0)) throw new Error("Conteos remotos inválidos");
  await store.mutate(key, p => snapshot.revision < (p.remote_revision ?? -1) ? p : ({ ...p, remote_revision: snapshot.revision, remote: snapshot.progress, remote_sets: snapshot.sets_completed, acknowledged: [...new Set([...p.acknowledged, ...snapshot.acknowledged])] }));
  // La instantánea ya se guardó, así que lo respaldado queda conciliado aunque algo haya fallado.
  if (failures.length) throw new Error(`${failures.length} ${failures.length === 1 ? "tanda no se respaldó" : "tandas no se respaldaron"}: ${failures[0].message}`);
  return { status: "synced" };
}
