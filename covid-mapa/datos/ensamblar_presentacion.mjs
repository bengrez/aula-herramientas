#!/usr/bin/env node
// Arma ../presentacion.html: inserta los códigos QR (hechos con qrencode, SVG en línea) y los siete pares (desde pares.json).
// Escribe también ../presentacion-sin-conexion.html (copia idéntica, un solo archivo para llevar en pendrive).
// Uso: node ensamblar_presentacion.mjs   (requiere qrencode instalado)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const aqui = path.dirname(new URL(import.meta.url).pathname);
const BASE = 'https://bengrez.github.io/aula-herramientas/';
const NOMBRES = { peru: 'Perú', 'nueva-zelanda': 'Nueva Zelanda', suecia: 'Suecia', noruega: 'Noruega', chile: 'Chile', uruguay: 'Uruguay', brasil: 'Brasil', bulgaria: 'Bulgaria', portugal: 'Portugal', 'estados-unidos': 'Estados Unidos', 'reino-unido': 'Reino Unido', australia: 'Australia' };

function qr(url) {
  const svg = execFileSync('qrencode', ['-t', 'SVG', '-m', '0', '-l', 'M', '-o', '-', url], { encoding: 'utf8' });
  const n = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)[1]);
  const filas = {};
  const re = /<rect x="(\d+)" y="(\d+)" width="1" height="1" fill="#000000"\/>/g; let m;
  while ((m = re.exec(svg))) (filas[m[2]] = filas[m[2]] || []).push(Number(m[1]));
  let d = '';
  Object.keys(filas).forEach(function (y) {
    const xs = filas[y].sort(function (a, b) { return a - b; }); let i = 0;
    while (i < xs.length) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; d += 'M' + xs[i] + ' ' + y + 'h' + (j - i + 1) + 'v1h-' + (j - i + 1) + 'z'; i = j + 1; }
  });
  const q = 2; // zona de silencio de 2 módulos
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (-q) + ' ' + (-q) + ' ' + (n + 2 * q) + ' ' + (n + 2 * q) + '" shape-rendering="crispEdges" role="img" aria-label="Código QR: ' + url + '"><rect x="' + (-q) + '" y="' + (-q) + '" width="' + (n + 2 * q) + '" height="' + (n + 2 * q) + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}
const pares = JSON.parse(fs.readFileSync(path.join(aqui, 'pares.json'), 'utf8')).pares;
function tarjeta(p, i) {
  const rel = 'index.html?a=' + p.a + '&amp;b=' + p.b;
  const url = BASE + 'covid-mapa/?a=' + p.a + '&b=' + p.b;
  return '<div class="par"><div class="texto"><div class="tit">' + (i + 1) + '. ' + NOMBRES[p.a] + ' – ' + NOMBRES[p.b] + '</div><div class="guia">' + p.guia + '</div><a class="boton" href="' + rel + '" target="_blank" rel="noopener">Abrir el mapa del par ' + (i + 1) + '</a></div><div class="qr">' + qr(url) + '</div></div>';
}
function tarjetaLista() {
  return '<div class="par"><div class="texto"><div class="tit">¿No sabes cuál es tu par?</div><div class="guia">Abre la lista y elige el número de tu hoja.</div><a class="boton" href="index.html" target="_blank" rel="noopener">Abrir la lista de pares</a></div><div class="qr">' + qr(BASE + 'covid-mapa/') + '</div></div>';
}
let html = fs.readFileSync(path.join(aqui, 'presentacion.fuente.html'), 'utf8');
const poner = (marca, v) => { if (html.indexOf(marca) < 0) throw new Error('Falta ' + marca); html = html.replace(marca, () => v); };
poner('{{QR_VACUNAS}}', qr(BASE + 'vacunas-rebano/'));
poner('{{PARES_1}}', pares.slice(0, 4).map((p, i) => tarjeta(p, i)).join(''));
poner('{{PARES_2}}', pares.slice(4).map((p, i) => tarjeta(p, i + 4)).join('') + tarjetaLista());
fs.writeFileSync(path.join(aqui, '..', 'presentacion.html'), html);
fs.writeFileSync(path.join(aqui, '..', 'presentacion-sin-conexion.html'), html);
console.log('presentacion.html: ' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB');
