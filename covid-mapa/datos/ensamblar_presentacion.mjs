#!/usr/bin/env node
// Arma ../presentacion.html: inserta los códigos QR (hechos con qrencode, SVG en línea) y los siete pares (desde pares.json).
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
function tarjeta(p, i, grande) {
  const url = BASE + 'covid-mapa/?a=' + p.a + '&b=' + p.b;
  const tit = (i + 1) + '. ' + NOMBRES[p.a] + ' – ' + NOMBRES[p.b];
  const cuerpo = '<div class="tit">' + tit + '</div><div class="guia">' + p.guia + '</div>';
  const cod = '<div class="qr">' + qr(url) + '</div><div class="cod">covid-mapa/?a=' + p.a + '&amp;b=' + p.b + '</div>';
  return grande ? '<div class="par"><div class="texto">' + cuerpo + '<div class="cod">covid-mapa/?a=' + p.a + '&amp;b=' + p.b + '</div></div><div class="qr">' + qr(url) + '</div></div>' : '<div class="par">' + cuerpo + cod + '</div>';
}
let html = fs.readFileSync(path.join(aqui, 'presentacion.fuente.html'), 'utf8');
const poner = (marca, v) => { if (html.indexOf(marca) < 0) throw new Error('Falta ' + marca); html = html.replace(marca, () => v); };
poner('{{QR_VACUNAS}}', qr(BASE + 'vacunas-rebano/'));
poner('{{PARES_1}}', pares.slice(0, 4).map((p, i) => tarjeta(p, i, false)).join(''));
poner('{{PARES_2}}', pares.slice(4).map((p, i) => tarjeta(p, i + 4, true)).join(''));
fs.writeFileSync(path.join(aqui, '..', 'presentacion.html'), html);
console.log('presentacion.html: ' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB');
