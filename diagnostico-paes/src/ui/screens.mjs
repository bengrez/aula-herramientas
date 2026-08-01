import { element, clear, focusHeading } from "./dom.mjs";
import { renderStimulus } from "./stimulus-renderers.mjs";

function card(eyebrow, title, children = []) {
  const section = element("section", { className: "screen-card" });
  section.append(
    element("p", { className: "eyebrow", text: eyebrow }),
    element("h1", { text: title }),
    ...children.filter(Boolean),
  );
  return section;
}

function mount(root, node) {
  clear(root).append(node);
  root.setAttribute("aria-busy", "false");
  focusHeading(root);
}

export function renderWelcome(root, bundle, { demo, hasProfile, offlineReady, releaseReady, onStart }) {
  const ui = bundle.deployment.ui;
  const facts = element("div", { className: "fact-strip" }, [
    element("div", {}, [element("strong", { text: ui.duracion_humana }), element("span", { text: "duración aproximada" })]),
    element("div", {}, [element("strong", { text: `${bundle.session.items.length} recorridos` }), element("span", { text: "uno por pantalla" })]),
    element("div", {}, [element("strong", { text: offlineReady ? "Listo sin red" : "Modo offline no disponible" }), element("span", { text: "el avance queda en este teléfono" })]),
  ]);
  const children = [
    element("p", { className: "lede", text: ui.subtitulo }),
    element("p", { text: ui.bienvenida }),
    element("div", { className: "hero-rule" }, [element("strong", { text: "∅" }), element("span", { text: "No hay nota ni comparación con otras personas. El mapa final habla de evidencia, no de puntajes." })]),
    facts,
    element("p", { className: "field-help", text: ui.privacidad_breve }),
  ];

  if (!releaseReady && !demo) {
    children.push(element("div", { className: "release-gate" }, [
      element("strong", { text: "Versión técnica — aplicación real bloqueada" }),
      element("span", { text: ui.aviso_placeholder }),
      element("div", { className: "button-row" }, [
        element("a", { className: "secondary-button", href: "?demo=1", text: "Abrir demostración técnica" }),
        element("a", { className: "quiet-button", href: "./print.html", text: "Revisar versión imprimible" }),
        element("a", { className: "quiet-button", href: "./access.html?demo=1", text: "Revisar hoja de acceso" }),
      ]),
    ]));
  } else if (!offlineReady && !demo) {
    children.push(element("div", { className: "notice", dataset: { kind: "error" }, role: "alert" }, [
      element("span", { className: "notice-icon", text: "!", "aria-hidden": "true" }),
      element("p", {}, [
        element("strong", { text: "No comiences en este teléfono. " }),
        document.createTextNode("No fue posible preparar el funcionamiento sin conexión. Recarga una vez; si el mensaje continúa, usa la versión en papel o avisa al adulto a cargo."),
      ]),
    ]));
    children.push(element("div", { className: "button-row" }, [
      element("button", { className: "secondary-button", type: "button", text: "Recargar y comprobar", onclick: () => location.reload() }),
      element("a", { className: "quiet-button", href: "./print.html", text: "Usar versión en papel" }),
    ]));
  } else {
    children.push(element("div", { className: "button-row" }, [
      element("button", { className: "primary-button", type: "button", text: hasProfile ? "Continuar con mi código" : "Comenzar", onclick: onStart }),
      element("a", { className: "quiet-button", href: "./print.html", text: "Necesito la versión en papel" }),
    ]));
    if (demo) children.push(element("div", { className: "notice", dataset: { kind: offlineReady ? "success" : "error" } }, [
      element("span", { className: "notice-icon", text: offlineReady ? "◇" : "!", "aria-hidden": "true" }),
      element("p", { text: `${offlineReady ? "Modo demostración." : "Demostración sin garantía offline."} Código de prueba: ${bundle.deployment.enrolamiento.codigo_demo_visible}` }),
    ]));
  }
  mount(root, card(ui.etiqueta_sesion, ui.titulo, children));
}

export function renderEnrollment(root, bundle, { demo, onSubmit }) {
  const input = element("input", {
    className: "code-input",
    id: "enrollment-code",
    name: "code",
    type: "text",
    inputMode: "text",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: false,
    maxlength: 14,
    required: true,
    "aria-describedby": "code-help code-error",
  });
  if (demo) input.value = bundle.deployment.enrolamiento.codigo_demo_visible;
  const error = element("p", { className: "field-error", id: "code-error", role: "alert" });
  const submit = element("button", { className: "primary-button", type: "submit", text: "Guardar código y continuar" });
  const form = element("form", { className: "enrollment-form" }, [
    element("label", { htmlFor: "enrollment-code", text: "Tu código personal" }),
    input,
    element("p", { className: "field-help", id: "code-help", text: "Está en tu tarjeta. No distingue mayúsculas y puedes escribirlo con o sin guiones." }),
    error,
    element("div", { className: "button-row" }, submit),
  ]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    error.textContent = "";
    try {
      const result = await onSubmit(input.value);
      if (!result.ok) {
        error.textContent = result.reason;
        input.focus();
      }
    } finally {
      submit.disabled = false;
    }
  });
  mount(root, card("Paso 1 de 2", "Identifica tu recorrido", [
    element("p", { className: "lede", text: "El código permite reconocer tu sesión sin usar tu nombre, correo ni RUN." }),
    form,
  ]));
  input.focus();
}

