# Diagramas de mitosis y meiosis en la práctica unificada

Entrega local 2026-09-07. **Borrador: dos SVG y cuatro preguntas, sin aprobación docente.**
No se modificó `data/active.json`, no se habilitó Supabase y no se publicó.

## Inspección

Con `npm run serve`, abrir `http://127.0.0.1:4173/practice/?demo=1`. La portada reúne las 14
preguntas base y las cuatro visuales en una biblioteca de 18 preguntas y 14 unidades. Explica
el recorrido, muestra progreso y permite reanudar una tanda pendiente. Si había una versión
anterior abierta, recargar tras la actualización del service worker.

La tanda que combina unidades comienza con un diagrama, incluso si esas unidades ya se han
practicado. Al elegir una unidad concreta se respeta ese filtro: algunas unidades no tienen
figuras. La casilla «Solo preguntas con diagrama» de la portada (antes el acceso «Practicar con
diagramas») ofrece una pregunta por cada uno de los dos dibujos.
Dos tandas visuales permiten recorrer las cuatro preguntas: la selección prefiere las variantes
menos vistas y nunca repite una misma figura dentro de la tanda. Una pregunta sobre una figura ya
vista no es evidencia independiente de dominio; el feedback puede facilitar variantes futuras.
No es todavía un generador automático de preguntas bajo demanda.

El enlace histórico `/practice/?demo=1&visual=1` es compatible y abre la misma portada. El perfil
separado `:demo:visual` pertenece al piloto anterior: al abrir la demo se copia su historial al
perfil común `:demo`, sin borrar el origen ni duplicar tandas al recargar. Si una tanda ya existe
en el destino, se conserva esa versión para no revertir respuestas más recientes. Las respuestas
parciales cuentan en el cuaderno; una tanda solo aparece completada al terminar su último feedback.

## Recursos y claves de autoría

| Recurso original | Modelo | Preguntas |
|---|---|---|
| `assets/figures/mitosis.v1.svg` | Célula inicialmente 2n=4, cuatro paneles desordenados. A: metafase, B: telofase/citocinesis en curso, C: profase, D: anafase. | PV-MI-01: orden C-A-D-B (clave A). PV-MI-02: separación de cromátidas hermanas (clave B). |
| `assets/figures/meiosis.v1.svg` | P: anafase I, dos cromosomas duplicados hacia cada polo. Q: anafase II de UNA célula, dos cromosomas simples hacia cada polo. | PV-ME-01: identificación I/II (clave C). PV-ME-02: dos cromosomas de dos/una cromátidas respectivamente por polo (clave D). |

Los dibujos son originales, no recortes editoriales ni micrografías. Se usan trazo liso/punteado
y color para distinguir homólogos, longitudes distintas para los dos pares y puntos centroméricos.
Las letras se generan como texto SVG separado de las formas. Los nombres de fases no se imprimen
en los paneles. Se conserva la figura durante el feedback, con la interpretación en texto.

Simplificaciones explícitas: no están a escala; en la fase final de mitosis el material se mantiene
individualizado para seguirlo; en meiosis se omite el entrecruzamiento. No inferir de Q que todas
las cromátidas hermanas son siempre idénticas ni que ambas células de meiosis II están dibujadas.

Fundamento conceptual contrastado con [OpenStax: ciclo celular](https://openstax.org/books/biology-2e/pages/10-2-the-cell-cycle)
y [meiosis](https://openstax.org/books/biology-2e/pages/11-1-the-process-of-meiosis).
La revisión docente debe comprobar legibilidad, validez de distractores y equivalencia de la
descripción accesible, además de los conteos. La validación técnica no es validación psicométrica.

## Archivos e integración

- `tools/division-figures.mjs`: fuente determinista de los dos SVG; las pruebas comparan los
  resultados generados con los archivos estáticos y verifican conteos por panel.
- `data/figures.json`: catálogo con identificador, versión, procedencia, fuente científica,
  descripción equivalente, invariantes y preguntas asociadas.
- `data/paes-ciencias-2027/bank-visual-division.v0.json`: cuatro ítems; deja intactos los 14 previos.
- `contracts.mjs`, `stimulus-format.mjs`, `stimulus-renderers.mjs`: tipo `figura`, ruta SVG local
  restringida, imagen, región desplazable, descripción accesible y aviso de carga fallida.
- `practice-selector.mjs`, `practice.mjs`: revisión de figura separada de revisión de pregunta;
  máximo una pregunta por figura en cada tanda y rotación de variantes. Banco y figuras siguen pendientes.
- `practice-library.mjs`: combinación en memoria de ambos bancos, progreso y copia del perfil histórico.
- `practice/app.mjs`, `practice/landing.mjs`, `practice/practice.css`, `screens.mjs`: portada
  compartida, navegación a la práctica y feedback visual.
- `data/practice.json`, `practice/sw.js`: recursos offline y nueva versión de caché, sin backend.
- `tests/contracts/visual-figures.test.mjs`, `tests/unit/stimulus-format.test.mjs`,
  `tests/browser/practice-offline.mjs`: contratos y cobertura visual/offline.

## Verificación

El piloto inicial pasó 93/93 pruebas y nueve escenarios de navegador. La **baseline de la
continuación de la portada** pasa 102/102 unitarias y contratos, 122 comprobaciones de preflight,
13 escenarios Chromium y 13 grupos PostgreSQL de práctica. El navegador cubre diagramas desde
la primera tanda combinada, cuatro variantes en dos tandas visuales, progreso compartido, copia
del perfil histórico, recarga offline y SVG en emulación móvil sin desborde de página.

### Validación final de la continuación

Resultado final: **102/102** unitarias/contratos, **122** comprobaciones de preflight, **14**
escenarios Chromium y **13** grupos PostgreSQL de práctica. La regresión adicional comprueba que
«Saltar al contenido» conserva la pregunta y la alternativa seleccionada. Portada inspeccionada
en escritorio y móvil emulado. Ver [entrega de práctica](practice-handoff.md). Capturas locales en
`output/playwright/`, ignoradas por Git. No se aplicaron cambios a Supabase ni se publicaron
recursos. Readiness sigue **NO-GO 2/12**; estas pruebas no aprueban preguntas ni figuras.
