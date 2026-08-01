export const RELEASE_GATE_IDS = Object.freeze([
  "contenido_real_revisado",
  "criterios_y_reglas_aprobados",
  "telefono_offline_validado",
  "qr_respaldo_validado",
  "impresion_validada",
  "operacion_sala_validada",
]);

export const BANK_AUTHORING_STATES = Object.freeze([
  "relleno_tecnico_no_aplicar",
  "contenido_docente_revisado",
]);

export function isValidSupabaseBackendUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && url.port === ""
      && url.pathname === "/"
      && url.search === ""
      && url.hash === ""
      && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname);
  } catch {
    return false;
  }
}

export function isPlausibleSupabasePublishableKey(value) {
  return typeof value === "string" && value.length >= 20 && !/\s/.test(value);
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && actual.every((value) => expected.includes(value));
}

export function assessReleaseReadiness(bundle) {
  const { bank, session, deployment } = bundle;
  const itemByKey = new Map(bank.items.map((item) => [`${item.item_id}@${item.version}`, item]));
  const selectedItems = session.items.map((ref) => itemByKey.get(`${ref.item_id}@${ref.item_version}`)).filter(Boolean);
  const expected = session.estructura_esperada ?? {};
  const expectedCriteria = Array.isArray(expected.criterios) ? expected.criterios : [];
  const expectedAxes = Array.isArray(expected.ejes) ? expected.ejes : [];
  const repetitions = expected.repeticiones_por_criterio;
  const groups = new Map(expectedCriteria.map((criterionId) => [criterionId, []]));
  for (const item of selectedItems) {
    if (groups.has(item.criterio_id)) groups.get(item.criterio_id).push(item);
  }

  const structureMatches = Number.isInteger(expected.cantidad_items)
    && selectedItems.length === expected.cantidad_items
    && Number.isInteger(repetitions)
    && expectedCriteria.length > 0
    && expectedAxes.length > 0
    && [...groups.values()].every((items) => (
      items.length === repetitions
      && sameMembers([...new Set(items.map((item) => item.eje))], expectedAxes)
      && new Set(items.map((item) => item.formato_estimulo)).size === repetitions
    ));

  const checks = [
    {
      id: "contenido_real",
      label: "El banco contiene contenido real revisado",
      passed: bank.estado_autoria === "contenido_docente_revisado",
    },
    {
      id: "estructura_sesion",
      label: "La sesión satisface su estructura diagnóstica declarada",
      passed: structureMatches,
    },
    {
      id: "claves_resueltas",
      label: "Todos los ítems activos tienen clave no discutible",
      passed: selectedItems.length > 0 && selectedItems.every((item) => item.estado_clave === "ok"),
    },
    {
      id: "flujo_medicion",
      label: "El flujo es fijo, sin retroceso ni feedback y permite omitir",
      passed: session.reglas?.orden_fijo === true
        && session.reglas?.permite_retroceso === false
        && session.reglas?.muestra_feedback === false
        && session.reglas?.permite_omitir === true,
    },
    {
      id: "url_publica",
      label: "La URL pública de entrega usa HTTPS",
      passed: (() => {
        try { return new URL(deployment.operacion?.url_publica).protocol === "https:"; }
        catch { return false; }
      })(),
    },
    {
      id: "backend_configurado",
      label: "El backend final está habilitado y configurado",
      passed: deployment.backend?.enabled === true
        && isValidSupabaseBackendUrl(deployment.backend.url)
        && isPlausibleSupabasePublishableKey(deployment.backend.publishable_key),
    },
    ...RELEASE_GATE_IDS.map((id) => ({
      id: `gate.${id}`,
      label: `Gate registrado: ${id.replaceAll("_", " ")}`,
      passed: deployment.release_gates?.[id] === true,
    })),
    {
      id: "estado_publicacion",
      label: "El despliegue está marcado como piloto",
      passed: deployment.release_status === "pilot",
    },
    {
      id: "pilot_ready",
      label: "La liberación coordinada está activada",
      passed: deployment.pilot_ready === true,
    },
  ];

  return {
    ready: checks.every((check) => check.passed),
    passed: checks.filter((check) => check.passed).length,
    total: checks.length,
    checks,
  };
}
