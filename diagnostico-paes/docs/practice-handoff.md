# Práctica repetida — entrega local 2026-09-07

Estado: **NO-GO para estudiantes y publicación**. Desarrollo local autorizado; no se aplicó
ninguna migración a Supabase, no se publicaron cambios ni se hicieron commits. `data/active.json`
sigue intacto en el diagnóstico. No se consultaron ni usaron nóminas o ledgers reales.

## Qué quedó implementado

- Entrada separada `practice/`; demostración explícita `practice/?demo=1`, sin llamadas externas.
  Entrada normal cerrada por readiness. La portada conserva la identidad Atlas y explica el
  recorrido: elegir una tanda, responder con explicación inmediata y volver al cuaderno.
- Biblioteca unificada de 18 preguntas en 14 unidades: 14 del banco base y cuatro sobre dos
  diagramas de mitosis/meiosis. Se combinan en memoria; los archivos fuente siguen separados.
  Todas las preguntas y ambas figuras permanecen pendientes de revisión docente.
- Selección determinista de hasta 3/5/10 preguntas sin reposición dentro de una tanda. Las tandas
  que combinan unidades empiezan con un diagrama y continúan priorizando unidades poco practicadas,
  con prioridad del marco como desempate. Elegir una unidad respeta ese filtro aunque no tenga
  figuras. El acceso «Practicar con diagramas» ofrece una pregunta por dibujo y rota variantes
  entre tandas. Bancos pequeños acortan tandas; no se repite una misma figura dentro de la tanda.
- IndexedDB de práctica independiente (`atlas-practice-v1`; demo `atlas-practice-demo-v1`),
  perfiles por scope+código hash, múltiples tandas y snapshots de ítems. Respuesta y estado de
  feedback se guardan en una transacción. Cambiar banco no reinterpreta el historial.
- La portada muestra respuestas, aciertos, unidades practicadas y tandas completadas en este
  dispositivo, con detalle por unidad. El progreso suma respuestas parciales no omitidas desde
  que se guardan; una tanda solo se completa al terminar su último feedback. Se puede volver al
  inicio y reanudar la tanda pendiente. Nunca se muestra nota, ranking, dominio ni puntaje PAES;
  omisiones no son errores. Las tandas pendientes conservan su UUID para reintentos.
- El enlace histórico `practice/?demo=1&visual=1` abre la misma portada. La demo copia el historial
  del antiguo perfil `:demo:visual` a `:demo`, conservando el origen y los snapshots. La copia es
  idempotente y los conjuntos ya presentes en el destino prevalecen para no revertir avances.
- Migración aditiva: scopes curso/período/marco, catálogo de unidades, códigos, bindings
  multidispositivo, agregado privado, recibos opacos. RPC cerrados; RLS y revocaciones explícitas.
  No se persisten respuestas individuales, ítems, alternativas ni tiempos en las tablas nuevas.
- Deltas idempotentes: UUID+hash, rechazo de payload diferente, suma transaccional concurrente.
  Snapshot de agregado+recibos+revisión evita duplicación por ACK perdido o instantánea antigua.
- Vista docente privada `private.practice_course_export_v1`: curso×período×marco×unidad, sin
  identidad individual. Uso administrativo puntual, nunca desde el navegador.
- Banco base de 14 ítems revisado técnicamente y corregido como borrador, sin aprobación
  automática: ver [revisión por ítem](practice-review.md). Los cuatro ítems visuales y sus dos
  dibujos tienen una [guía específica](visual-pilot.md); tampoco tienen aprobación docente.

## Cómo revisar y repetir las pruebas

Desde la carpeta de la app, `npm ci --ignore-scripts` instala solo dependencias de desarrollo;
no se necesitan dependencias externas en tiempo de ejecución. `npm run serve`, luego abrir
`http://127.0.0.1:4173/practice/?demo=1`. No ingresar códigos o datos reales.

### Baseline de la continuación de la portada

Estos resultados corresponden al estado recibido, antes de la regresión adicional de navegación
y del cierre documental de esta continuación. No son autorización de uso real.

