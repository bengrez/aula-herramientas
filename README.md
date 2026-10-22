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
  Bienestar y Salud (III° B medio, Cs. Ciudadanía, Unidad 4). Cuestionario de 24 preguntas en 6
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

## Aparte: apoyo escolar en inglés

Recursos para acompañar estudios de secundaria en Australia (Year 8). No forman parte del trabajo
de aula del IDE; se listan separados para no mezclarlos.

- [`black-death-skills-lab/`](black-death-skills-lab/) — *The Black Death: a historian's skills
  lab* (Year 8 HASS, History). Worksheet en inglés australiano con cuatro fuentes (mapa de
  propagación 1347–1353, crónica de Henry Knighton c. 1390, población de Inglaterra 1290–1522,
  G. M. Trevelyan 1942), diez preguntas en cuatro bloques y tres herramientas del historiador
  reutilizables; definiciones al pasar el mouse y glosario impreso. Se completa junto a un adulto;
  la última página (en español) es para el adulto y está oculta por defecto (tecla N).
  Autocontenido, sin dependencias externas. Las respuestas escritas se guardan sólo en
  `localStorage` del navegador; no envía datos.

## El hub (`index.html`)

Página de entrada con el lenguaje visual de https://bengrez.github.io (papel y tinta, claro y oscuro, la misma clave `tema` del
navegador) y una ficha «Para / Entrena» por herramienta. El fondo es una **red de conceptos que crece como una raíz y aprende**, dibujada en un canvas
(bloque `RED-CONCEPTOS-START … END` del propio `index.html`, sin dependencias ni llamadas externas). Las fuentes del sitio (Bricolage Grotesque, Source Serif 4 e IBM Plex Mono) están en `fuentes/` como WOFF2 con subconjunto latino y su licencia OFL; no se pide nada a Google Fonts:

- **Crece como la raíz de la página principal** (`quimiotaxis.js`, iteración 043): nace arriba, en el margen izquierdo, centrada entre el borde
  de la ventana y la columna de texto, y baja por colonización del espacio (atractores, puntas que compiten, gravitropismo en el eje y
  plagiotropismo en las laterales). Cada punta que avanza **descubre un concepto**: el eje es una cadena de prerrequisitos (flecha) y las
  laterales brotan de él como relaciones (punteadas); algunas relaciones cruzadas cierran la red. La raíz vive siempre en el margen, sin velo sobre
  el texto: la columna es la del sitio (72 rem) y, si el margen natural queda bajo `--riel` (de 7 rem en el celular a 11,5 rem), el CSS corre el texto lo justo para
  dar ese ancho (`.pagina`). Así los nombres caben y se leen también en pantallas angostas (en el celular se parten en dos líneas).
- **Nodos** = conceptos de ciencias del currículum escolar (biología, química, física; incluyen los temas de las herramientas), con su nombre
  al lado. Cada disciplina tiene un tono (derivado del acento del tema) y una forma (círculo, hexágono, triángulo). Los conceptos están en el
  arreglo `C` al comienzo del bloque (`[id, etiqueta, disciplina, padre, tipo, rol, prioridad]`) y las relaciones cruzadas en `EX`.
- **Aprende:** una punta crece desde su prerrequisito (si está a la vista) y al llegar deja el concepto; si la luz del cursor (o del dedo) se
  queda cerca ≥ 0,9 s se **repasa** (la memoria vuelve a 1 y su estabilidad crece, más cuanto más se había olvidado); sin repaso se
  **olvida** (≈ 45 s). Los vínculos repasados duran más. Tono pleno y aro = consolidado.
- **Feeling del sitio:** luz con borde difuso y estela de ≈ 1,5 s; con el scroll quieto 4 s el tiempo baja un 40 %.
- **Celular:** el toque hace de cursor, 20 conceptos como tope (28 en tablet, 38 en escritorio) y 30 cuadros por segundo como máximo.
  Con la pestaña oculta o con el botón «Pausar fondo» no dibuja. Con `prefers-reduced-motion` muestra un estado final fijo.
- **Sin texto al pasar el cursor:** el nodo sólo se resalta (la luz lo agranda y lo hace más opaco); no hay línea ni cuadro que lo describa. La alternativa
  accesible es la lista plegada «Conceptos y relaciones de la red» (`#red-lista`). La red no se guarda entre visitas (sin `localStorage`; ése sólo guarda el tema).
- **Herramienta ↔ conceptos:** al pasar el cursor por una tarjeta (o enfocarla con el teclado, o apoyar el dedo en ella) se iluminan en la red los conceptos que
  esa herramienta trabaja y los vínculos entre ellos, y el resto se atenúa; al salir, vuelve. Sin texto nuevo. Lo enfocado se muestra aunque la red lo hubiera
  olvidado, sin contar como repaso. En pantallas táctiles, donde un toque abre la herramienta, además se ilumina la que está en la línea de lectura (45 % del alto)
  mientras te desplazas. **El mapeo está en un solo archivo, `datos/herramienta-conceptos.js`** (herramienta → ids de conceptos, con el criterio de cada una);
  `node tests/mapeo.mjs` comprueba que sus ids existan en `C` y que cada tarjeta (`data-herr`) tenga entrada.
- Para pruebas: `window.redConceptos` (`estado()`, `avanzar(seg)`, `apuntar(x, y)`, `soltar()`, `costoMs()`, `desglose()`, `rotulos()`, `llenar(luz)`, `pausa(b)`, `enfocar(id)`).

Cada herramienta trae un enlace «← Herramientas de aula» al principio y un pie con él. En `diagnostico-paes/` (PWA con service worker y CSP que no admite estilos
en línea) el estilo está en `src/styles.css` y se subió `CACHE_VERSION` en `sw.js` para que el modo sin conexión recoja el cambio. Las imágenes de `img/` son copias de las del sitio personal.

## Convención

Cada herramienta vive en su propia carpeta y se enlaza desde este README y desde `index.html`.
Debe poder publicarse como archivos estáticos sin un paso de compilación; puede ser autocontenida o
usar módulos y datos locales cuando eso facilite versionado, pruebas y funcionamiento offline.
