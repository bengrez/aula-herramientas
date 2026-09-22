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

## Convención

Cada herramienta vive en su propia carpeta y se enlaza desde este README y desde `index.html`.
Debe poder publicarse como archivos estáticos sin un paso de compilación; puede ser autocontenida o
usar módulos y datos locales cuando eso facilite versionado, pruebas y funcionamiento offline.
