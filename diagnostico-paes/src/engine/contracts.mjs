import { BANK_AUTHORING_STATES, RELEASE_GATE_IDS, isPlausibleSupabasePublishableKey, isValidSupabaseBackendUrl } from "./release-readiness.mjs";

export class ContractError extends Error {
  constructor(message, path = "") {
    super(path ? `${path}: ${message}` : message);
    this.name = "ContractError";
    this.path = path;
  }
}

function requireObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractError("se esperaba un objeto", path);
  }
  return value;
}

function requireArray(value, path, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) {
    throw new ContractError(`se esperaba una lista con al menos ${minimum} elemento(s)`, path);
  }
  return value;
}

function requireString(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ContractError("se esperaba texto no vacío", path);
  }
  return value;
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") throw new ContractError("se esperaba verdadero o falso", path);
  return value;
}

function unique(values, path) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new ContractError(`valor duplicado: ${value}`, path);
    seen.add(value);
  }
  return seen;
}

function assertReference(value, allowed, path) {
  if (!allowed.has(value)) throw new ContractError(`referencia inexistente: ${value}`, path);
}

export function assertActiveConfig(active) {
  requireObject(active, "active");
  if (active.schema_version !== 1) throw new ContractError("schema_version no compatible", "active.schema_version");
  for (const key of ["deployment_url", "framework_url", "bank_url", "session_url"]) {
    requireString(active[key], `active.${key}`);
  }
  requireArray(active.offline_assets, "active.offline_assets", 1).forEach((value, index) => {
    requireString(value, `active.offline_assets[${index}]`);
  });
  return active;
}

