#!/usr/bin/env node
// Arma los archivos finales de un solo archivo: inserta la geometría, la serie y los pares en la plantilla.
// Uso: node ensamblar.mjs   (lee mapa.fuente.html, geometria.json, serie.json, pares.json; escribe ../index.html y ../sin-conexion.html)
import fs from 'node:fs';
import path from 'node:path';
const aqui = path.dirname(new URL(import.meta.url).pathname);
const lee = (f) => fs.readFileSync(path.join(aqui, f), 'utf8');
const g = JSON.parse(lee('geometria.json'));
const geom = { resto: g.resto, paises: g.paises, regiones: g.regiones };
let html = lee('mapa.fuente.html');
const poner = (marca, valor) => {
  if (html.indexOf(marca) < 0) throw new Error('Falta la marca ' + marca);
  html = html.replace(marca, () => JSON.stringify(valor));
};
poner('/*GEOMETRIA*/', geom);
poner('/*SERIE*/', JSON.parse(lee('serie.json')));
poner('/*PARES*/', JSON.parse(lee('pares.json')));
fs.writeFileSync(path.join(aqui, '..', 'index.html'), html);
fs.writeFileSync(path.join(aqui, '..', 'sin-conexion.html'), html);
console.log('index.html y sin-conexion.html: ' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB');
