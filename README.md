# aula-herramientas

Herramientas HTML interactivas para uso en clase — autocontenidas, sin backend, sin envío ni
almacenamiento de datos (todo el cálculo ocurre en el navegador del estudiante).

Publicado con GitHub Pages: https://bengrez.github.io/aula-herramientas/

## Herramientas

- [`autodiagnostico-bienestar-salud/`](autodiagnostico-bienestar-salud/) — Autodiagnóstico de
  Bienestar y Salud (III° B medio, Cs. Ciudadanía, Unidad 4). Cuestionario de 24 preguntas en 6
  bloques, semáforo de resultado, sin envío de datos.
- [`tabla-periodica-reactiva/`](tabla-periodica-reactiva/) — Tabla periódica reactiva, Imán y
  Escudo (8° Básico, Química, Guía N° 3). Explora tendencias por posición, compara dos elementos y
  predice el tipo de enlace, practica con preguntas al azar. Los datos de los 118 elementos viven en
  `elementos.js`, separados del `index.html`.

## Convención

Cada herramienta nueva vive en su propia carpeta con un `index.html` autocontenido (CSS y JS
inline, sin dependencias externas), enlazada desde este README y desde `index.html` (landing page
raíz).