export function renderInstructions(root, bundle, onBegin) {
  const list = element("ol", { className: "instruction-list" });
  bundle.deployment.ui.instrucciones.forEach((instruction, index) => {
    list.append(element("li", {}, [element("strong", { text: index + 1 }), element("span", { text: instruction })]));
  });
  mount(root, card("Paso 2 de 2", "Antes de empezar", [
    element("p", { className: "lede", text: "Cuando presiones comenzar, el primer estímulo aparecerá de inmediato. No hay reloj visible." }),
    list,
    element("div", { className: "notice" }, [element("span", { className: "notice-icon", text: "!" }), element("p", { text: "No cierres la pestaña al terminar. Espera hasta ver el mapa y el estado del respaldo." })]),
    element("div", { className: "button-row" }, element("button", { className: "primary-button", type: "button", text: "Comenzar recorrido", onclick: onBegin })),
  ]));
}

export function renderItem(root, item, { position, total, onAnswer }) {
  const progressBlock = element("div", { className: "progress-block", dataset: { focusTarget: "true" }, "aria-label": `${position} de ${total} recorridos completados` }, [
    element("div", { className: "progress-copy" }, [element("span", { text: `Recorrido ${position + 1} de ${total}` }), element("span", { text: "cobertura, no aciertos" })]),
    element("progress", { className: "progress-track", max: total, value: position, "aria-label": `${position} de ${total} recorridos completados` }),
  ]);
  const meta = element("div", { className: "item-meta" }, [element("span", { text: item.eje }), element("span", { text: item.formato_estimulo.replaceAll("_", " ") })]);
  const fieldset = element("fieldset", { className: "alternatives" });
  fieldset.append(element("legend", { className: "visually-hidden", text: "Elige una alternativa" }));
  const inputs = [];
  for (const alternative of item.alternativas) {
    const id = `option-${position}-${alternative.id}`;
    const input = element("input", { id, type: "radio", name: "answer", value: alternative.id });
    const label = element("label", { htmlFor: id }, [element("span", { className: "alternative-key", text: alternative.id }), element("span", { text: alternative.texto })]);
    fieldset.append(element("div", { className: "alternative" }, [input, label]));
    inputs.push(input);
  }
  const omit = element("input", { id: `omit-${position}`, type: "checkbox" });
  const continueButton = element("button", { className: "primary-button", type: "button", text: position + 1 === total ? "Terminar y ver mi mapa" : "Guardar y continuar", disabled: true });
  const update = () => {
    const selected = inputs.find((input) => input.checked);
    continueButton.disabled = !selected && !omit.checked;
  };
  inputs.forEach((input) => input.addEventListener("change", () => { omit.checked = false; update(); }));
  omit.addEventListener("change", () => { if (omit.checked) inputs.forEach((input) => { input.checked = false; }); update(); });
  continueButton.addEventListener("click", async () => {
    continueButton.disabled = true;
    const selected = inputs.find((input) => input.checked)?.value ?? null;
    await onAnswer(selected);
  });

  const section = element("section", { className: "screen-card" }, [
    progressBlock,
    meta,
    renderStimulus(item.estimulo),
    element("h1", { className: "question-text", text: item.enunciado }),
    fieldset,
    element("div", { className: "omit-row" }, element("label", { htmlFor: omit.id }, [omit, element("span", { text: "Prefiero dejarla sin responder" })])),
    element("div", { className: "button-row" }, continueButton),
  ]);
  mount(root, section);
}

