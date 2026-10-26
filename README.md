# aula-herramientas

Herramientas web estáticas para uso en clase. Cada carpeta documenta por separado su tratamiento
de datos; las herramientas existentes que no lo indiquen trabajan solo en el navegador.

Publicado con GitHub Pages: https://bengrez.github.io/aula-herramientas/

## Herramientas

- [`diagnostico-paes/`](diagnostico-paes/) — Atlas, diagnóstico formativo PAES Ciencias. PWA
  offline-first con sesión versionada, mapa cualitativo, impresión y recuperación CSV. La versión
  preparada actualmente es una demostración técnica bloqueada: los ítems son de relleno y no debe
  aplicarse a estudiantes. Su backend Supabase opcional todavía no está configurado.
- [`autodiagnostico-bienestar-salud/`](autodiagnostico-bienestar-salud/) — Autodiagnóstico de
  Bienestar y Salud (III° medio, Cs. Ciudadanía, Unidad 4). Cuestionario de 24 preguntas en 6
  bloques, semáforo de resultado, sin envío de datos.
- [`tabla-periodica-reactiva/`](tabla-periodica-reactiva/) — Tabla periódica reactiva, Imán y
  Escudo (8° Básico, Química, Guía N° 3). Explora tendencias por posición, compara dos elementos y
  predice el tipo de enlace, practica con preguntas al azar. Los datos de los 118 elementos viven en
  `elementos.js`, separados del `index.html`.
- [`vacunas-rebano/`](vacunas-rebano/) — Vacunas e inmunidad de rebaño (Cs. para la Ciudadanía,
  IV° medio, Bienestar y Salud). Página de lectura vertical para el celular, con el umbral
  `1 − 1/R₀`, un simulador animado de dos casos (cobertura alta y baja, 100 personas, contagio al
  azar) y una comparación de países con datos reales de COVID-19 de 2020 a 2022 (muertes en exceso,
  vacunación completa y rigurosidad de las medidas), que se reproduce mes a mes. Autocontenida, sin
  dependencias externas, sin envío ni almacenamiento de datos. Los datos vienen de Our World in Data
  (CC BY 4.0); `datos/construir_datos.py` los reduce desde el CSV original. Las cifras de
  la tabla de R₀ del sarampión son de libro; falta contrastarlas con fuentes oficiales.

- [`covid-mapa/`](covid-mapa/) — Mapa de la pandemia (Cs. para la Ciudadanía, IV° medio, Bienestar y
  salud). Mapa animado de 12 países con datos reales de COVID-19 de 2020 a 2022 (exceso de muertes del
  mes y vacunación completa), dos pares para comparar con un hilo de cinco
  pasos (predice, observa por hitos, contrasta, causas alternativas, concluye con límites), y una
  presentación de 12 láminas. Cada página es un solo archivo sin dependencias externas, sin envío ni
  almacenamiento de datos; hay copias `sin-conexion`. Funciona en computador (mouse y teclado) y en
  celular. Datos de Our World in Data (CC BY 4.0); contornos de Natural Earth mediante world-atlas
  (ISC). `datos/LEEME.md` explica cómo se generan los datos, la geometría y los enlaces por par.

- [`clase-covid-presentacion/`](clase-covid-presentacion/) — Presentación de la clase «Dos países frente al COVID-19» (Cs. para la
  Ciudadanía, IV° medio). 16 láminas de 1920 × 1080 que se escalan a la pantalla, con tres animaciones (R₀, inmunidad de rebaño, exceso del mes
  y acumulado), dos relojes con las etapas de la clase y los cinco supuestos del modelo, que aparecen de a uno. Flechas, espacio, Re Pág/Av Pág o
  clic para avanzar; `F` pantalla completa; `I` índice. Un solo archivo `index.html` sin dependencias externas ni almacenamiento de datos; las
  animaciones corren en `iframe` con `sandbox`. No incluye las notas del docente. La fuente DM Sans solo se usa si el equipo la tiene (si no, Arial).
  `datos/convertir.mjs` regenera el archivo desde las láminas originales.

## Aparte: material en inglés

Material en inglés, alineado al currículo australiano (Year 8). No forma parte del trabajo de aula;
se lista separado para no mezclarlo.

- [`black-death-skills-lab/`](black-death-skills-lab/) — *The Black Death: a historian's skills
  lab* (Year 8 HASS, History). Worksheet en inglés australiano con cuatro fuentes (mapa de
  propagación 1347–1353, crónica de Henry Knighton c. 1390, población de Inglaterra 1290–1522,
  G. M. Trevelyan 1942), diez preguntas en cuatro bloques y tres herramientas del historiador
  reutilizables; definiciones al pasar el mouse y glosario impreso. Se completa junto a un adulto;
  incluye una página de apoyo para el adulto, oculta por defecto (tecla N).
  Autocontenido, sin dependencias externas. Las respuestas escritas se guardan sólo en
  `localStorage` del navegador; no envía datos.

