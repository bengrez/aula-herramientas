#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBundle } from "../src/engine/contracts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const bundle = assertBundle({
  active: await readJson("data/active.json"),
  framework: await readJson("data/paes-ciencias-2027/framework.v1.json"),
  bank: await readJson("data/paes-ciencias-2027/bank-anchor-placeholder.v1.json"),
  session: await readJson("data/paes-ciencias-2027/session-anchor-2026-08-17.v1.json"),
  deployment: await readJson("data/paes-ciencias-2027/deployment.v1.json"),
});

const quote = (value) => value === null || value === undefined ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const statements = [
  "-- Generated from the versioned public data files. Do not hand-edit.",
  "-- Placeholder content remains disabled until pedagogical review.",
  "begin;",
];

const framework = bundle.framework;
statements.push(`insert into private.framework_versions (framework_id, framework_version, title, status, source_url, configuration)
values (${quote(framework.marco_id)}, ${quote(framework.version)}, ${quote(framework.titulo)}, 'draft', ${quote(framework.autoridad.url)}, ${json({ mapa_evidencia: framework.mapa_evidencia, avisos: framework.avisos })})
on conflict (framework_id, framework_version) do update set title = excluded.title, status = excluded.status, source_url = excluded.source_url, configuration = excluded.configuration;`);

framework.habilidades.forEach((ability, abilityIndex) => {
  statements.push(`insert into private.abilities (framework_id, framework_version, ability_code, label, description, position)
values (${quote(framework.marco_id)}, ${quote(framework.version)}, ${quote(ability.id)}, ${quote(ability.etiqueta)}, ${quote(ability.lectura_diagnostica_proyecto ?? "")}, ${abilityIndex + 1})
on conflict (framework_id, framework_version, ability_code) do update set label = excluded.label, description = excluded.description, position = excluded.position;`);
  ability.criterios.forEach((criterion, criterionIndex) => {
    statements.push(`insert into private.criteria (framework_id, framework_version, criterion_code, ability_code, public_label, description, focus_priority, position, metadata)
values (${quote(framework.marco_id)}, ${quote(framework.version)}, ${quote(criterion.id)}, ${quote(ability.id)}, ${quote(criterion.etiqueta)}, ${quote(criterion.descripcion)}, ${criterion.prioridad_foco}, ${criterionIndex + 1}, ${json({ criterio_oficial_parafraseado: criterion.criterio_oficial_parafraseado, evidencia_esperada: criterion.evidencia_esperada, error_distinguible: criterion.error_distinguible, formatos_estimulo: criterion.formatos_estimulo, etiqueta_estado: criterion.etiqueta_estado })})
on conflict (framework_id, framework_version, criterion_code) do update set ability_code = excluded.ability_code, public_label = excluded.public_label, description = excluded.description, focus_priority = excluded.focus_priority, position = excluded.position, metadata = excluded.metadata;`);
  });
});

const axes = [...new Set(framework.areas.map((area) => area.eje))];
axes.forEach((axis, index) => {
  statements.push(`insert into private.axes (framework_id, framework_version, axis_code, label, position)
values (${quote(framework.marco_id)}, ${quote(framework.version)}, ${quote(axis)}, ${quote(axis)}, ${index + 1})
on conflict (framework_id, framework_version, axis_code) do update set label = excluded.label, position = excluded.position;`);
});

framework.areas.forEach((area, areaIndex) => {
  statements.push(`insert into private.areas (framework_id, framework_version, area_code, axis_code, label, position)
values (${quote(framework.marco_id)}, ${quote(framework.version)}, ${quote(area.id)}, ${quote(area.eje)}, ${quote(area.etiqueta)}, ${areaIndex + 1})
on conflict (framework_id, framework_version, area_code) do update set axis_code = excluded.axis_code, label = excluded.label, position = excluded.position;`);
  area.unidades.forEach((unit, unitIndex) => {
    const metadata = {
      conocimiento_oficial_origen: unit.conocimiento_oficial_origen,
      conceptos_relaciones: unit.conceptos_relaciones,
      procedimientos: unit.procedimientos,
      prerrequisitos_texto: unit.prerrequisitos,
      representaciones: unit.representaciones,
      limite_diagnostico: unit.limite_diagnostico,
      criterios_compatibles: unit.criterios_compatibles,
      evidencia_prioridad: unit.evidencia_prioridad,
      procedencia: unit.procedencia,
    };
    statements.push(`insert into private.units (framework_id, framework_version, unit_code, area_code, label, diagnostic_operation, diagnostic_priority, metadata, position)
values (${quote(framework.marco_id)}, ${quote(framework.version)}, ${quote(unit.id)}, ${quote(area.id)}, ${quote(unit.etiqueta)}, ${quote(unit.operacion_diagnostica)}, ${quote(unit.prioridad_diagnostico_v1)}, ${json(metadata)}, ${unitIndex + 1})
on conflict (framework_id, framework_version, unit_code) do update set area_code = excluded.area_code, label = excluded.label, diagnostic_operation = excluded.diagnostic_operation, diagnostic_priority = excluded.diagnostic_priority, metadata = excluded.metadata, position = excluded.position;`);
  });
});