export function renderMap(root, map, bundle, { syncState, backupCode, onCopyBackup, onDownloadBackup, onRetrySync, onPurgeLocal, qrCanvas }) {
  const list = element("ol", { className: "map-list" });
  for (const zone of map.zones) {
    list.append(element("li", { className: "map-zone", dataset: { state: zone.state_id, symbol: zone.state.simbolo } }, [
      element("div", {}, [
        element("h2", { text: zone.label }),
        element("p", { text: `${zone.state.etiqueta}. ${zone.state.descripcion}` }),
      ]),
    ]));
  }

  const focus = map.focus ? element("section", { className: "focus-card" }, [
    element("p", { className: "eyebrow", text: "Un lugar donde vale la pena mirar" }),
    element("h2", { text: map.focus.label }),
    element("p", { text: "No es una sentencia ni una nota. Es una buena candidata para una práctica breve y guiada." }),
  ]) : element("section", { className: "focus-card" }, [
    element("p", { className: "eyebrow", text: "Próximo paso" }),
    element("h2", { text: "Reunir un poco más de evidencia" }),
    element("p", { text: "Con esta pasada no aparece una zona única para priorizar. Eso también es información útil." }),
  ]);

  const pendingList = element("ul", { className: "pending-list" }, map.pending.map((zone) => element("li", {
    className: "pending-zone",
    dataset: { symbol: zone.state.simbolo },
  }, [
    element("span", { className: "pending-symbol", text: zone.state.simbolo, "aria-hidden": "true" }),
    element("div", {}, [
      element("h3", { text: zone.label }),
      element("p", { text: "Aún no explorada en esta sesión." }),
    ]),
  ])));
  const pending = element("section", { className: "pending-territory" }, [
    element("h2", { text: "Territorio pendiente" }),
    element("p", { text: "Estas zonas quedan grises porque la sesión breve no reunió evidencia sobre ellas, no porque estén mal." }),
    pendingList,
  ]);

  const stateCopy = {
    synced: ["✓", "Respaldo enviado", "La copia en la nube fue recibida. Tu mapa sigue calculándose desde las respuestas guardadas en este teléfono."],
    syncing: ["↻", "Enviando respaldo", "Mantén esta pestaña abierta unos segundos."],
    pending: ["!", "Respaldo pendiente", "Tus respuestas están seguras en este teléfono. Puedes reintentar o guardar el código manual."],
    offline: ["⌁", "Sin conexión", "Tus respuestas están en este teléfono y se intentarán enviar al recuperar conexión."],
    manual: ["◇", "Respaldo manual disponible", "La conexión a la nube aún no está configurada. Guarda el código o su QR."],
  }[syncState.state] ?? ["…", "Comprobando respaldo", "Espera un momento."];

  const syncPanel = element("section", { className: "sync-panel", "aria-live": "polite" }, [
    element("div", { className: "sync-state" }, [element("strong", { text: stateCopy[0], "aria-hidden": "true" }), element("div", {}, [element("strong", { text: stateCopy[1] }), element("p", { text: stateCopy[2] })])]),
  ]);
  if (["pending", "offline"].includes(syncState.state) && bundle.deployment.backend.enabled) {
    syncPanel.append(element("button", { className: "secondary-button", type: "button", text: "Reintentar ahora", onclick: onRetrySync }));
  }

  const backupPanel = element("section", { className: "backup-panel" }, [
    element("h2", { text: "Respaldo manual" }),
    element("p", { className: "field-help", text: "Si el envío no se confirma, muestra este QR o entrega el código al adulto a cargo. No contiene tu nombre." }),
    element("div", { className: "backup-grid" }, [
      element("div", {}, [
        element("code", { className: "backup-code", text: backupCode }),
        element("div", { className: "backup-actions" }, [
          element("button", { className: "secondary-button", type: "button", text: "Copiar código", onclick: onCopyBackup }),
          element("button", { className: "quiet-button", type: "button", text: "Descargar .txt", onclick: onDownloadBackup }),
        ]),
      ]),
      qrCanvas,
    ]),
  ]);

  const cleanupPanel = syncState.state === "synced" && onPurgeLocal ? element("section", { className: "cleanup-panel" }, [
    element("h2", { text: "Cerrar este teléfono" }),
    element("p", { className: "field-help", text: "Como el respaldo ya fue recibido, puedes borrar de este teléfono el código, las respuestas y el mapa. La entrega en la nube no se elimina y este recorrido no podrá repetirse aquí." }),
    element("button", { className: "quiet-button", type: "button", text: "Borrar copia de este teléfono", onclick: onPurgeLocal }),
  ]) : null;

  mount(root, card("Recorrido terminado", "Este es tu mapa de hoy", [
    element("p", { className: "lede map-intro", text: "Las zonas aparecen ordenadas por la consistencia de la evidencia disponible. No son una calificación y pueden cambiar con nuevas tareas." }),
    list,
    focus,
    pending,
    syncPanel,
    backupPanel,
    cleanupPanel,
  ]));
}

export function renderClosed(root, bundle) {
  mount(root, card(bundle.deployment.ui.etiqueta_sesion, "Este recorrido ya fue entregado", [
    element("p", { className: "lede", text: "La copia detallada de este teléfono fue borrada después de confirmar el respaldo. Aquí queda solo una marca de cierre para evitar repetir la sesión." }),
    element("div", { className: "notice", dataset: { kind: "success" } }, [
      element("span", { className: "notice-icon", text: "✓", "aria-hidden": "true" }),
      element("p", { text: "No necesitas hacer nada más. Si tienes una duda, avisa al adulto a cargo." }),
    ]),
  ]));
}

export function renderFatal(root, error) {
  mount(root, card("No pudimos abrir el recorrido", "Hace falta revisar esta versión", [
    element("p", { className: "lede", text: "Tus datos locales no se borraron. Cierra esta pestaña y avisa al adulto a cargo." }),
    element("div", { className: "notice", dataset: { kind: "error" } }, [element("span", { className: "notice-icon", text: "!" }), element("p", { text: error?.message ?? "Error inesperado" })]),
    element("div", { className: "button-row" }, element("button", { className: "secondary-button", type: "button", text: "Intentar de nuevo", onclick: () => location.reload() })),
  ]));
}
