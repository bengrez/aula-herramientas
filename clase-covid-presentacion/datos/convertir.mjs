#!/usr/bin/env node
// Arma ../index.html a partir de las láminas de la presentación de la clase (una <section> por archivo + deck.json con el orden).
// Uso: node convertir.mjs <carpeta-project>   (la carpeta trae deck.json y slides/*.html)
// Cambios respecto de la fuente: se quitan los <aside> (notas del docente; el repo es público); <x-embed> pasa a <iframe sandbox="allow-scripts" srcdoc>;
// <x-shape kind="ellipse"> pasa a <div class="elipse">; <x-icon name="Play"> pasa a un triángulo SVG; data-build-in="rise N" pasa a class="construye" data-paso="N".
import fs from 'node:fs';
import path from 'node:path';
const aqui = path.dirname(new URL(import.meta.url).pathname);
const raiz = process.argv[2];
if (!raiz) { console.error('Uso: node convertir.mjs <carpeta-project>'); process.exit(2); }
const deck = JSON.parse(fs.readFileSync(path.join(raiz, 'deck.json'), 'utf8'));
const TITULOS_IFRAME = {
  ruta: 'Reloj de la clase: hora de Chile, etapa vigente y tiempo que queda',
  r0: 'Animación: una persona infectada y sus contagios, generación por generación, con R₀ = 2, 3 y 5',
  rebano: 'Animación: 400 personas con R₀ = 5 y cobertura de 0, 50 y 90 %',
  exceso: 'Animación (ejemplo ilustrativo): barras del exceso de cada mes y línea del acumulado',
  reloj: 'Reloj de la clase: hora de Chile, etapa vigente y tiempo que queda'
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const texto = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const laminas = deck.order.map((id, k) => {
  let s = fs.readFileSync(path.join(raiz, 'slides', id + '.html'), 'utf8').trim();
  s = s.replace(/<aside>[\s\S]*?<\/aside>\s*/g, '');
  s = s.replace(/(\d) %/g, '$1&nbsp;%'); // que el signo % no quede solo en otra línea
  if (id === 'portada') {
    if (s.indexOf('Piena en unaposible hipótesis') < 0) throw new Error('No encontré el texto de la portada');
    s = s.replace('Piena en unaposible hipótesis', 'Escribe tu hipótesis en la hoja del grupo');
  }
  s = s.replace(/<x-embed style="([^"]*)">([\s\S]*?)<\/x-embed>/g, (_, st, dentro) =>
    '<iframe class="emb" style="' + st + '" sandbox="allow-scripts" scrolling="no" tabindex="-1" title="' + esc(TITULOS_IFRAME[id] || 'Animación') + '" data-srcdoc="' +
    esc('<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head><body>' + dentro.trim() + '</body></html>') + '"></iframe>');
  s = s.replace(/<x-shape kind="ellipse" style="([^"]*)"><\/x-shape>/g, '<div class="elipse" style="$1"></div>');
  s = s.replace(/<x-icon name="Play" style="([^"]*)"><\/x-icon>/g, '<svg style="$1" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5v17l14-8.5z" fill="currentColor"/></svg>');
  s = s.replace(/ data-build-in="rise (\d+)"/g, ' class="construye" data-paso="$1"');
  if (/<x-|data-build-in/.test(s)) throw new Error('Quedó una etiqueta sin convertir en ' + id);
  const t = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/.exec(s);
  const titulo = texto(t ? t[1] : id);
  s = s.replace(/^<section /, '<section class="lamina' + (k === 0 ? ' activa' : '') + '" data-titulo="' + esc(titulo) + '" aria-label="Lámina ' + (k + 1) + '" ');
  return s;
});
let html = fs.readFileSync(path.join(aqui, 'cascaron.html'), 'utf8');
html = html.replace('{{LAMINAS}}', () => laminas.join('\n\n'));
fs.writeFileSync(path.join(aqui, '..', 'index.html'), html);
console.log('index.html: ' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB, ' + laminas.length + ' láminas');