export function assertFramework(framework) {
  requireObject(framework, "framework");
  if (framework.schema_version !== 1) throw new ContractError("schema_version no compatible", "framework.schema_version");
  requireString(framework.marco_id, "framework.marco_id");
  requireString(framework.version, "framework.version");
  requireString(framework.titulo, "framework.titulo");

  const abilities = requireArray(framework.habilidades, "framework.habilidades", 1);
  const abilityIds = unique(abilities.map((entry, index) => requireString(entry.id, `framework.habilidades[${index}].id`)), "framework.habilidades");
  const criteria = [];
  for (const [abilityIndex, ability] of abilities.entries()) {
    requireString(ability.etiqueta, `framework.habilidades[${abilityIndex}].etiqueta`);
    for (const [criterionIndex, criterion] of requireArray(ability.criterios, `framework.habilidades[${abilityIndex}].criterios`, 1).entries()) {
      requireString(criterion.id, `framework.habilidades[${abilityIndex}].criterios[${criterionIndex}].id`);
      requireString(criterion.etiqueta, `framework.habilidades[${abilityIndex}].criterios[${criterionIndex}].etiqueta`);
      requireString(criterion.descripcion, `framework.habilidades[${abilityIndex}].criterios[${criterionIndex}].descripcion`);
      criteria.push(criterion);
    }
  }
  const criterionIds = unique(criteria.map((entry) => entry.id), "framework.criterios");

  const areas = requireArray(framework.areas, "framework.areas", 1);
  const areaIds = unique(areas.map((entry, index) => requireString(entry.id, `framework.areas[${index}].id`)), "framework.areas");
  const units = [];
  for (const [areaIndex, area] of areas.entries()) {
    requireString(area.eje, `framework.areas[${areaIndex}].eje`);
    requireString(area.etiqueta, `framework.areas[${areaIndex}].etiqueta`);
    for (const [unitIndex, unit] of requireArray(area.unidades, `framework.areas[${areaIndex}].unidades`, 1).entries()) {
      const unitPath = `framework.areas[${areaIndex}].unidades[${unitIndex}]`;
      requireString(unit.id, `${unitPath}.id`);
      requireString(unit.etiqueta, `${unitPath}.etiqueta`);
      requireString(unit.operacion_diagnostica, `${unitPath}.operacion_diagnostica`);
      requireArray(unit.prerrequisitos, `${unitPath}.prerrequisitos`);
      requireArray(unit.representaciones, `${unitPath}.representaciones`, 1);
      requireString(unit.limite_diagnostico, `${unitPath}.limite_diagnostico`);
      if (!["alta", "media", "diferida"].includes(unit.prioridad_diagnostico_v1)) {
        throw new ContractError("prioridad no reconocida", `${unitPath}.prioridad_diagnostico_v1`);
      }
      requireArray(unit.criterios_compatibles, `${unitPath}.criterios_compatibles`, 1).forEach((criterionId, criterionIndex) => {
        assertReference(criterionId, criterionIds, `${unitPath}.criterios_compatibles[${criterionIndex}]`);
      });
      units.push(unit);
    }
  }
  const unitIds = unique(units.map((entry) => entry.id), "framework.unidades");
  for (const unit of units) {
    for (const prerequisite of unit.prerrequisitos) {
      if (typeof prerequisite === "object" && prerequisite?.unidad_id) {
        assertReference(prerequisite.unidad_id, unitIds, `framework.unidad.${unit.id}.prerrequisitos`);
      }
    }
  }

  const map = requireObject(framework.mapa_evidencia, "framework.mapa_evidencia");
  requireString(map.perfil_id, "framework.mapa_evidencia.perfil_id");
  const states = requireArray(map.estados, "framework.mapa_evidencia.estados", 4);
  const stateIds = unique(states.map((entry, index) => requireString(entry.id, `framework.mapa_evidencia.estados[${index}].id`)), "framework.mapa_evidencia.estados");
  states.forEach((state, index) => {
    requireString(state.etiqueta, `framework.mapa_evidencia.estados[${index}].etiqueta`);
    requireString(state.descripcion, `framework.mapa_evidencia.estados[${index}].descripcion`);
    requireString(state.simbolo, `framework.mapa_evidencia.estados[${index}].simbolo`);
    if (!Number.isInteger(state.orden)) throw new ContractError("orden debe ser entero", `framework.mapa_evidencia.estados[${index}].orden`);
  });
  const evidenceRows = requireArray(map.tabla_inferencia, "framework.mapa_evidencia.tabla_inferencia", 1);
  unique(evidenceRows.map((row, index) => {
    if (!Number.isInteger(row.evidencias_evaluables) || row.evidencias_evaluables < 0) throw new ContractError("cantidad inválida", `framework.mapa_evidencia.tabla_inferencia[${index}]`);
    if (!Number.isInteger(row.aciertos) || row.aciertos < 0 || row.aciertos > row.evidencias_evaluables) throw new ContractError("aciertos inválidos", `framework.mapa_evidencia.tabla_inferencia[${index}]`);
    assertReference(row.estado, stateIds, `framework.mapa_evidencia.tabla_inferencia[${index}].estado`);
    return `${row.evidencias_evaluables}:${row.aciertos}`;
  }), "framework.mapa_evidencia.tabla_inferencia");
  if (map.respuestas_rapidas !== undefined) {
    const quick = requireObject(map.respuestas_rapidas, "framework.mapa_evidencia.respuestas_rapidas");
    if (!Number.isInteger(quick.umbral_ms) || quick.umbral_ms < 1) {
      throw new ContractError("umbral debe ser un entero positivo", "framework.mapa_evidencia.respuestas_rapidas.umbral_ms");
    }
    if (quick.sesion_ancla !== "marcar_sin_excluir") {
      throw new ContractError("regla de sesión ancla no reconocida", "framework.mapa_evidencia.respuestas_rapidas.sesion_ancla");
    }
    if (quick.modo_autonomo !== "excluir_de_cobertura") {
      throw new ContractError("regla de modo autónomo no reconocida", "framework.mapa_evidencia.respuestas_rapidas.modo_autonomo");
    }
    requireBoolean(quick.recalibrar_con_datos_reales, "framework.mapa_evidencia.respuestas_rapidas.recalibrar_con_datos_reales");
  }

  const matrix = requireArray(framework.matriz_contenido_habilidad, "framework.matriz_contenido_habilidad", 1);
  matrix.forEach((row, index) => {
    assertReference(row.area_id, areaIds, `framework.matriz_contenido_habilidad[${index}].area_id`);
    assertReference(row.habilidad_id, abilityIds, `framework.matriz_contenido_habilidad[${index}].habilidad_id`);
    if (!["medible", "evidencia_multiple", "no_prioritaria"].includes(row.condicion)) {
      throw new ContractError("condición de matriz no reconocida", `framework.matriz_contenido_habilidad[${index}].condicion`);
    }
  });

  return { framework, abilityIds, criterionIds, areaIds, unitIds, criteria, units };
}

