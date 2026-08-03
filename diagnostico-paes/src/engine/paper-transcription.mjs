export function buildPaperSubmission(bundle, enrollmentCode, selections, appliedAt, {
  now = () => new Date().toISOString(),
  uuid = () => crypto.randomUUID(),
} = {}) {
  const items = bundle.session.items.map((reference) => {
    const item = bundle.bank.items.find((candidate) => candidate.item_id === reference.item_id && candidate.version === reference.item_version);
    if (!item) throw new Error(`No se encontró el ítem en la posición ${reference.orden}`);
    return { ...item, orden: reference.orden };
  }).sort((left, right) => left.orden - right.orden);

  if (!Array.isArray(selections) || selections.length !== items.length) {
    throw new Error(`La transcripción debe contener ${items.length} respuestas`);
  }
  const completedAt = new Date(appliedAt);
  if (Number.isNaN(completedAt.valueOf())) throw new Error("La fecha de aplicación no es válida");
  const recordedAt = now();
  const attemptId = uuid();
  const attempt = {
    attempt_id: attemptId,
    administration_id: bundle.deployment.administracion.administracion_id,
    session_template_id: bundle.session.plantilla_id,
    session_version: bundle.session.version,
    framework_id: bundle.framework.marco_id,
    framework_version: bundle.framework.version,
    enrollment_code: enrollmentCode,
    enrollment_status: "provisional",
    status: "completed",
    position: items.length,
    started_at: null,
    completed_at: completedAt.toISOString(),
    sync_status: "manual_backup",
    created_at: recordedAt,
    updated_at: recordedAt,
  };
  const responses = items.map((item, index) => {
    const selectedOption = selections[index];
    if (selectedOption !== null && !item.alternativas.some((alternative) => alternative.id === selectedOption)) {
      throw new Error(`La respuesta del ítem ${index + 1} no pertenece a sus alternativas`);
    }
    return {
      response_id: uuid(),
      attempt_id: attemptId,
      administration_id: attempt.administration_id,
      session_template_id: attempt.session_template_id,
      session_version: attempt.session_version,
      framework_id: attempt.framework_id,
      framework_version: attempt.framework_version,
      item_id: item.item_id,
      item_version: item.version,
      selected_option: selectedOption,
      omitted: selectedOption === null,
      response_time_ms: null,
      presentation_order: index + 1,
      client_recorded_at: recordedAt,
      source: "paper",
    };
  });
  return { attempt, responses };
}
