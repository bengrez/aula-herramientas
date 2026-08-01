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

## Convención

Cada herramienta vive en su propia carpeta y se enlaza desde este README y desde `index.html`.
Debe poder publicarse como archivos estáticos sin un paso de compilación; puede ser autocontenida o
usar módulos y datos locales cuando eso facilite versionado, pruebas y funcionamiento offline.