export function assertBank(bank, frameworkContext) {
  requireObject(bank, "bank");
  if (bank.schema_version !== 1) throw new ContractError("schema_version no compatible", "bank.schema_version");
  requireString(bank.banco_id, "bank.banco_id");
  requireString(bank.version, "bank.version");
  requireString(bank.estado_autoria, "bank.estado_autoria");
  if (!BANK_AUTHORING_STATES.includes(bank.estado_autoria)) {
    throw new ContractError("estado de autoría no reconocido", "bank.estado_autoria");
  }
  if (bank.marco_id !== frameworkContext.framework.marco_id || bank.marco_version !== frameworkContext.framework.version) {
    throw new ContractError("el banco apunta a otro marco", "bank");
  }
  const items = requireArray(bank.items, "bank.items", 1);
  const itemKeys = unique(items.map((item, index) => {
    const path = `bank.items[${index}]`;
    requireString(item.item_id, `${path}.item_id`);
    requireString(item.version, `${path}.version`);
    if (item.marco_id !== bank.marco_id || item.marco_version !== bank.marco_version) throw new ContractError("referencia de marco incoherente", path);
    assertReference(item.unidad_id, frameworkContext.unitIds, `${path}.unidad_id`);
    if (!["medicion", "contexto"].includes(item.unidad_rol)) {
      throw new ContractError("rol de unidad no reconocido", `${path}.unidad_rol`);
    }
    assertReference(item.criterio_id, frameworkContext.criterionIds, `${path}.criterio_id`);
    requireString(item.eje, `${path}.eje`);
    requireString(item.formato_estimulo, `${path}.formato_estimulo`);
    if (!["aprobado_piloto", "pendiente_revision_docente", "revisado_docente"].includes(item.estado_revision)) {
      throw new ContractError("estado de revisión no reconocido", `${path}.estado_revision`);
    }
    requireString(item.enunciado, `${path}.enunciado`);
    const stimulus = requireObject(item.estimulo, `${path}.estimulo`);
    requireString(stimulus.tipo, `${path}.estimulo.tipo`);
    requireString(stimulus.texto_alternativo, `${path}.estimulo.texto_alternativo`);
    if (stimulus.tipo === "texto") {
      requireString(stimulus.texto, `${path}.estimulo.texto`);
    } else if (stimulus.tipo === "tabla") {
      const columns = requireArray(stimulus.columnas, `${path}.estimulo.columnas`, 1);
      columns.forEach((column, columnIndex) => requireString(column, `${path}.estimulo.columnas[${columnIndex}]`));
      requireArray(stimulus.filas, `${path}.estimulo.filas`, 1).forEach((row, rowIndex) => {
        if (!Array.isArray(row) || row.length !== columns.length) throw new ContractError("fila con cantidad de celdas incoherente", `${path}.estimulo.filas[${rowIndex}]`);
        row.forEach((cell, cellIndex) => {
          if (typeof cell !== "string" && typeof cell !== "number") throw new ContractError("celda debe ser texto o número", `${path}.estimulo.filas[${rowIndex}][${cellIndex}]`);
        });
      });
    } else if (["secuencia", "diagrama"].includes(stimulus.tipo)) {
      requireArray(stimulus.pasos, `${path}.estimulo.pasos`, 1).forEach((step, stepIndex) => requireString(step, `${path}.estimulo.pasos[${stepIndex}]`));
    } else if (stimulus.tipo === "grafico_barras") {
      const categories = requireArray(stimulus.categorias, `${path}.estimulo.categorias`, 1);
      categories.forEach((category, categoryIndex) => requireString(category, `${path}.estimulo.categorias[${categoryIndex}]`));
      requireArray(stimulus.series, `${path}.estimulo.series`, 1).forEach((series, seriesIndex) => {
        requireString(series?.nombre, `${path}.estimulo.series[${seriesIndex}].nombre`);
        if (!Array.isArray(series?.valores) || series.valores.length !== categories.length || series.valores.some((value) => !Number.isFinite(value))) {
          throw new ContractError("serie numérica incoherente con las categorías", `${path}.estimulo.series[${seriesIndex}].valores`);
        }
      });
    } else if (stimulus.tipo === "grafico_lineas") {
      const xAxis = requireObject(stimulus.eje_x, `${path}.estimulo.eje_x`);
      const yAxis = requireObject(stimulus.eje_y, `${path}.estimulo.eje_y`);
      for (const [axis, axisPath] of [[xAxis, `${path}.estimulo.eje_x`], [yAxis, `${path}.estimulo.eje_y`]]) {
        requireString(axis.etiqueta, `${axisPath}.etiqueta`);
        if (!Number.isFinite(axis.min) || !Number.isFinite(axis.max) || axis.min >= axis.max) {
          throw new ContractError("rango de eje inválido", axisPath);
        }
        requireArray(axis.marcas, `${axisPath}.marcas`, 2).forEach((mark, markIndex) => {
          if (!Number.isFinite(mark) || mark < axis.min || mark > axis.max) throw new ContractError("marca fuera del rango", `${axisPath}.marcas[${markIndex}]`);
        });
      }
      requireArray(stimulus.puntos, `${path}.estimulo.puntos`, 2).forEach((point, pointIndex) => {
        if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new ContractError("punto inválido", `${path}.estimulo.puntos[${pointIndex}]`);
        if (point.x < xAxis.min || point.x > xAxis.max || point.y < yAxis.min || point.y > yAxis.max) {
          throw new ContractError("punto fuera del rango de los ejes", `${path}.estimulo.puntos[${pointIndex}]`);
        }
      });
    } else {
      throw new ContractError(`tipo no soportado: ${stimulus.tipo}`, `${path}.estimulo.tipo`);
    }
    const alternatives = requireArray(item.alternativas, `${path}.alternativas`, 2);
    const alternativeIds = unique(alternatives.map((alternative, alternativeIndex) => {
      requireString(alternative.id, `${path}.alternativas[${alternativeIndex}].id`);
      requireString(alternative.texto, `${path}.alternativas[${alternativeIndex}].texto`);
      requireString(alternative.diagnostico, `${path}.alternativas[${alternativeIndex}].diagnostico`);
      return alternative.id;
    }), `${path}.alternativas`);
    assertReference(item.clave, alternativeIds, `${path}.clave`);
    if (!["ok", "discutible"].includes(item.estado_clave)) throw new ContractError("estado de clave no reconocido", `${path}.estado_clave`);
    return `${item.item_id}@${item.version}`;
  }), "bank.items");
  return { bank, itemKeys, items };
}

