import { flattenCriteria, flattenUnits } from "./contracts.mjs";
import { itemMap } from "./loader.mjs";

function findInferenceState(profile, evidenceCount, correctCount) {
  const row = profile.tabla_inferencia.find((entry) => entry.evidencias_evaluables === evidenceCount && entry.aciertos === correctCount);
  if (!row) throw new Error(`Falta una regla de evidencia para ${evidenceCount}:${correctCount}`);
  return row.estado;
}

export function buildEvidenceMap(bundle, responses) {
  const criteria = flattenCriteria(bundle.framework);
  const criteriaById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const stateById = new Map(bundle.framework.mapa_evidencia.estados.map((state) => [state.id, state]));
  const itemsByKey = itemMap(bundle);
  const responseByKey = new Map(responses.map((response) => [`${response.item_id}@${response.item_version}`, response]));
  const grouped = new Map();
  const contentGrouped = new Map();
  const quickConfig = bundle.framework.mapa_evidencia.respuestas_rapidas;

  for (const ref of bundle.session.items) {
    const key = `${ref.item_id}@${ref.item_version}`;
    const item = itemsByKey.get(key);
    const response = responseByKey.get(key);
    if (!grouped.has(item.criterio_id)) grouped.set(item.criterio_id, []);
    grouped.get(item.criterio_id).push({ item, response });
    if (item.unidad_rol === "medicion") {
      if (!contentGrouped.has(item.unidad_id)) contentGrouped.set(item.unidad_id, []);
      contentGrouped.get(item.unidad_id).push({ item, response });
    }
  }

  const isQuick = (response) => Boolean(
    quickConfig
    && response
    && Number.isFinite(response.response_time_ms)
    && response.response_time_ms < quickConfig.umbral_ms
  );
  const excludesQuick = quickConfig
    && bundle.session.reglas.tratamiento_respuestas_rapidas === quickConfig.modo_autonomo;
  const eligibleEntries = (entries) => entries.filter(({ item, response }) => (
    item.estado_clave === "ok"
    && response
    && response.selected_option !== null
    && (!excludesQuick || !isQuick(response))
  ));

  const explored = [...grouped.entries()].map(([criterionId, entries]) => {
    const eligible = eligibleEntries(entries);
    const correctCount = eligible.filter(({ item, response }) => response.selected_option === item.clave).length;
    const stateId = findInferenceState(bundle.framework.mapa_evidencia, eligible.length, correctCount);
    const criterion = criteriaById.get(criterionId);
    const state = stateById.get(stateId);
    return {
      criterion_id: criterionId,
      label: criterion.etiqueta,
      description: criterion.descripcion,
      focus_priority: criterion.prioridad_foco ?? 999,
      evidence_count: eligible.length,
      correct_count: correctCount,
      quick_response_count: entries.filter(({ response }) => response?.selected_option !== null && isQuick(response)).length,
      state_id: stateId,
      state,
    };
  });

  explored.sort((left, right) => right.state.orden - left.state.orden || left.focus_priority - right.focus_priority || left.label.localeCompare(right.label, "es"));

  const focusStateRank = new Map(bundle.session.orden_foco_estados.map((stateId, index) => [stateId, index]));
  const focus = explored
    .filter((zone) => focusStateRank.has(zone.state_id))
    .sort((left, right) => focusStateRank.get(left.state_id) - focusStateRank.get(right.state_id) || left.focus_priority - right.focus_priority)[0] ?? null;

  const exploredIds = new Set(grouped.keys());
  const pendingState = stateById.get("sin_evidencia");
  if (!pendingState) throw new Error("El marco no define el estado sin_evidencia");
  const pending = criteria.filter((criterion) => !exploredIds.has(criterion.id)).map((criterion) => ({
    label: criterion.etiqueta,
    state_id: pendingState.id,
    state: pendingState,
  }));
  const unitsById = new Map(flattenUnits(bundle.framework).map((unit) => [unit.id, unit]));
  const contentZones = [...contentGrouped.entries()].map(([unitId, entries]) => {
    const eligible = eligibleEntries(entries);
    const correctCount = eligible.filter(({ item, response }) => response.selected_option === item.clave).length;
    const stateId = findInferenceState(bundle.framework.mapa_evidencia, eligible.length, correctCount);
    return {
      unit_id: unitId,
      label: unitsById.get(unitId)?.etiqueta ?? unitId,
      evidence_count: eligible.length,
      correct_count: correctCount,
      state_id: stateId,
      state: stateById.get(stateId),
    };
  });
  return { zones: explored, focus, pending, content_zones: contentZones };
}
