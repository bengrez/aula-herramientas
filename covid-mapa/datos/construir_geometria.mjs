#!/usr/bin/env node
// Preproyecta la geometría del mapa: contornos de Natural Earth (paquete world-atlas@2.0.2) -> caminos SVG.
// Uso: node construir_geometria.mjs <carpeta-con-node_modules> [salida.json] [--res 50m|110m] [--retener 0.25]
//   La carpeta debe tener instalados: d3-geo@3.1.1 topojson-client@3.1.0 topojson-simplify@3.0.3 world-atlas@2.0.2
//   (npm install --prefix <carpeta> d3-geo@3.1.1 topojson-client@3.1.0 topojson-simplify@3.0.3 world-atlas@2.0.2)
// Salida: geometria.json con los 12 países (camino SVG propio), el resto del mundo fundido en un solo camino gris,
//   la posición de cada marcador y el viewBox de cada región. Coordenadas en un lienzo de 1000 de ancho, 1 decimal,
//   en trazos relativos para que pese poco. No hay ninguna librería en la página final.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const pos = args.filter(function (a, i) { return a.indexOf('--') !== 0 && args[i - 1] !== '--res' && args[i - 1] !== '--retener'; });
if (!pos.length) { console.error('Uso: node construir_geometria.mjs <carpeta-con-node_modules> [salida.json] [--res 50m|110m] [--retener 0.25]'); process.exit(2); }
const req = createRequire(path.resolve(pos[0]) + '/');
const d3 = req('d3-geo');
const tj = req('topojson-client');
const ts = req('topojson-simplify');
const RES = opt('--res', '50m');
const RETENER = Number(opt('--retener', '0.25')); // fracción de puntos que se conservan (topojson-simplify.quantile)
const SALIDA = pos[1] || path.join(path.dirname(new URL(import.meta.url).pathname), 'geometria.json');

// País (clave del mapa = nombre en inglés de OWID) -> id numérico ISO 3166-1 en world-atlas, nombre en español y marcador (lon, lat)
const DOCE = [
  { k: 'Bulgaria', id: '100', n: 'Bulgaria', m: [25.2, 42.7] },
  { k: 'Portugal', id: '620', n: 'Portugal', m: [-8.0, 39.6] },
  { k: 'Chile', id: '152', n: 'Chile', m: [-71.4, -35.5] },
  { k: 'Brazil', id: '076', n: 'Brasil', m: [-52, -10] },
  { k: 'Uruguay', id: '858', n: 'Uruguay', m: [-56, -32.8] },
  { k: 'United States', id: '840', n: 'Estados Unidos', m: [-98, 39] },
  { k: 'United Kingdom', id: '826', n: 'Reino Unido', m: [-1.5, 52.8] },
  { k: 'Peru', id: '604', n: 'Perú', m: [-75, -9.5] },
  { k: 'New Zealand', id: '554', n: 'Nueva Zelanda', m: [175.6, -39.2] },
  { k: 'Sweden', id: '752', n: 'Suecia', m: [16, 62.5] },
  { k: 'Norway', id: '578', n: 'Noruega', m: [8.8, 61.6] },
  { k: 'Australia', id: '036', n: 'Australia', m: [134, -25] }
];
// Regiones: [lon0, lat0, lon1, lat1]
const REGIONES = {
  mundo: [-180, -57, 180, 84],
  americas: [-168, -57, -34, 72],
  europa: [-12, 34, 32, 72],
  oceania: [108, -48, 180, -8]
};
const ANCHO = 1000, MAX_RATIO = 0.8, MIN_RATIO = 0.45;

const topo0 = JSON.parse(fs.readFileSync(req.resolve('world-atlas/countries-' + RES + '.json'), 'utf8'));
let topo = ts.presimplify(topo0);
const PESO = ts.quantile(topo, RETENER);
topo = ts.simplify(topo, PESO);
const geoms = topo.objects.countries.geometries.filter(function (g) { return g.id !== '010'; }); // sin Antártida
const idsDoce = DOCE.map(function (d) { return d.id; });
DOCE.forEach(function (d) { if (!geoms.some(function (g) { return g.id === d.id; })) throw new Error('No está ' + d.k); });

// Proyección Natural Earth ajustada a un lienzo de ANCHO de ancho (sin Antártida: lat -57 a 84)
const proj = d3.geoNaturalEarth1();
const caja = { type: 'Polygon', coordinates: [[[-180, 84], [180, 84], [180, -57], [-180, -57], [-180, 84]]] };
proj.fitWidth(ANCHO, caja);
const origen = proj([-180, 84]);
proj.translate([proj.translate()[0] - origen[0], proj.translate()[1] - origen[1]]);

const r1 = function (x) { return Math.round(x * 10) / 10; };
const num = function (x) { var s = String(x); return s.indexOf('0.') === 0 ? s.slice(1) : s.indexOf('-0.') === 0 ? '-' + s.slice(2) : s; };

