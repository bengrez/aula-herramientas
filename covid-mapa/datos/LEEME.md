# covid-mapa · datos y construcción

Mapa animado de 12 países con datos de COVID-19 de 2020 a 2022 (`../index.html`) y su presentación (`../presentacion.html`).
Cada página es **un solo archivo** (CSS, JS, geometría y datos en línea, ES5, sin CDN). Los archivos de esta carpeta son las fuentes
y los scripts que los arman; no se cargan en el navegador.

## Armado

```
node ensamblar.mjs                # mapa.fuente.html + geometria.json + serie.json + pares.json -> ../index.html y ../sin-conexion.html
node ensamblar_presentacion.mjs   # presentacion.fuente.html + pares.json + qrencode -> ../presentacion.html y ../presentacion-sin-conexion.html
```

`../sin-conexion.html` es una copia idéntica de `../index.html` y `../presentacion-sin-conexion.html` lo es de `../presentacion.html` (ya es autosuficiente): sirve para compartirla por WhatsApp, Drive o Bluetooth.
En Android se abre con Chrome; con el archivo recibido no se pueden agregar parámetros a la dirección, así que el par se elige con los botones de la lista.

## Datos (`serie.json`)

- Fuente: Our World in Data, «Coronavirus Pandemic (COVID-19)» (Mathieu, Ritchie, Rodés-Guirao et al.), licencia **CC BY 4.0**.
  Repositorio `owid/covid-19-data` congelado el **19 de agosto de 2024**.
- Serie mensual 2020-01 a 2022-12 de 12 países: `e` = muertes en exceso acumuladas por millón (último valor del mes; `null` si no hay),
  `v` = % con vacunación completa (último valor publicado hasta fin de mes; 0,0 antes del primero), `s` = rigurosidad de Oxford (promedio mensual). **Desde el 21-oct-2026 la rigurosidad no se usa ni se muestra** (confundía más de lo que ayudaba): `s` queda en `serie.json` por trazabilidad, pero `ensamblar.mjs` no la incluye en las páginas. El mapa tiene dos capas (exceso del mes y % con vacunación completa).
- `extraer_doce.py` copia los 12 países desde la variable `D` de `../../vacunas-rebano/index.html` (ya verificada) y comprueba las anclas
  (exceso al cierre de 2020, 2021 y 2022; % vacunado al cierre de 2021 y 2022). No procesa el CSV completo.
  La serie de `vacunas-rebano` sale de `../../vacunas-rebano/datos/construir_datos.py`.
- Rederivación independiente (21-oct-2026) desde el CSV original (98 391 483 bytes, sha256 `8473d0f0fdf962e1ffbd5b85b18726fc96a49bab109e271186c339725a12b10c`):
  1296 valores comparados (36 meses × 3 series × 12 países), 0 diferencias; las 12 anclas coinciden. Tres valores caen exactamente en .5
  (Portugal `s` 2020-07 = 62,5; Australia `s` 2021-06 = 62,5; Chile `e` 2022-09 = 2872,5) y quedan redondeados con `round()` de Python (mitad al par).
- Sin dato de exceso: solo Perú en 2022-11 y 2022-12. El **exceso del mes** es la resta de dos meses seguidos del acumulado: no existe en
  el primer mes ni cuando falta alguno de los dos; esos meses se dibujan en gris con trama, nunca en cero.

## Geometría (`geometria.json`)

- Contornos de **Natural Earth** (dominio público) mediante el paquete **world-atlas@2.0.2** (`countries-50m.json`, licencia ISC, Mike Bostock;
  es el mismo archivo que sirve jsDelivr).
- `construir_geometria.mjs` lo reduce: quita la Antártida, simplifica con `topojson-simplify` conservando el 14 % de los puntos, proyecta con
  `d3.geoNaturalEarth1` a un lienzo de 1000 de ancho, redondea a 1 decimal y escribe caminos SVG relativos. Los 12 países llevan su propio camino;
  el resto del mundo es un solo camino gris con las fronteras disueltas (sin islas diminutas). Se calcula también la posición de cada marcador y el
  `viewBox` de cada región (Mundo, Américas, Europa, Oceanía).
- Versiones usadas: d3-geo@3.1.1, topojson-client@3.1.0, topojson-simplify@3.0.3, world-atlas@2.0.2.
  `npm install --prefix <carpeta> d3-geo@3.1.1 topojson-client@3.1.0 topojson-simplify@3.0.3 world-atlas@2.0.2` y luego
  `node construir_geometria.mjs <carpeta> geometria.json`. El resultado es reproducible.
- La página final no carga ninguna librería: los caminos ya vienen proyectados.

## Enlaces por par

`index.html?a=<país>&b=<país>`, con nombres en minúscula, sin tildes y con guion en vez de espacio:
`peru`, `nueva-zelanda`, `suecia`, `noruega`, `chile`, `uruguay`, `brasil`, `bulgaria`, `portugal`, `estados-unidos`, `reino-unido`, `australia`.
También acepta el orden invertido, mayúsculas y las tildes o los `%20` (se normalizan). Un par que no esté entre los siete muestra la lista.

1. `?a=peru&b=nueva-zelanda`
2. `?a=suecia&b=noruega`
3. `?a=chile&b=uruguay`
4. `?a=chile&b=brasil`
5. `?a=bulgaria&b=portugal`
6. `?a=estados-unidos&b=reino-unido`
7. `?a=australia&b=nueva-zelanda`

`pares.json` guarda, para cada par, su pregunta guía y los tres hitos (mes y preguntas). Cada pregunta lleva `t`: `L` si es de lectura directa
(se responde mirando un valor del mapa, la tabla o los gráficos) o `I` si pide interpretar. La página no muestra esa marca ni ninguna respuesta.

## Pantallas y uso (clase en sala de computación, 21-oct-2026)

- **Escritorio (≥ 1024 px de ancho):** tres columnas: instrucciones del paso (con scroll propio), mapa con sus controles y panel del par (tabla y dos
  curvas). A 1366×768, 1920×1080, 1280×720 y 1024×768 el mapa, el deslizador, la capa y las curvas caben sin scroll vertical de la página. Con mouse:
  mensaje flotante al pasar sobre un país y clic para leer su valor. Con teclado: Tab, flechas en el deslizador, espacio para reproducir o pausar,
  Enter sobre un círculo para leer. **Celular (< 1024 px):** una columna, objetivos de 44 px.
- La lista sin parámetros muestra los 7 pares **numerados** del 1 al 7 (el número de la hoja impresa). Abre `index.html` y elige el par N.
- «Términos clave» (colapsable) repite en el mapa las definiciones de exceso de mortalidad y cobertura; son las mismas del paso 1 y de la presentación.
- **Presentación (13 láminas):** flechas, PageUp/PageDown, Inicio/Fin, clic (tercio izquierdo retrocede, el resto avanza), deslizar, botones, tecla `I` o
  botón «Índice» con enlace directo a cada lámina (`#1` … `#13`), pantalla completa y cronómetros por etapa. La dirección cambia con cada lámina, así que el
  botón Atrás del navegador vuelve a la lámina anterior. Los enlaces a los 7 pares (láminas 10 y 11) son relativos (`index.html?a=…&b=…`) y se abren en
  pestaña nueva; los códigos QR apuntan a la dirección pública. Sin roles: todo el grupo explora el mismo par y completa una sola hoja.
- Secuencia de la clase: 0–20 entrada y términos clave · 20–30 simulador · 30–65 exploración del par en el mapa · 65–80 conclusión del grupo · 80–90 cierre y ticket individual.
