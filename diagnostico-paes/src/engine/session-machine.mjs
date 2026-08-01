export function newAttempt({ deployment, session, framework }, enrollmentCode, { now = () => new Date().toISOString(), uuid = () => crypto.randomUUID() } = {}) {
  return {
    attempt_id: uuid(),
    administration_id: deployment.administracion.administracion_id,
    session_template_id: session.plantilla_id,
    session_version: session.version,
    framework_id: framework.marco_id,
    framework_version: framework.version,
    enrollment_code: enrollmentCode,
    status: "instructions",
    position: 0,
    started_at: null,
    completed_at: null,
    sync_status: "not_queued",
    created_at: now(),
    updated_at: now(),
  };
}

export function beginAttempt(attempt, now = () => new Date().toISOString()) {
  if (attempt.status !== "instructions") throw new Error("La sesión no puede comenzar desde su estado actual");
  const timestamp = now();
  return { ...attempt, status: "in_progress", started_at: timestamp, updated_at: timestamp };
}

export function createRawResponse(attempt, item, order, selectedOption, responseTimeMs, { now = () => new Date().toISOString(), uuid = () => crypto.randomUUID(), source = "device" } = {}) {
  if (selectedOption !== null && !item.alternativas.some((alternative) => alternative.id === selectedOption)) {
    throw new Error("La alternativa no pertenece al ítem");
  }
  if (!Number.isFinite(responseTimeMs) || responseTimeMs < 0) throw new Error("El tiempo de respuesta es inválido");
  return {
    response_id: uuid(),
    attempt_id: attempt.attempt_id,
    administration_id: attempt.administration_id,
    session_template_id: attempt.session_template_id,
    session_version: attempt.session_version,
    framework_id: attempt.framework_id,
    framework_version: attempt.framework_version,
    item_id: item.item_id,
    item_version: item.version,
    selected_option: selectedOption,
    omitted: selectedOption === null,
    response_time_ms: Math.round(responseTimeMs),
    presentation_order: order,
    client_recorded_at: now(),
    source,
  };
}

export function advanceAttempt(attempt, itemCount, now = () => new Date().toISOString()) {
  if (attempt.status !== "in_progress") throw new Error("La sesión no está en curso");
  const nextPosition = attempt.position + 1;
  const timestamp = now();
  if (nextPosition >= itemCount) {
    return { ...attempt, position: itemCount, status: "completed", completed_at: timestamp, sync_status: "pending", updated_at: timestamp };
  }
  return { ...attempt, position: nextPosition, updated_at: timestamp };
}

export function assertAttemptComplete(attempt, responses, itemCount) {
  if (attempt.status !== "completed" && attempt.status !== "synced") throw new Error("La sesión aún no está terminada");
  if (responses.length !== itemCount) throw new Error(`La sesión debe contener ${itemCount} respuestas crudas`);
  const orders = new Set(responses.map((response) => response.presentation_order));
  if (orders.size !== itemCount) throw new Error("Las respuestas contienen órdenes repetidos");
  return true;
}