const bank = bundle.bank;
statements.push(`insert into private.item_banks (bank_id, bank_version, framework_id, framework_version, status, metadata)
values (${quote(bank.banco_id)}, ${quote(bank.version)}, ${quote(bank.marco_id)}, ${quote(bank.marco_version)}, 'placeholder', ${json({ estado_autoria: bank.estado_autoria, aviso: bank.aviso })})
on conflict (bank_id, bank_version) do update set status = excluded.status, metadata = excluded.metadata;`);

bank.items.forEach((item, index) => {
  statements.push(`insert into private.items (framework_id, framework_version, item_id, item_version, unit_code, criterion_code, axis_code, stimulus_format, stimulus, prompt, alternatives, answer_key, answer_key_status, metadata)
values (${quote(item.marco_id)}, ${quote(item.marco_version)}, ${quote(item.item_id)}, ${quote(item.version)}, ${quote(item.unidad_id)}, ${quote(item.criterio_id)}, ${quote(item.eje)}, ${quote(item.formato_estimulo)}, ${json(item.estimulo)}, ${quote(item.enunciado)}, ${json(item.alternativas)}, ${quote(item.clave)}, ${quote(item.estado_clave)}, ${json({ placeholder: true })})
on conflict (framework_id, framework_version, item_id, item_version) do update set unit_code = excluded.unit_code, criterion_code = excluded.criterion_code, axis_code = excluded.axis_code, stimulus_format = excluded.stimulus_format, stimulus = excluded.stimulus, prompt = excluded.prompt, alternatives = excluded.alternatives, answer_key = excluded.answer_key, answer_key_status = excluded.answer_key_status, metadata = excluded.metadata;`);
  statements.push(`insert into private.bank_items (bank_id, bank_version, framework_id, framework_version, item_id, item_version, position)
values (${quote(bank.banco_id)}, ${quote(bank.version)}, ${quote(item.marco_id)}, ${quote(item.marco_version)}, ${quote(item.item_id)}, ${quote(item.version)}, ${index + 1})
on conflict (bank_id, bank_version, item_id, item_version) do update set position = excluded.position;`);
});

const session = bundle.session;
statements.push(`insert into private.session_templates (session_template_id, session_version, framework_id, framework_version, bank_id, bank_version, session_type, rules, status)
values (${quote(session.plantilla_id)}, ${quote(session.version)}, ${quote(session.marco_id)}, ${quote(session.marco_version)}, ${quote(session.banco_id)}, ${quote(session.banco_version)}, ${quote(session.tipo)}, ${json(session.reglas)}, 'draft')
on conflict (session_template_id, session_version) do update set rules = excluded.rules, status = excluded.status;`);
session.items.forEach((ref) => {
  statements.push(`insert into private.session_items (session_template_id, session_version, framework_id, framework_version, bank_id, bank_version, item_id, item_version, presentation_order)
values (${quote(session.plantilla_id)}, ${quote(session.version)}, ${quote(session.marco_id)}, ${quote(session.marco_version)}, ${quote(session.banco_id)}, ${quote(session.banco_version)}, ${quote(ref.item_id)}, ${quote(ref.item_version)}, ${ref.orden})
on conflict (session_template_id, session_version, item_id, item_version) do update set presentation_order = excluded.presentation_order;`);
});

const deployment = bundle.deployment;
statements.push(`insert into private.administrations (administration_id, session_template_id, session_version, enabled, target_date, code_alphabet, code_payload_length, code_multiplier, metadata)
values (${quote(deployment.administracion.administracion_id)}, ${quote(session.plantilla_id)}, ${quote(session.version)}, false, ${quote(deployment.administracion.fecha_objetivo)}::date, ${quote(deployment.enrolamiento.alfabeto)}, ${deployment.enrolamiento.longitud_carga}, ${deployment.enrolamiento.multiplicador}, ${json({ deployment_id: deployment.deployment_id, release_status: deployment.release_status, pilot_ready: deployment.pilot_ready })})
on conflict (administration_id) do update set session_template_id = excluded.session_template_id, session_version = excluded.session_version, enabled = false, target_date = excluded.target_date, code_alphabet = excluded.code_alphabet, code_payload_length = excluded.code_payload_length, code_multiplier = excluded.code_multiplier, metadata = excluded.metadata;`);

statements.push("commit;");

export const generatedContentSeed = `${statements.join("\n\n")}\n`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(generatedContentSeed);
}
