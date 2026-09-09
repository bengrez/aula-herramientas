// Dibujos originales, deterministas. Modelo didáctico 2n=4; no micrografías.
// La leyenda distingue homólogos por trazo además de color. Se omite recombinación.
const text = (x,y,t,size=18) => `<text x="${x}" y="${y}" font-size="${size}" fill="#143642" font-family="sans-serif">${t}</text>`;
function path(d, patterned=false, width=6) {
  return `<path d="${d}" fill="none" stroke="${patterned ? '#a43829' : '#076c6c'}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>` + (patterned ? `<path d="${d}" fill="none" stroke="#fffaf0" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round"/>` : '');
}
function chromosome(x,y,{paired=true,patterned=false,long=true,direction=1}={}) {
  const h=long?20:12, w=10;
  const d=paired ? `M${x-w} ${y-h} L${x+w} ${y+h} M${x+w} ${y-h} L${x-w} ${y+h}` : `M${x+direction*w} ${y-h} L${x} ${y} L${x+direction*w} ${y+h}`;
  return `<g data-chromatids="${paired?2:1}">${path(d,patterned)}<circle cx="${x}" cy="${y}" r="3" fill="#143642"/></g>`;
}
const fiber=(x,y,px)=>`<path d="M${px} 145 L${x} ${y}" stroke="#98b8b8" stroke-width="1.3" fill="none"/>`;
function poles() {return `<circle cx="42" cy="145" r="5" fill="#143642"/><circle cx="322" cy="145" r="5" fill="#143642"/>`;}
function panel(label,x,y,inside) {
  return `<g id="panel-${label}" transform="translate(${x} ${y})"><rect width="370" height="275" rx="16" fill="#fffdf7" stroke="#b9c7c4"/>${text(18,29,label,22)}<ellipse cx="182" cy="145" rx="161" ry="103" fill="#edf5f1" stroke="#476a71" stroke-width="2"/>${inside}</g>`;
}
const types=[{long:true},{long:true,patterned:true},{long:false},{long:false,patterned:true}];
function metaphase() {
  return types.map((t,i)=>fiber(182,76+i*45,42)+fiber(182,76+i*45,322)).join('')+poles()+types.map((t,i)=>chromosome(182,76+i*45,t)).join('');
}
function prophase() {
  return `<ellipse cx="182" cy="145" rx="103" ry="80" fill="none" stroke="#718889" stroke-width="2" stroke-dasharray="5 5"/>`+poles()+types.map((t,i)=>chromosome(i%2?225:139,i<2?105:177,t)).join('');
}
function anaphase(paired=false) {
  const selected=paired?[types[0],types[2]]:types;
  const ys=paired?[110,180]:[77,124,170,213];
  let result=poles();
  for (const side of [0,1]) for (let i=0;i<selected.length;i++) result+=fiber(side?251:113,ys[i],side?322:42);
  for (const side of [0,1]) for (let i=0;i<selected.length;i++) result+=chromosome(side?251:113,ys[i],{...selected[i],paired,patterned:paired?Boolean(side):selected[i].patterned,direction:side?-1:1});
  return result;
}
function telophase() {
  let result=`<path d="M182 42 Q157 65 182 88 M182 248 Q207 225 182 202" fill="none" stroke="#476a71" stroke-width="2"/>`;
  for (const x of [102,262]) {
    result+=`<ellipse cx="${x}" cy="145" rx="65" ry="74" fill="#fffdf7" stroke="#718889" stroke-width="2"/>`;
    for(let i=0;i<4;i++) result+=chromosome(x+(i%2?22:-22),i<2?115:177,{...types[i],paired:false});
  }
  return result;
}
function meiosisII() {
  let result=poles();
  for(const x of [113,251]) for(const y of [110,180]) result+=fiber(x,y,x<182?42:322);
  for(const x of [113,251]) for(const [i,y] of [110,180].entries()) result+=chromosome(x,y,{paired:false,long:i===0,direction:x<182?1:-1});
  return result;
}
function wrap(title,height,body,note) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${height}" width="800" height="${height}" role="img" aria-labelledby="title desc"><title id="title">${title}</title><desc id="desc">${note}</desc><rect width="800" height="${height}" rx="18" fill="#f5f0e4"/>${text(24,35,title,23)}${body}${text(24,height-47,'Trazo liso / punteado: homólogos distintos. Longitud: par cromosómico.',17)}${text(24,height-20,'Célula inicial: 2n = 4 · esquema no a escala',17)}</svg>\n`;
}
export function divisionFigures() {
  return {
    'mitosis.v1.svg':wrap('Cuatro momentos de una división celular',690,
      panel('A',20,55,metaphase())+panel('B',410,55,telophase())+panel('C',20,345,prophase())+panel('D',410,345,anaphase()),
      'Cuatro paneles rotulados A, B, C y D. La descripción equivalente se entrega junto a la figura.'),
    'meiosis.v1.svg':wrap('Dos momentos de una meiosis',405,
      panel('P',20,55,anaphase(true))+panel('Q',410,55,meiosisII()),
      'El panel Q representa una de las células resultantes de la primera división. La descripción equivalente se entrega junto a la figura.'),
  };
}
