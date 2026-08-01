import { element, svgElement } from "./dom.mjs";

let chartSequence = 0;

function renderText(stimulus) {
  return element("div", { className: "stimulus" }, [
    stimulus.titulo ? element("p", { className: "stimulus-title", text: stimulus.titulo }) : null,
    element("p", { text: stimulus.texto }),
    stimulus.nota ? element("p", { className: "stimulus-note", text: stimulus.nota }) : null,
  ]);
}

function renderTable(stimulus) {
  const table = element("table");
  const caption = element("caption", { className: "visually-hidden", text: stimulus.texto_alternativo });
  const head = element("thead", {}, element("tr", {}, stimulus.columnas.map((column) => element("th", { scope: "col", text: column }))));
  const body = element("tbody", {}, stimulus.filas.map((row) => element("tr", {}, row.map((cell, index) => (
    index === 0 ? element("th", { scope: "row", text: cell }) : element("td", { text: cell })
  )))));
  table.append(caption, head, body);
  const tableRegion = element("div", {
    className: "table-scroll",
    role: "region",
    tabindex: "0",
    "aria-label": `Tabla: ${stimulus.titulo ?? stimulus.texto_alternativo}`,
  }, table);
  return element("div", { className: "stimulus" }, [stimulus.titulo ? element("p", { className: "stimulus-title", text: stimulus.titulo }) : null, tableRegion]);
}

function renderSequence(stimulus) {
  const list = element("ol");
  for (const step of stimulus.pasos) list.append(element("li", { text: step }));
  return element("div", { className: "stimulus" }, [
    stimulus.titulo ? element("p", { className: "stimulus-title", text: stimulus.titulo }) : null,
    list,
    element("p", { className: "visually-hidden", text: stimulus.texto_alternativo }),
  ]);
}

function renderBars(stimulus) {
  const max = Math.max(...stimulus.series.flatMap((series) => series.valores), 1);
  const width = 560;
  const height = 250;
  const left = 56;
  const bottom = 202;
  const chartWidth = 470;
  const chartHeight = 160;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": stimulus.texto_alternativo });
  chartSequence += 1;
  const diagonalId = `bars-diagonal-${chartSequence}`;
  const dottedId = `bars-dotted-${chartSequence}`;
  svg.append(svgElement("defs", {}, [
    svgElement("pattern", { id: diagonalId, width: 8, height: 8, patternUnits: "userSpaceOnUse" }, [
      svgElement("rect", { width: 8, height: 8, fill: "#e5f4f0" }),
      svgElement("path", { d: "M-2 8 L8 -2 M2 10 L10 2", stroke: "#08766e", "stroke-width": 3 }),
    ]),
    svgElement("pattern", { id: dottedId, width: 8, height: 8, patternUnits: "userSpaceOnUse" }, [
      svgElement("rect", { width: 8, height: 8, fill: "#fff0ec" }),
      svgElement("circle", { cx: 2, cy: 2, r: 1.8, fill: "#b73726" }),
      svgElement("circle", { cx: 6, cy: 6, r: 1.8, fill: "#b73726" }),
    ]),
  ]));
  svg.append(svgElement("line", { x1: left, y1: 25, x2: left, y2: bottom, stroke: "currentColor", "stroke-width": 3 }));
  svg.append(svgElement("line", { x1: left, y1: bottom, x2: width - 18, y2: bottom, stroke: "currentColor", "stroke-width": 3 }));
  const groupWidth = chartWidth / stimulus.categorias.length;
  const barWidth = Math.max(14, (groupWidth - 20) / stimulus.series.length);
  stimulus.categorias.forEach((category, categoryIndex) => {
    svg.append(svgElement("text", { x: left + groupWidth * (categoryIndex + 0.5), y: 228, "text-anchor": "middle", "font-size": 14, text: category }));
    stimulus.series.forEach((series, seriesIndex) => {
      const value = series.valores[categoryIndex];
      const barHeight = value / max * chartHeight;
      const x = left + categoryIndex * groupWidth + 10 + seriesIndex * barWidth;
      svg.append(svgElement("rect", { x, y: bottom - barHeight, width: barWidth - 3, height: barHeight, fill: `url(#${seriesIndex % 2 ? dottedId : diagonalId})`, stroke: "#143642", "stroke-width": 1 }));
      svg.append(svgElement("text", { x: x + (barWidth - 3) / 2, y: bottom - barHeight - 5, "text-anchor": "middle", "font-size": 12, text: value }));
    });
  });
  const legend = element("p", { className: "stimulus-note", text: stimulus.series.map((series, index) => `${index % 2 ? "Tramado punteado" : "Tramado diagonal"}: ${series.nombre}`).join(" · ") });
  return element("div", { className: "stimulus" }, [stimulus.titulo ? element("p", { className: "stimulus-title", text: stimulus.titulo }) : null, svg, legend]);
}

export function renderStimulus(stimulus) {
  if (!stimulus?.texto_alternativo) throw new Error("Todo estímulo necesita texto alternativo");
  if (stimulus.tipo === "tabla") return renderTable(stimulus);
  if (stimulus.tipo === "secuencia" || stimulus.tipo === "diagrama") return renderSequence(stimulus);
  if (stimulus.tipo === "grafico_barras") return renderBars(stimulus);
  if (stimulus.tipo === "texto") return renderText(stimulus);
  throw new Error(`No existe un renderizador para el estímulo “${stimulus.tipo}”`);
}