export function assertSession(session, frameworkContext, bankContext) {
  requireObject(session, "session");
  if (session.schema_version !== 1) throw new ContractError("schema_version no compatible", "session.schema_version");
  requireString(session.plantilla_id, "session.plantilla_id");
  requireString(session.version, "session.version");
  requireString(session.tipo, "session.tipo");
  if (session.marco_id !== frameworkContext.framework.marco_id || session.marco_version !== frameworkContext.framework.version) {
    throw new ContractError("la sesión apunta a otro marco", "session");
  }
  if (session.banco_id !== bankContext.bank.banco_id || session.banco_version !== bankContext.bank.version) {
    throw new ContractError("la sesión apunta a otro banco", "session");
  }
  const refs = requireArray(session.items, "session.items", 1);
  unique(refs.map((ref, index) => {
    requireString(ref.item_id, `session.items[${index}].item_id`);
    requireString(ref.item_version, `session.items[${index}].item_version`);
    const key = `${ref.item_id}@${ref.item_version}`;
    assertReference(key, bankContext.itemKeys, `session.items[${index}]`);
    if (ref.orden !== index + 1) throw new ContractError("el orden debe ser correlativo y comenzar en 1", `session.items[${index}].orden`);
    return key;
  }), "session.items");
  const rules = requireObject(session.reglas, "session.reglas");
  for (const key of ["orden_fijo", "permite_retroceso", "muestra_feedback", "permite_omitir"]) {
    requireBoolean(rules[key], `session.reglas.${key}`);
  }
  if (!Number.isInteger(rules.maximo_zonas_foco) || rules.maximo_zonas_foco !== 1) {
    throw new ContractError("esta interfaz admite exactamente una zona de foco", "session.reglas.maximo_zonas_foco");
  }
  const quickRules = frameworkContext.framework.mapa_evidencia.respuestas_rapidas;
  if (quickRules && ![quickRules.sesion_ancla, quickRules.modo_autonomo].includes(rules.tratamiento_respuestas_rapidas)) {
    throw new ContractError("tratamiento de respuestas rápidas no reconocido", "session.reglas.tratamiento_respuestas_rapidas");
  }
  if (session.perfil_evidencia_id !== frameworkContext.framework.mapa_evidencia.perfil_id) {
    throw new ContractError("perfil de evidencia inexistente", "session.perfil_evidencia_id");
  }
  const evidenceStateIds = new Set(frameworkContext.framework.mapa_evidencia.estados.map((state) => state.id));
  requireArray(session.orden_foco_estados, "session.orden_foco_estados", 1).forEach((stateId, index) => {
    assertReference(stateId, evidenceStateIds, `session.orden_foco_estados[${index}]`);
  });
  return { session, refs };
}

