# clase-covid-presentacion

Presentación de la clase «Dos países frente al COVID-19» (16 láminas) en **un solo archivo**: `../index.html`. ES5, sin CDN, sin red, sin guardar datos.

## Cómo se usa

- Flechas, espacio, Re Pág / Av Pág, clic o toque: avanzar y retroceder (el tercio izquierdo de la pantalla retrocede). Inicio y Fin saltan a la primera y a la última.
- `F`: pantalla completa (la barra de abajo se esconde y reaparece al mover el mouse). `I`: índice de láminas. `Esc`: cierra el índice.
- La lámina 7 (los 5 supuestos) revela uno por cada avance; al retroceder los esconde de a uno. Las demás láminas no tienen pasos.
- El escenario es de 1920 × 1080 y se escala a la ventana (con barras oscuras si la proporción no es 16:9). Cada lámina trae su propio contador «n / 16».
- Las animaciones (láminas 3, 4 y 6) y los relojes (láminas 2 y 13) son `iframe` con `sandbox="allow-scripts"` y `srcdoc`. Solo corren en la lámina visible y
  arrancan de cero cada vez que se entra a ella. Los relojes usan la hora de Chile (America/Santiago) y suponen que la clase parte a las 8:30.
- Fuente: pila `'DM Sans', Arial, sans-serif`. No se carga desde Google Fonts: DM Sans se usa solo si el equipo la tiene instalada.

## Cómo se genera

`node datos/convertir.mjs <carpeta project>` (la carpeta trae `deck.json` y `slides/*.html`, las láminas originales de Claude Slides) arma `index.html` con
`datos/cascaron.html`. Las láminas originales **no** están en el repo porque traen notas del docente (`<aside>`) con lecturas de datos por par; el conversor las quita.
Cambios que hace: `<x-embed>` → `iframe`; `<x-shape kind="ellipse">` → círculo; `<x-icon name="Play">` → triángulo SVG; `data-build-in="rise N"` → paso N;
y en la portada «Piena en unaposible hipótesis» → «Escribe tu hipótesis en la hoja del grupo».
Para cambiar un texto basta editar `index.html` a mano: es el archivo publicado.
