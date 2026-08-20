// Etiquetas de formato visibles para el estudiante.
//
// `formato_estimulo` del banco es un identificador de autoría —describe qué hace difícil al ítem—
// y por eso nunca puede llegar a la pantalla: anunciar el diseño convierte la tarea en lectura
// literal y el ítem deja de discriminar. Lo visible sale de esta lista cerrada, derivada del tipo
// de render y no del propósito del ítem.

export const PUBLIC_FORMAT_LABELS = Object.freeze({
  texto: "caso",
  tabla: "tabla",
  secuencia: "procedimiento",
  diagrama: "esquema",
  grafico_barras: "gráfico",
  grafico_lineas: "gráfico",
});

export function hasPublicFormatLabel(stimulusType) {
  return Object.prototype.hasOwnProperty.call(PUBLIC_FORMAT_LABELS, stimulusType);
}

export function publicFormatLabel(stimulus) {
  const label = PUBLIC_FORMAT_LABELS[stimulus?.tipo];
  if (!label) throw new Error(`No hay etiqueta pública para el estímulo “${stimulus?.tipo}”`);
  return label;
}