| Comando | Resultado local de baseline |
|---|---|
| `npm test` | 102/102 unitarias y contratos, sin omisiones |
| `npm run validate` | 122 comprobaciones OK |
| `npm run validate:practice` | Contrato OK, 18 ítems; readiness NO-GO 2/12 |
| `npm run test:postgres:practice` | Contrato SQL histórico previo + 13 grupos de pruebas de práctica OK |
| `npm run test:offline:practice` | 13 escenarios Chromium OK, incluye portada, progreso compartido, copia del perfil visual, emulación móvil y subruta |
| `npm run release-check` | NO-GO diagnóstico; salida 1 esperada |
| `npm run release-check:practice` | NO-GO práctica; salida 1 esperada |

### Validación final de la continuación

Verificado el 2026-09-07: **102/102** pruebas unitarias/contratos, **122** comprobaciones de
preflight y **14** escenarios Chromium. PostgreSQL mantiene los **13** grupos aprobados en esta
continuación; no hubo cambios SQL posteriores. Ambos `release-check` conservan salida 1 esperada:
diagnóstico **NO-GO 7/15** y práctica **NO-GO 2/12**.

Se reprodujo y corrigió un defecto de teclado: «Saltar al contenido» cambiaba la ruta `#tanda`
y regresaba a la portada. Ahora enfoca el contenido sin abandonar la pregunta ni perder la
alternativa seleccionada; el escenario adicional lo verifica. La práctica muestra «Pregunta N
de M» y «Tu tanda de práctica» en su indicador de avance. Caché offline: `2026-09-07.8-home`.

Portada inspeccionada visualmente en escritorio y móvil emulado; `git diff --check` sin errores.
El cierre y los pendientes quedan en el handoff **044** del proyecto documental `IDE/docencia_2026`.
Lint del proyecto documental: 6 OK, 1 advertencia preexistente por `COMO-PUBLICAR.md`, 0 fallos.
Las capturas siguen en `output/playwright/`; estas pruebas no equivalen a validación en teléfono físico.

Como antecedente, la primera implementación partió de 73/73 pruebas y 110 comprobaciones;
la entrega de práctica pasó 88/88 y el piloto visual 93/93. Esta continuación conserva el trabajo
sin commit recibido, incluida la portada y la biblioteca unificada parcialmente desarrolladas.
La antigua expectativa de repetir un ítem varias veces dentro de la misma tanda se reemplazó
deliberadamente por selección sin reposición; se retiró la inferencia de dominio no calibrada.

El runner PostgreSQL usa `postgres:16-alpine` en Docker, sin puertos y con red deshabilitada,
datos exclusivamente sintéticos, espera `pg_isready -h 127.0.0.1` y elimina únicamente su contenedor temporal.
En una repetición se detectó que el servidor temporal de inicialización respondía por socket antes
de reiniciarse; la espera TCP distingue el servidor final y corrige esa carrera del harness.
Prueba concurrencia con 12 envíos: seis del mismo UUID y seis distintos; agregado final 16/8
incluyendo el envío previo, ocho recibos en total. Prueba conflicto idempotente, auth, scopes,
revocación, fecha, campos prohibidos, enteros, lectura de terceros y exportación cerrada.

El runner de navegador requiere Google Chrome, o `PAES_BROWSER_EXECUTABLE=/ruta/al/navegador`.
Verifica feedback y recarga offline, doble clic, múltiples tandas, omisiones, perfil aislado,
dos conexiones IndexedDB, conservación de un diagnóstico sintético y convivencia de service
workers en `/nested/site/`. También comprueba la primera figura de la tanda combinada, la rotación
de cuatro variantes visuales, el progreso común y la copia recuperable del antiguo perfil visual.
Capturas generadas en `output/playwright/` (ignoradas por Git).
No sustituye teléfono físico, Safari/iOS, prueba en sala ni validación de Supabase remoto.

## Decisiones y límites

ADR-0008 v0.3 sigue propuesto. El docente aprobó exportación privada, reutilización del proyecto
Supabase y ejecución local. **Siguen pendientes por decisión explícita el aviso a estudiantes y
apoderados y el procedimiento de retiro de información.** No se redactaron como si ya estuvieran
aprobados ni se envió aviso alguno.