export function assertDeployment(deployment, sessionContext) {
  requireObject(deployment, "deployment");
  if (deployment.schema_version !== 1) throw new ContractError("schema_version no compatible", "deployment.schema_version");
  requireString(deployment.deployment_id, "deployment.deployment_id");
  requireString(deployment.version, "deployment.version");
  if (!["placeholder", "pilot", "archived"].includes(deployment.release_status)) throw new ContractError("estado de publicación no reconocido", "deployment.release_status");
  requireBoolean(deployment.pilot_ready, "deployment.pilot_ready");
  const administration = requireObject(deployment.administracion, "deployment.administracion");
  requireString(administration.administracion_id, "deployment.administracion.administracion_id");
  if (administration.plantilla_id !== sessionContext.session.plantilla_id || administration.plantilla_version !== sessionContext.session.version) {
    throw new ContractError("la administración apunta a otra plantilla", "deployment.administracion");
  }
  const ui = requireObject(deployment.ui, "deployment.ui");
  for (const key of ["marca", "titulo", "subtitulo", "bienvenida", "duracion_humana"]) requireString(ui[key], `deployment.ui.${key}`);
  const enrollment = requireObject(deployment.enrolamiento, "deployment.enrolamiento");
  requireString(enrollment.alfabeto, "deployment.enrolamiento.alfabeto");
  if (new Set(enrollment.alfabeto).size !== enrollment.alfabeto.length) throw new ContractError("el alfabeto contiene caracteres repetidos", "deployment.enrolamiento.alfabeto");
  if (!Number.isInteger(enrollment.longitud_carga) || enrollment.longitud_carga < 3) throw new ContractError("longitud inválida", "deployment.enrolamiento.longitud_carga");
  if (!Number.isInteger(enrollment.multiplicador) || enrollment.multiplicador < 2) throw new ContractError("multiplicador inválido", "deployment.enrolamiento.multiplicador");
  requireArray(enrollment.grupos, "deployment.enrolamiento.grupos", 1).forEach((size, index) => {
    if (!Number.isInteger(size) || size < 1) throw new ContractError("tamaño de grupo inválido", `deployment.enrolamiento.grupos[${index}]`);
  });
  requireArray(enrollment.hashes_permitidos, "deployment.enrolamiento.hashes_permitidos");
  if (enrollment.hashes_permitidos.length !== 0) {
    throw new ContractError("la pertenencia de cohorte solo puede validarse en el backend; esta lista debe permanecer vacía", "deployment.enrolamiento.hashes_permitidos");
  }
  requireArray(enrollment.hashes_demo, "deployment.enrolamiento.hashes_demo");
  const enrollmentHashes = [...enrollment.hashes_permitidos, ...enrollment.hashes_demo];
  enrollmentHashes.forEach((hash, index) => {
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) throw new ContractError("hash SHA-256 inválido", `deployment.enrolamiento.hashes[${index}]`);
  });
  unique(enrollmentHashes, "deployment.enrolamiento.hashes");
  if (enrollment.grupos.reduce((total, size) => total + size, 0) !== enrollment.longitud_carga + 1) {
    throw new ContractError("los grupos no coinciden con la carga y el dígito verificador", "deployment.enrolamiento.grupos");
  }
  if (/[0O1IL]/.test(enrollment.alfabeto)) {
    throw new ContractError("el alfabeto contiene caracteres ambiguos", "deployment.enrolamiento.alfabeto");
  }
  const backend = requireObject(deployment.backend, "deployment.backend");
  requireBoolean(backend.enabled, "deployment.backend.enabled");
  if (backend.enabled) {
    requireString(backend.url, "deployment.backend.url");
    if (!isValidSupabaseBackendUrl(backend.url)) throw new ContractError("se esperaba una URL HTTPS de proyecto Supabase", "deployment.backend.url");
    requireString(backend.publishable_key, "deployment.backend.publishable_key");
    if (!isPlausibleSupabasePublishableKey(backend.publishable_key)) throw new ContractError("clave publicable de Supabase no reconocible", "deployment.backend.publishable_key");
    requireString(backend.enrollment_rpc_name, "deployment.backend.enrollment_rpc_name");
    requireString(backend.rpc_name, "deployment.backend.rpc_name");
    requireString(backend.schema, "deployment.backend.schema");
  }
  const operation = requireObject(deployment.operacion, "deployment.operacion");
  if (typeof operation.url_publica !== "string") {
    throw new ContractError("se esperaba texto", "deployment.operacion.url_publica");
  }
  const publicUrl = operation.url_publica.trim();
  if (publicUrl !== "") {
    try {
      if (new URL(publicUrl).protocol !== "https:") throw new Error("protocol");
    } catch {
      throw new ContractError("se esperaba una URL HTTPS absoluta o un valor vacío", "deployment.operacion.url_publica");
    }
  }
  const releaseGates = requireObject(deployment.release_gates, "deployment.release_gates");
  for (const id of RELEASE_GATE_IDS) requireBoolean(releaseGates[id], `deployment.release_gates.${id}`);
  return { deployment };
}

export function assertBundle(bundle) {
  const framework = assertFramework(bundle.framework);
  const bank = assertBank(bundle.bank, framework);
  const session = assertSession(bundle.session, framework, bank);
  const deployment = assertDeployment(bundle.deployment, session);
  return { ...bundle, contexts: { framework, bank, session, deployment } };
}

export function flattenCriteria(framework) {
  return framework.habilidades.flatMap((ability) => ability.criterios.map((criterion) => ({ ...criterion, habilidad_id: ability.id })));
}

export function flattenUnits(framework) {
  return framework.areas.flatMap((area) => area.unidades.map((unit) => ({ ...unit, area_id: area.id, eje: area.eje })));
}