## El hub (`index.html`)

Página de entrada con el lenguaje visual de https://bengrez.github.io (papel y tinta, claro y oscuro, la misma clave `tema` del
navegador) y una ficha «Para / Entrena» por herramienta. A la izquierda vive una **red de temas**: una sola red conectada de 41 conceptos de ciencias,
agrupados en seis temas que son sus regiones (SVG creado por JS, bloque `RED-TEMAS-START … END` del propio `index.html`, sin dependencias ni llamadas externas).
Las fuentes del sitio (Bricolage Grotesque, Source Serif 4 e IBM Plex Mono) están en `fuentes/` como WOFF2 con subconjunto latino y su licencia OFL; no se pide nada a Google Fonts:

- **Una red, seis regiones:** los conceptos son nodos (todos un círculo) y las relaciones son aristas finas de un solo trazo. Los seis temas (Materia y átomos ·
  Energía y movimiento · Célula y cuerpo · Salud y epidemias · Datos y evidencia · Sociedad e historia) son regiones con su rótulo; los conceptos que unen dos
  temas son los puentes (sus aristas cruzan el borde). Un solo tono neutro para todo y el acento del tema sólo para lo enfocado; sin color ni forma por disciplina.
- **Herramienta → temas:** al pasar el cursor por una tarjeta (o enfocarla con el teclado) la red se **encuadra** en los temas que la herramienta trabaja (zoom y paneo
  suaves de ≈ 0,4 s), atenúa el resto y resalta sus conceptos, con su nombre, y las aristas entre ellos. Al salir vuelve a la vista completa.
- **Tema → herramientas:** al pasar el cursor (o el foco) por un tema se destacan sus tarjetas. Con clic o Enter el tema se abre: la red se encuadra en él y un panel
  lista sus conceptos agrupados y sus herramientas (con enlace). Escape cierra y devuelve el foco. Los temas son botones (`role="button"`, Tab y Enter) y la lista
  equivalente «Temas, conceptos y relaciones de la red» (`#red-lista`, plegada al final de la página) cubre a quien no ve la red.
- **El mapeo está en dos lugares, y los temas de cada herramienta se derivan:** `datos/herramienta-conceptos.js` (herramienta → ids de conceptos, con el criterio de cada una) y,
  en `index.html`, `TEMAS` (tema → grupos → conceptos), `C` (`[id, nombre, x, y, concepto del que sale la arista]`, con posiciones a mano) y `EX` (relaciones cruzadas).
  `node tests/mapeo.mjs` comprueba que cada concepto esté en un solo tema, que la red sea conexa, que cada tema tenga puentes, que las herramientas apunten a conceptos
  existentes y que cada tarjeta (`data-herr`) tenga entrada.
- **Celular (< 640 px):** sin red; sólo las tarjetas (y la lista equivalente, plegada). El texto recupera el ancho del margen (`--riel` vale 0). En tablet y escritorio el margen
  es `--riel` (`clamp(11rem, 26vw, 18rem)`) y la columna de texto se corre lo justo.
- **Sin animación propia:** sólo se mueve el encuadre, y sólo cuando el cursor o el foco cambian; con `prefers-reduced-motion` salta sin transición. Por eso no hay botón «Pausar».
- **Aislado para el diseño compartido:** el CSS de la red está en un bloque `/* RED-TEMAS */` que sólo usa los tokens de `:root` (`--bg --surface --ink --muted --rule --rule-strong --accent`);
  no hay colores en el JS, así que el tema oscuro funciona sólo con CSS.
- Para pruebas: `window.redTemas` (`estado()`, `herramienta(id|null)`, `tema(id|null)`, `abrir(id|null)`).

Cada herramienta trae un enlace «← Herramientas de aula» al principio y un pie con él. En `diagnostico-paes/` (PWA con service worker y CSP que no admite estilos
en línea) el estilo está en `src/styles.css` y se subió `CACHE_VERSION` en `sw.js` para que el modo sin conexión recoja el cambio. Las imágenes de `img/` son copias de las del sitio personal.

## Convención

Cada herramienta vive en su propia carpeta y se enlaza desde este README y desde `index.html`.
Debe poder publicarse como archivos estáticos sin un paso de compilación; puede ser autocontenida o
usar módulos y datos locales cuando eso facilite versionado, pruebas y funcionamiento offline.