Retención acordada: última semana de diciembre de 2026, límite 31-dic, `America/Santiago`.
No hay borrado programado ni procedimiento completo implementado. Debe abarcar ledger, agregado,
recibos, bindings/auth, respuestas locales, exportaciones y copias; la revocación técnica de código
no equivale a una eliminación. El dispositivo puede perder datos si el navegador borra su base.
El almacenamiento local aún conserva respuestas/snapshots: esto requiere tratamiento explícito
en aviso, retiro y cierre anual antes de uso real.

Riesgos abiertos: código durable como secreto, dispositivo compartido, cliente manipulable
(conteos formativos, no prueba segura), cuota de IndexedDB con historial largo, banco muy pequeño,
control antiabuso y límites de autenticación/enrolamiento remotos. La orientación oficial de
[Supabase sobre acceso anónimo](https://supabase.com/docs/guides/auth/auth-anonymous) recomienda
controles antiabuso; no se verificó su configuración remota ni se habilitó autenticación nueva.
El hash del recibo no convierte los datos en anónimos; el conjunto sigue siendo seudonimizado.

El cache de práctica es versionado y separado del diagnóstico. Al cambiar código/datos offline,
actualizar la versión en `practice/sw.js`, verificar un paquete completo y volver a probar
reanudación. Una copia cacheada no se puede revocar instantáneamente en un dispositivo sin red.

## Siguiente ejecución para Astra

1. Preservar el worktree; repetir las pruebas anteriores sobre el estado recibido.
2. Obtener revisión docente por ítem y resolver los dos pendientes del ADR. No convertir la
   corrección técnica ni esta entrega en aprobación docente o institucional.
3. Concretar/ensayar retención y retiro con datos sintéticos, incluyendo dispositivos y backups;
   registrar aceptación del ADR solo por instrucción docente.
4. Con autorización explícita para Supabase, inspeccionar estado/migraciones y respaldo del
   proyecto existente; aplicar aditiva, cargar catálogo y códigos de manera privada, configurar
   auth/límites y probar con dos dispositivos contra API real. No usar el seed de diagnóstico
   como catálogo de práctica ni exponer la vista docente por RPC público.
5. Validar teléfono físico offline, operación docente y entrega real. Registrar evidencia por gate.
6. Solo con TODOS los gates y autorización de publicación, integrar el manifiesto/entrada de
   práctica como producto activo, volver a probar y publicar. Este cambio deliberadamente no
   se implementó en `data/active.json` durante esta sesión.

## Inventario de archivos tocados en la app

- Configuración: `.gitignore`, `package.json`, `package-lock.json`, `README.md`, `data/practice.json`.
- Bancos y figuras: `data/paes-ciencias-2027/bank-practica-biologia.v0.json`,
  `data/paes-ciencias-2027/bank-visual-division.v0.json`, `data/figures.json`, `assets/figures/`.
- Entrada/UI: `practice/index.html`, `practice/app.mjs`, `practice/landing.mjs`,
  `practice/practice.css`, `practice/sw.js`, `src/ui/screens.mjs`, `src/ui/stimulus-renderers.mjs`.
- Motor: `src/engine/practice.mjs`, `src/engine/practice-selector.mjs`, `src/engine/progress.mjs`,
  `src/engine/practice-library.mjs`, `src/engine/contracts.mjs`, `src/engine/stimulus-format.mjs`.
- Infraestructura: `src/infra/practice-store.mjs`, `src/infra/practice-sync.mjs`,
  `src/infra/supabase-http.mjs` (prefijo de token opcional, conserva default diagnóstico).
- SQL: `supabase/migrations/202609070001_practice_aggregates.sql`.
- Pruebas: `tests/unit/practice-selector.test.mjs`, `tests/unit/progress.test.mjs`,
  `tests/unit/practice.test.mjs`, `tests/unit/practice-library.test.mjs`,
  `tests/unit/stimulus-format.test.mjs`, `tests/contracts/practice.test.mjs`,
  `tests/contracts/visual-figures.test.mjs`,
  `tests/browser/practice-offline.mjs`, `tools/test-practice-postgres.mjs`.
- Validación/documentación: `tools/practice-readiness.mjs`, `tools/division-figures.mjs`,
  `docs/practice-review.md`, `docs/visual-pilot.md`, este archivo.

Fuera de la app, en el vault: ADR-0008, addendum del handoff 041 y fila de `SESSION_LOG.md` de
`IDE/docencia_2026`. No se trasladó información privada de estudiantes al repositorio público.


## Continuación 2026-09-08 — experiencia del estudiante (portada, feedback en el lugar, avance vivo)

Objetivo del docente: simplificar el acceso a la información, acortar el camino hasta responder
y hacer que el avance sea dinámico y reactivo. El backend sigue postergado; todo es local.

Qué cambió (solo capa de práctica; el diagnóstico y el motor no se tocaron):

- `practice/landing.mjs` reescrita: un botón «Empezar · N preguntas» visible sin desplazarse
  (o «Continuar · pregunta k de N» / «Continuar · ver explicación pendiente» con tanda pendiente),
  chips 3/5/10, casilla «Solo preguntas con diagrama (2)», franja de avance con conteos (ids
  `progress-attempts`, `progress-correct`, `progress-units`, línea `progress-sets`) y lista por
  unidad agrupada por área del marco con una fila-botón «Practicar ›» por unidad. Sin hero, pasos,
  selects ni jerga (Supabase, banco, offline). Se eliminó la tarjeta de diagramas.
- `practice/question.mjs` (nuevo): pregunta con riel de nodos (`role=progressbar` +
  `aria-valuetext`), línea «Área › Unidad», feedback revelado en el mismo DOM (alternativas
  marcadas «Tu respuesta» / «Clave», panel con veredicto, razonamiento y línea «En esta tanda»),
  barra de acción pegada abajo que muta a «Siguiente pregunta» / «Terminar tanda». Omisión a un
  toque; con alternativa marcada pide «Confirmar sin responder» (sin temporizador). El mismo
  renderizador monta el estado revelado tras una recarga en `state: feedback`.
- `practice/summary.mjs` (nuevo): «Tanda terminada» con riel completo, conteos de la tanda,
  unidades tocadas y «Ahora llevas» con count-up; «Otra tanda igual» u «Otra tanda · todos los
  temas» según `hasFreshItems`. Vive en el hash `#fin` y se reconstruye desde el perfil al recargar.
- `practice/motion.mjs` (nuevo): count-up (valor final siempre presente para lectores de pantalla,
  `data-value` para pruebas), única región viva `#live`, `prefers-reduced-motion`.
- `practice/app.mjs`: vistas `home | practice | summary`; feedback sin re-render; opciones de
  cantidad/diagramas en `localStorage` y opciones de la última tanda en `sessionStorage`
  (nunca en el perfil de IndexedDB ni en el payload de sync); instantánea del acumulado en
  `sessionStorage` para el count-up; píldora de conexión en cuatro estados legibles; medición de
  la altura de la cabecera para la barra pegada.
- `src/engine/practice-summary.mjs` (nuevo, puro): `setSummary`, `unitProgressRows`,
  `setUnitRows`, `latestCompletedSet`, `resolvePracticeOptions`, `hasFreshItems`,
  `lastPracticedDay`, `describeDay`, `todayInSantiago`. `practice-selector.mjs` exporta
  `eligiblePracticeItems` (misma regla de elegibilidad que el selector).
- `practice/practice.css` reescrita; `practice/index.html` (aviso «Versión de revisión docente ·
  preguntas en revisión», `#live`); `practice/sw.js` caché `2026-09-08.1-flujo`;
  `data/practice.json` con los cuatro módulos nuevos en `offline_assets`.
- Pruebas: `tests/unit/practice-summary.test.mjs` (9) y `tests/browser/practice-offline.mjs`
  reescrito (17 escenarios: un toque a la primera pregunta, feedback en el lugar y persistencia
  offline, omisión con confirmación, resumen y `#fin` tras recarga, tanda por unidad, opciones
  recordadas, móvil sin desborde con barra visible, más los invariantes previos: IndexedDB
  transaccional, sin peticiones externas, piloto visual, coexistencia de service workers, copia
  del perfil histórico).

Verificación local del 2026-09-08: `npm test` 111/111; `npm run validate` 125 comprobaciones;
`npm run test:offline:practice` 17 escenarios Chromium 151; `npm run validate:practice` sigue
NO-GO 2/12 (esperado). Sin commits, sin publicación, sin Supabase, sin datos reales.

Decisiones de diseño registradas (panel de tres propuestas y dos jueces, ver handoff 045 de
`IDE/docencia_2026`): confirmación explícita «Comprobar» en vez de responder al tocar (respuesta
irreversible y alternativas largas); sin cascarón persistente (cada pregunta se monta desde el
perfil, el feedback se parchea en el lugar); sin hileras de puntos coloreados por unidad (leídas
en conjunto funcionan como semáforo de dominio, contrario a ADR-0008); figura conserva el
desplazamiento horizontal con borde desvanecido (ajustarla al ancho la hacía ilegible a 360px).

## Continuación 2026-09-09 — resiliencia frente al plan gratuito de Supabase

Destino de despliegue fijado por el docente: GitHub Pages con un proyecto Supabase de plan
gratuito. Eso deja el contenido y las claves de las preguntas públicos por construcción, y trae dos
restricciones que no son de capacidad sino de disponibilidad: el proyecto se pausa tras una semana
de poca actividad y no hay respaldos automáticos ni recuperación a un punto en el tiempo.

- `src/engine/progress.mjs`: `accumulatedProgress` usa lo ya respaldado por este dispositivo como
  piso por unidad. Antes, una instantánea remota más pobre (pérdida en el servidor) hacía
  desaparecer del cuaderno las tandas ya reconocidas, que nunca se reenvían. Ahora el remoto sólo
  gana cuando es mayor, que es el caso normal porque suma todos los dispositivos. Dos pruebas
  nuevas cubren instantánea vacía e instantánea parcial con tanda pendiente encima.
- `.github/workflows/supabase-keepalive.yml` (raíz del repositorio, nuevo): latido diario que
  ejecuta el mismo ingreso anónimo que hace la app, marcado con `keepalive` en la metadata del
  usuario. No requiere función nueva ni relaja `supabase/tests/schema-contract.sql`, que prohíbe
  que el rol sin autenticar ejecute cualquier función de `api`. Se salta si no hay secretos
  configurados y falla a propósito si el proyecto no responde, de modo que sirve de monitor.
- `src/infra/supabase-http.mjs`: toda llamada lleva ahora un límite de tiempo (15 s por defecto,
  ajustable con `timeout_ms`, desactivable con `0`) y el aborto se traduce a «el servidor no
  respondió a tiempo». Sin esto, un proyecto pausado o una red lenta dejaban la interfaz esperando
  sin explicación. Alcanza también al diagnóstico, que comparte el cliente.
- No se incorporó Turnstile pese a que Supabase lo recomienda para ingresos anónimos: exigiría
  abrir `script-src` en la misma pantalla donde se responde. Si aparece abuso, el enrolamiento se
  aísla en su propia entrada HTML con su propia cabecera, como ya hacen `access.html` y `paper.html`.

Verificación 2026-09-09: `npm test` 117/117, `npm run validate` 125 comprobaciones,
`npm run test:offline:practice` 17 escenarios Chromium 151, `npm run test:postgres:practice`
13 grupos. Sin commits, sin publicación y sin tocar Supabase.

Advertencia para el procedimiento de eliminación: la limpieza genérica de usuarios anónimos de más
de treinta días que sugiere Supabase invalidaría la sesión de un estudiante que no haya practicado
en ese plazo. Debe distinguir los usuarios de latido de los de estudiantes.


## Modo invitado — decisión del docente del 2026-09-09

El docente eligió que **el código sea opcional**: la app se abre practicando y el código sirve para
llevar el avance a otro teléfono, no para entrar. Con eso, una pausa del proyecto gratuito o una
caída de red dejan de impedir que un estudiante responda preguntas.

- `practice/app.mjs`: la entrada real ya no pide código. Abre el cuaderno local
  `<scope>:invitado` y muestra la portada. La pantalla del código pasó a ser una acción de la
  portada («Guardar mi avance en otro teléfono») con salida «Ahora no».
- Al asociar el código, `connect()` enrola contra `enroll_practice_v1`, incorpora las tandas del
  cuaderno de invitado al del estudiante y sincroniza desde ahí. **El cuaderno de invitado no se
  borra**: si algo falla, sus tandas siguen en el teléfono. Repetir la operación no duplica nada.
- `sync()` exige que exista cliente, así que **el cuaderno de invitado nunca sale del dispositivo**.
  Un escenario de navegador lo verifica declarando un backend inexistente y comprobando que no se
  hace ninguna petición fuera del sitio.
- `src/engine/practice-library.mjs`: `mergeProfiles(target, source)` generaliza lo que ya hacía
  `mergeDemoProfiles`, que ahora es un envoltorio suyo. El destino manda ante el mismo
  identificador y el origen queda intacto.
- El portón de revisión docente **no cambia**: mientras `practiceReadiness` no pase, la entrada
  real sigue bloqueada. El modo invitado decide la identidad, no el acceso al contenido.
- `src/infra/supabase-http.mjs`: los fallos de transporte se traducen («no hay conexión con el
  servidor», «el servidor no respondió a tiempo») conservando el original como `cause`. Antes el
  estudiante veía «Failed to fetch».

Cobertura nueva en `tests/browser/practice-offline.mjs`: el servidor de pruebas puede sustituir
documentos, así que ahora se ejercita la entrada real con todos los gates cerrados. Tres escenarios:
se entra practicando sin pedir código, el código es opcional y posponerlo no pierde avance, y el
cuaderno de invitado no contacta al backend.

Verificación 2026-09-09: `npm test` 120/120, `npm run validate` 125 comprobaciones,
`npm run test:offline:practice` 20 escenarios Chromium 151. Caché `2026-09-09.2-invitado`.
Sin commits, sin publicación y sin tocar Supabase.

Lo que el modo invitado cuesta, y que el docente aceptó: **quien no ingrese código no aparece en la
vista agregada del curso**. La cobertura de esa vista pasa a ser voluntaria.

## Agregado ampliado 2026-09-09 — omisiones y tandas terminadas

Decisión del docente: el servidor guarda dos conteos más. Registrada en ADR-0008 revisión 0.4, que
sigue `proposed`. Ningún dato de mayor granularidad viaja: siguen sin salir ítem, alternativa y
tiempo por respuesta.

**Omisiones por unidad.** Columna `omitted` en `private.practice_progress`, en su propia dimensión:
nunca sumada a intentos ni a errores. `practiceDelta` deja de descartar las respuestas sin
contestar y las agrupa aparte, de modo que una unidad puede aparecer con `attempts: 0` y
`omitted: 3`. La validación cambió en consecuencia y en ambos lados a la vez: una unidad es válida
si `attempts + omitted` está entre 1 y 50, y ese mismo total acota el payload completo. La regla de
fecha: `last_practiced_on` avanza sólo con respuestas contestadas; si una unidad quedó entera sin
responder se usa el día en que se vio, que es el único disponible.

**Tandas terminadas.** No hay columna nueva. Cada tanda terminada ya dejaba exactamente un recibo
idempotente en `private.practice_receipts`, así que `get_practice_progress_v1` devuelve
`sets_completed` contándolos. Un reenvío no puede inflarlo porque el recibo es idempotente por
`batch_id`. El cliente lo guarda como `remote_sets` y `practiceOverview.completed` aplica el mismo
piso local que el agregado por unidad: lo respaldado por este aparato nunca se olvida, y las tandas
aún sin respaldar se suman aparte.

**Exportación docente.** `private.practice_course_export_v1` agrega `students`
(participantes distintos con avance en esa unidad), `active_codes` (denominador del curso) y
`omitted`. Todo derivado de lo ya almacenado: sin datos nuevos. Sin `students`, cuarenta intentos en
una unidad no distinguían un estudiante que insistió de veinte que pasaron una vez, que es
exactamente la diferencia que cambia la decisión de aula.

**En pantalla.** Las omisiones aparecen por unidad en la portada («2 aciertos de 3 respuestas · 1
sin responder») y en el resumen de cada tanda. No se agregó un cuarto contador acumulado al riel de
la portada: un total de omisiones a la vista permanente se lee como reproche y ADR-0008 es explícito
en que una omisión no es un error.

Verificación 2026-09-09: `npm test` 121/121, `npm run validate` 125 comprobaciones,
`npm run test:offline:practice` 20 escenarios Chromium 151, `npm run test:postgres:practice`
14 grupos en PostgreSQL 16. Sin commits, sin publicación y sin tocar Supabase.


## Revisión adversarial del contrato — 2026-09-09

Cinco lentes independientes sobre el cambio y tres refutadores por hallazgo, 107 agentes sin caídas.
Veintiséis hallazgos sobrevivieron a la refutación y se agrupaban en ocho defectos distintos, casi
todos introducidos ese mismo día. Todos corregidos:

- **El enrolamiento no sobrevivía a la recarga** (grave). `init()` fijaba el cuaderno de invitado sin
  condición, así que tras cerrar la pestaña el estudiante volvía a ver «Guardar mi avance», sus
  contadores caían y lo que practicara dejaba de respaldarse. Ahora el cuaderno asociado se recuerda
  en `localStorage`, se reabre sin red —la sesión anónima ya vive bajo esa clave— y «Cerrar cuaderno»
  es la única forma de volver al de invitado.
- **El cuaderno de invitado se fusionaba en todo código posterior** (grave). En un teléfono compartido,
  la práctica de un estudiante se atribuía también al siguiente que asociara su código, y la
  exportación docente sumaba dos veces las mismas tandas. Ahora, al asociar el código, las tandas
  traspasadas se retiran del cuaderno de invitado.
- **Una tanda rechazada bloqueaba la cola para siempre** (grave). El bucle lanzaba al primer rechazo y
  cada reintento volvía a empezar por la misma tanda, así que ninguna posterior se respaldaba. Ahora
  se intentan todas, la instantánea concilia igual y el fallo se reporta al final.
- **`connect()` creaba una cuenta anónima antes de validar el código.** Un tipeo dejaba un usuario
  permanente en Auth y devolvía el texto crudo `not_authorized`. Ahora se comprueban forma y dígito
  verificador en el teléfono antes de tocar el servidor, con `enrollment` declarado en el manifiesto.
- **El piso local se elegía por fila entera**, lo que podía bajar `attempts` por debajo de lo que el
  servidor acababa de informar, justo en el caso que pretendía proteger. Ahora se aplica contador a
  contador.
- **El denominador de la exportación mezclaba ámbitos.** Contaba códigos de cualquier ámbito con el
  mismo curso y período, incluidos los deshabilitados o vencidos. Ahora se acota a los ámbitos que
  componen la fila y aplica las mismas puertas de vigencia que el enrolamiento.
- **`sets_completed` podía inflarse con envíos sin unidades.** Cliente y servidor rechazan ahora un
  envío de cero unidades: una tanda terminada siempre tocó alguna.
- **El contrato de esquema no cubría la superficie nueva.** Su lista blanca nombraba funciones por
  firma, así que no podía ejecutarse antes de que existieran, y el arnés lo esquivaba corriéndolo
  antes de la migración de práctica. Ahora compara por nombre y se ejecuta también con todo aplicado.

Se unificó además la regla de fecha: `last_practiced_on` significa «la última vez que viste este
tema» y avanza con cualquier respuesta, contestada u omitida. Antes el cliente y el servidor la
definían distinto y el mismo hecho cambiaba de fecha al sincronizar.

Queda una limitación conocida y documentada, no un defecto de implementación: el `payload_hash` de
los recibos es un hash de un espacio pequeño de valores posibles, así que con acceso a la base se
podría reconstruir por fuerza bruta el desglose por tanda. El comentario de la tabla y ADR-0008 lo
dicen ahora explícitamente; el recibo debe borrarse junto con el agregado.

Verificación final 2026-09-09: `npm test` 122/122, `npm run validate` 125 comprobaciones,
`npm run test:offline:practice` 24 escenarios Chromium 151, `npm run test:postgres:practice`
17 grupos en PostgreSQL 16. Caché `2026-09-09.4-revision`.
