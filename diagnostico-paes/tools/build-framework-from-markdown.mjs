#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error("Uso: node tools/build-framework-from-markdown.mjs <alcance-maestro.md>");
  process.exit(2);
}

const markdown = await readFile(sourcePath, "utf8");
const lines = markdown.split(/\r?\n/);

function cells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function plain(value) {
  return value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitList(value) {
  return plain(value).split(/\s*;\s*|,\s+(?=[a-záéíóúüñ])/i).map((entry) => entry.trim()).filter(Boolean);
}

const areaRows = lines.filter((line) => /^\| `(?:BIO|FIS|QUI)-\d{2}` \|/.test(line)).slice(0, 11).map((line) => {
  const [id, eje, etiqueta] = cells(line);
  return { id: plain(id), eje: plain(eje), etiqueta: plain(etiqueta), unidades: [] };
});
const areaById = new Map(areaRows.map((area) => [area.id, area]));

const abilityRows = lines.filter((line) => /^\| `HC-\d{2}` \|/.test(line)).slice(0, 5).map((line) => {
  const [id, etiqueta, official, project] = cells(line);
  return {
    id: plain(id),
    etiqueta: plain(etiqueta),
    alcance_oficial_resumido: plain(official),
    lectura_diagnostica_proyecto: plain(project),
    criterios: [],
  };
});
const abilityById = new Map(abilityRows.map((ability) => [ability.id, ability]));

const publicLabelOverrides = {
  "HC-02.C6": "Distinguir qué se cambia, qué se mide y qué se mantiene",
  "HC-03.C1": "Leer ejes, unidades y tendencias antes de interpretar",
  "HC-03.C3": "Sacar conclusiones sin ir más allá de los datos",
  "HC-04.C1": "Detectar límites, sesgos y comparaciones débiles",
};

const criterionLines = lines.filter((line) => /^\| `HC-\d{2}\.C\d+` \|/.test(line));
for (const line of criterionLines) {
  const [idCell, official, micro, evidence, error, stimuli] = cells(line);
  const id = plain(idCell);
  const ability = abilityById.get(id.slice(0, 5));
  if (!ability) throw new Error(`Habilidad padre inexistente para ${id}`);
  ability.criterios.push({
    id,
    etiqueta: publicLabelOverrides[id] ?? plain(micro).replace(/[.]$/, ""),
    descripcion: plain(micro),
    criterio_oficial_parafraseado: plain(official),
    evidencia_esperada: plain(evidence),
    error_distinguible: plain(error),
    formatos_estimulo: splitList(stimuli),
    etiqueta_estado: "provisional_docente",
    prioridad_foco: publicLabelOverrides[id] ? Object.keys(publicLabelOverrides).indexOf(id) + 1 : 99,
  });
}

const unitLines = lines.filter((line) => /^\| `(?:BIO|FIS|QUI)-\d{2}\.\d{2}` \|/.test(line));
for (const line of unitLines) {
  const [idCell, operationCell, prerequisites, representations, limit, criteria, priorityEvidence] = cells(line);
  const id = plain(idCell);
  const areaId = id.split(".")[0];
  const area = areaById.get(areaId);
  if (!area) throw new Error(`Área padre inexistente para ${id}`);
  const operationPlain = plain(operationCell);
  const separator = operationPlain.indexOf(":");
  const label = separator > 0 ? operationPlain.slice(0, separator).trim() : operationPlain;
  const operation = separator > 0 ? operationPlain.slice(separator + 1).trim() : operationPlain;
  const priority = priorityEvidence.match(/`(alta|media|diferida)`/)?.[1];
  const evidenceCodes = [...priorityEvidence.matchAll(/`((?:D27|FUND|E54-Q\d+|DEMRE-LIB))`/g)].map((match) => match[1]);
  area.unidades.push({
    id,
    etiqueta: label,
    operacion_diagnostica: operation,
    conocimiento_oficial_origen: `D27:${areaId}`,
    conceptos_relaciones: operation,
    procedimientos: operation,
    prerrequisitos: splitList(prerequisites),
    representaciones: splitList(representations),
    limite_diagnostico: plain(limit),
    criterios_compatibles: [...criteria.matchAll(/HC-\d{2}\.C\d+/g)].map((match) => match[0]),
    prioridad_diagnostico_v1: priority,
    evidencia_prioridad: evidenceCodes,
    procedencia: "descomposicion_diagnostica_proyecto",
  });
}

const matrix = [];
const matrixRows = lines.filter((line) => /^\| `(?:BIO|FIS|QUI)-\d{2}` [^|]+\| `(?:D|C|L)` \|/.test(line));
for (const line of matrixRows) {
  const [areaCell, ...rest] = cells(line);
  const areaId = plain(areaCell).match(/^(?:BIO|FIS|QUI)-\d{2}/)?.[0];
  const readings = rest.slice(0, 5).map(plain);
  const note = plain(rest[5]);
  readings.forEach((code, index) => {
    matrix.push({
      area_id: areaId,
      habilidad_id: `HC-${String(index + 1).padStart(2, "0")}`,
      condicion: code === "D" ? "medible" : code === "C" ? "evidencia_multiple" : "no_prioritaria",
      codigo_fuente: code,
      lectura_principal: note,
    });
  });
}

const evidenceTable = [];
for (let evaluable = 0; evaluable <= 3; evaluable += 1) {
  for (let correct = 0; correct <= evaluable; correct += 1) {
    let state = "sin_evidencia";
    if (evaluable >= 2) {
      if (correct === 0 || (evaluable === 3 && correct === 1)) state = "requiere_refuerzo";
      else if (evaluable === 3 && correct === 3) state = "evidencia_consistente";
      else state = "evidencia_inicial";
    }
    evidenceTable.push({ evidencias_evaluables: evaluable, aciertos: correct, estado: state });
  }
}

const framework = {
  schema_version: 1,
  marco_id: "paes-ciencias",
  version: "admision-2027.v1",
  titulo: "PAES Regular de Ciencias — Admisión 2027",
  estado: "alcance_completo_etiquetas_provisionales",
  autoridad: {
    tipo: "temario_oficial",
    entidad: "DEMRE",
    publicado: "2026-03-19",
    proceso: "Admisión 2027",
    url: "https://demre.cl/publicaciones/pdf/2027-26-03-19-temario-paes-regular-ciencias.pdf",
  },
  fuente_local: {
    archivo: "ref-paes-ciencias-admision-2027-scope-diagnostico.md",
    sha256: createHash("sha256").update(markdown).digest("hex"),
    generado_en: "2026-07-31",
  },
  avisos: [
    "El alcance oficial, la descomposición diagnóstica del proyecto y la evidencia del ensayo aplicado son capas distintas.",
    "Las prioridades de diagnóstico no constituyen una partición oficial de contenidos por módulo.",
    "Las etiquetas públicas y la tabla de inferencia son provisionales hasta validación docente.",
  ],
  habilidades: abilityRows,
  areas: areaRows,
  matriz_contenido_habilidad: matrix,
  mapa_evidencia: {
    perfil_id: "ancla-habilidades-v1-provisional",
    estado_parametros: "provisional_docente",
    estados: [
      { id: "evidencia_consistente", orden: 4, etiqueta: "Evidencia consistente", descripcion: "Varias señales apuntan en la misma dirección.", simbolo: "◆" },
      { id: "evidencia_inicial", orden: 3, etiqueta: "Evidencia inicial", descripcion: "Hay una señal útil, pero todavía depende del contexto.", simbolo: "△" },
      { id: "sin_evidencia", orden: 2, etiqueta: "Territorio aún no medido", descripcion: "Las respuestas disponibles no alcanzan para interpretar esta zona.", simbolo: "…" },
      { id: "requiere_refuerzo", orden: 1, etiqueta: "Conviene volver a mirar", descripcion: "Varias respuestas sugieren que esta zona merece una revisión guiada.", simbolo: "↺" },
    ],
    tabla_inferencia: evidenceTable,
  },
};

process.stdout.write(`${JSON.stringify(framework, null, 2)}\n`);