// Convierte una geometría GeoJSON en un camino SVG relativo y compacto; descarta polígonos con menos de minArea (unidades²)
function camino(geo, minArea) {
  var rec = [];
  var ctx = {
    moveTo: function (x, y) { rec.push(['M', x, y]); },
    lineTo: function (x, y) { rec.push(['L', x, y]); },
    closePath: function () { rec.push(['Z']); },
    arc: function () {}, rect: function () {}, bezierCurveTo: function () {}, quadraticCurveTo: function () {}
  };
  var gp = d3.geoPath(proj, ctx);
  var polys = geo.type === 'MultiPolygon' ? geo.coordinates : [geo.coordinates];
  var out = '', cx = 0, cy = 0, kept = 0, dropped = 0;
  polys.forEach(function (poly) {
    var area = gp.area({ type: 'Polygon', coordinates: poly });
    if (area < minArea) { dropped++; return; }
    kept++;
    rec.length = 0; gp({ type: 'Polygon', coordinates: poly });
    var subs = [], cur = null;
    rec.forEach(function (r) { if (r[0] === 'M') { cur = []; subs.push(cur); } if (r[0] !== 'Z') cur.push([r1(r[1]), r1(r[2])]); });
    subs.forEach(function (pts) {
      // quita puntos repetidos tras redondear y el cierre duplicado
      var lim = [];
      pts.forEach(function (p) { var q = lim[lim.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) lim.push(p); });
      if (lim.length > 1 && lim[0][0] === lim[lim.length - 1][0] && lim[0][1] === lim[lim.length - 1][1]) lim.pop();
      if (lim.length < 3) return;
      out += 'M' + num(lim[0][0]) + ' ' + num(lim[0][1]);
      var px = lim[0][0], py = lim[0][1], s = '';
      for (var i = 1; i < lim.length; i++) {
        var dx = r1(lim[i][0] - px), dy = r1(lim[i][1] - py);
        px = lim[i][0]; py = lim[i][1];
        var a = num(dx), b = num(dy);
        s += (s ? (a.charAt(0) === '-' ? '' : ' ') : '') + a + (b.charAt(0) === '-' ? '' : ' ') + b;
      }
      out += 'l' + s + 'z';
    });
  });
  return { d: out, kept: kept, dropped: dropped };
}

var paises = {};
var feats = topo.objects.countries.geometries;
DOCE.forEach(function (d) {
  var g = feats.filter(function (x) { return x.id === d.id; })[0];
  var f = tj.feature(topo, g);
  var c = camino(f.geometry, 0.35);
  var m = proj(d.m);
  paises[d.k] = { n: d.n, d: c.d, m: [r1(m[0]), r1(m[1])] };
});

// Resto del mundo: un solo camino gris (fronteras disueltas)
var resto = geoms.filter(function (g) { return idsDoce.indexOf(g.id) < 0; });
var fusion = tj.merge(topo, resto);
var cr = camino(fusion, 3);

// viewBox de cada región: caja proyectada (con bordes muestreados), ajustada a una proporción alto/ancho entre MIN_RATIO y MAX_RATIO
function viewBox(b) {
  var xs = [], ys = [], N = 40, i, t, p;
  for (i = 0; i <= N; i++) {
    t = i / N;
    [[b[0] + t * (b[2] - b[0]), b[1]], [b[0] + t * (b[2] - b[0]), b[3]], [b[0], b[1] + t * (b[3] - b[1])], [b[2], b[1] + t * (b[3] - b[1])]].forEach(function (q) {
      p = proj(q); xs.push(p[0]); ys.push(p[1]);
    });
  }
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  var w = x1 - x0, h = y1 - y0, ratio = h / w;
  if (ratio > MAX_RATIO) { var nw = h / MAX_RATIO; x0 -= (nw - w) / 2; w = nw; ratio = MAX_RATIO; }
  else if (ratio < MIN_RATIO) { var nh = w * MIN_RATIO; y0 -= (nh - h) / 2; h = nh; ratio = MIN_RATIO; }
  var m = w * 0.025; // margen para que no se corten los marcadores de las orillas
  x0 -= m; w += 2 * m; ratio = h / w;
  return { vb: [r1(x0), r1(y0), r1(w), r1(h)], ratio: Math.round(ratio * 1000) / 1000 };
}
var regiones = {};
Object.keys(REGIONES).forEach(function (k) { regiones[k] = viewBox(REGIONES[k]); });

var salida = {
  fuente: 'Natural Earth vía world-atlas@2.0.2 (countries-' + RES + '.json), ISC; datos de Natural Earth en dominio público. Proyección d3.geoNaturalEarth1, lienzo de ' + ANCHO + ' de ancho, simplificación topojson-simplify conservando ' + Math.round(RETENER * 100) + ' % de los puntos.',
  ancho: ANCHO,
  alto: r1(proj([0, -57])[1]),
  resto: cr.d,
  paises: paises,
  regiones: regiones
};
fs.writeFileSync(SALIDA, JSON.stringify(salida));
var kb = function (s) { return (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB'; };
console.log('Escrito ' + SALIDA + ' (' + kb(JSON.stringify(salida)) + '); resto ' + kb(cr.d) + ' (polígonos ' + cr.kept + ', descartados ' + cr.dropped + ')');
Object.keys(paises).forEach(function (k) { console.log('  ' + k + ': ' + kb(paises[k].d)); });
console.log('  regiones: ' + JSON.stringify(regiones));
