// Solo Docker efímero, datos ficticios, sin puertos publicados ni conexión Supabase.
import { execFileSync, execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { promisify } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
const name = `paes-practice-test-${randomUUID().slice(0, 8)}`;
const docker = args => execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const sql = text => execFileSync("docker", ["exec", "-i", name, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const quote = s => `'${String(s).replaceAll("'", "''")}'`;
const users = [randomUUID(), randomUUID(), randomUUID()];
const code = "TESTPAESB"; // Solo fixture público. No usa ledger real.
const auth = (query, user = users[0]) => `set request.jwt.claim.sub = ${quote(user)}; set role authenticated; ${query}`;
const day = new Date().toISOString().slice(0, 10);
const payload = (batch = randomUUID()) => ({ scope_id: "synthetic", batch_id: batch, deltas: [{ unidad_id: "U1", attempts: 2, correct: 1, omitted: 0, last_practiced_on: day }] });
const submit = p => `select api.submit_practice_delta_v1(${quote(JSON.stringify(p))}::jsonb);`;
let checks = 0;
function check(label, fn) { fn(); checks++; console.log(`OK ${label}`); }
function rejects(query, pattern = /ERROR/) { assert.throws(() => sql(query), error => pattern.test(String(error.stderr))); }
try {
  docker(["run", "--detach", "--name", name, "--network", "none", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine"]);
  let ready = false;
  for (let i = 0; i < 50; i++) {
    // El entrypoint arranca primero un servidor temporal SOLO por socket y luego lo reinicia.
    // Esperar TCP evita confundir ese bootstrap con el servidor final.
    try { docker(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); ready = true; break; } catch { await new Promise(r => setTimeout(r, 200)); }
  }
  if (!ready) throw new Error("PostgreSQL no llegó a ready");
  sql(await readFile(new URL("../supabase/tests/local-postgres-prelude.sql", import.meta.url), "utf8"));
  for (const file of (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter(f => f.endsWith(".sql")).sort()) {
    if (file === "202609070001_practice_aggregates.sql") {
      sql(await readFile(new URL("../supabase/seed-content-placeholder.sql", import.meta.url), "utf8"));
      assert.match(sql(await readFile(new URL("../supabase/tests/schema-contract.sql", import.meta.url), "utf8")), /schema-contract-ok/);
      console.log("OK contrato SQL histórico completo antes de la migración aditiva");
    }
    sql(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  }
  check("migraciones históricas + aditiva aplicadas en base vacía", () => assert.equal(sql("select count(*) from private.responses;"), "0"));
  const contrato = await readFile(new URL("../supabase/tests/schema-contract.sql", import.meta.url), "utf8");
  // El contrato también debe valer con la superficie de práctica ya aplicada: antes sólo se
  // ejecutaba ANTES de esa migración, así que sus tres funciones quedaban sin ninguna aserción.
  check("contrato de esquema sigue valiendo con las funciones de práctica aplicadas", () => assert.match(sql(contrato), /schema-contract-ok/));
  check("columnas históricas conservadas tras la migración", () => sqlRawContract());
  sql(`insert into private.practice_scopes values ('synthetic','course-test','2026','framework-test','v1',current_date-365,current_date+365,true);
    insert into private.practice_units values ('synthetic','U1'), ('synthetic','U2');
    insert into private.practice_codes(scope_id,code_hash) values ('synthetic',${quote(createHash("sha256").update(code).digest("hex"))});`);
  check("sin auth/código incorrecto/lectura sin enrolar rechazados", () => {
    rejects("select api.enroll_practice_v1('synthetic','TESTPAESB');", /authentication_required/);
    rejects(auth("select api.enroll_practice_v1('synthetic','AAAAAAAAA');"), /not_authorized/);
    rejects(auth("select api.get_practice_progress_v1('synthetic');"), /not_authorized/);
  });
  for (const user of users.slice(0, 2)) sql(auth(`select api.enroll_practice_v1('synthetic',${quote(code)});`, user));
  const p = payload();
  check("dos dispositivos autorizados por el mismo código", () => assert.equal(sql("select count(*) from private.practice_bindings;"), "2"));
  check("aceptación + reintento idempotente", () => {
    assert.equal(JSON.parse(sql(auth(submit(p)))).status, "accepted");
    assert.equal(JSON.parse(sql(auth(submit(p), users[1]))).status, "already_accepted");
    assert.equal(sql("select attempts from private.practice_progress;"), "2");
  });
  check("mismo UUID con payload diferente rechazado", () => {
    const conflict = structuredClone(p); conflict.deltas[0].correct = 2;
    rejects(auth(submit(conflict)), /idempotency_conflict/);
  });
  check("cliente sin binding no lee/escribe; scope ajeno rechazado", () => {
    rejects(auth(submit(payload()), users[2]), /not_authorized/);
    rejects(auth("select api.get_practice_progress_v1('synthetic');", users[2]), /not_authorized/);
    rejects(auth("select api.get_practice_progress_v1('another');"), /not_authorized/);
  });
  check("JSON cerrado, enteros, límites, unidad, fecha y duplicados", () => {
    const invalid = [null, {}, {...payload(), responses: []}];
    for (const patch of [{attempts: 0}, {attempts: 1.5}, {correct: 3}, {correct: -1}, {correct: null}, {attempts: "2"}, {attempts: 51}, {unidad_id: "foreign"}, {last_practiced_on: "2026-02-31"}, {last_practiced_on: "2099-01-01"}, {selected_option: "A"},
      {omitted: -1}, {omitted: 1.5}, {omitted: "1"}, {omitted: null}, {attempts: 0, omitted: 0}, {attempts: 30, omitted: 30}]) {
      const bad = payload(); bad.deltas[0] = {...bad.deltas[0], ...patch}; invalid.push(bad);
    }
    const dup = payload(); dup.deltas.push(dup.deltas[0]); invalid.push(dup);
    for (const bad of invalid) rejects(auth(submit(bad)));
    assert.equal(sql("select count(*) from private.practice_receipts;"), "1");
  });
  // Dos grupos concurrentes: el mismo UUID debe contarse una vez; UUID distintos se suman.
  const duplicate = payload(), separate = Array.from({length: 6}, () => payload());
  await Promise.all([...Array.from({length: 6}, () => duplicate), ...separate].map((body, index) => promisify(execFile)("docker", ["exec", name, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-c", auth(submit(body), users[index % 2])])));
  check("12 peticiones concurrentes: una repetida + seis distintas, sin pérdida", () => {
    assert.equal(sql("select attempts || ':' || correct from private.practice_progress;"), "16:8");
    assert.equal(sql("select count(*) from private.practice_receipts;"), "8");
  });
  check("instantánea devuelve agregado, recibos, revisión y tandas terminadas coherentes", () => {
    const snap = JSON.parse(sql(auth(`select api.get_practice_progress_v1('synthetic',array[${quote(p.batch_id)}::uuid]);`)));
    assert.equal(snap.revision, 8); assert.equal(snap.progress[0].attempts, 16); assert.deepEqual(snap.acknowledged, [p.batch_id]);
    assert.equal(snap.progress[0].omitted, 0);
    // Una tanda terminada deja un recibo: el conteo sale de ahí, sin columna nueva.
    assert.equal(snap.sets_completed, 8);
    assert.equal(JSON.stringify(snap).includes("participant"), false);
  });
  // Una tanda íntegramente sin responder se registra: suma omisiones y cuenta como tanda terminada.
  check("omisiones se suman aparte y no inflan intentos ni aciertos", () => {
    const solo = payload(); solo.deltas[0] = {unidad_id: "U2", attempts: 0, correct: 0, omitted: 3, last_practiced_on: day};
    assert.equal(JSON.parse(sql(auth(submit(solo)))).status, "accepted");
    assert.equal(sql("select attempts || ':' || correct || ':' || omitted from private.practice_progress where unidad_id = 'U2';"), "0:0:3");
    const mixta = payload(); mixta.deltas[0] = {unidad_id: "U2", attempts: 2, correct: 2, omitted: 1, last_practiced_on: day};
    assert.equal(JSON.parse(sql(auth(submit(mixta)))).status, "accepted");
    assert.equal(sql("select attempts || ':' || correct || ':' || omitted from private.practice_progress where unidad_id = 'U2';"), "2:2:4");
    assert.equal(JSON.parse(sql(auth("select api.get_practice_progress_v1('synthetic');"))).sets_completed, 10);
  });
  // El denominador debe describir al curso de la fila, no a cualquier ámbito que comparta nombre.
  check("el denominador de la exportación no mezcla otras asignaturas ni ámbitos cerrados", () => {
    sql(`insert into private.practice_scopes values ('otra-asignatura','course-test','2026','framework-test','v2',current_date-365,current_date+365,true);
         insert into private.practice_codes(scope_id,code_hash) values ('otra-asignatura',${quote(createHash("sha256").update("OTROCODIGO").digest("hex"))});
         insert into private.practice_scopes values ('cerrado','course-test','2026','framework-test','v1',current_date-365,current_date+365,false);
         insert into private.practice_codes(scope_id,code_hash) values ('cerrado',${quote(createHash("sha256").update("CODIGOCERRADO").digest("hex"))});`);
    assert.equal(sql("select active_codes from private.practice_course_export_v1 where unidad_id = 'U1';"), "1");
    sql("delete from private.practice_scopes where scope_id in ('otra-asignatura','cerrado');");
  });
  check("un envío sin unidades se rechaza: una tanda terminada siempre toca alguna", () => {
    const vacio = payload(); vacio.deltas = [];
    rejects(auth(submit(vacio)), /empty_delta/);
  });
  check("tablas privadas, RLS y exportación docente inaccesibles al cliente", () => {
    for (const table of ["practice_codes", "practice_bindings", "practice_progress", "practice_receipts", "practice_course_export_v1"]) rejects(auth(`select * from private.${table};`), /permission denied/);
    rejects("set role anon; select api.get_practice_progress_v1('synthetic');", /permission denied/);
    assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'practice_%' and c.relkind='r' and c.relrowsecurity;"), "6");
    // La exportación distingue cuántos estudiantes hay detrás del conteo y su denominador.
    assert.equal(sql("select students || '/' || active_codes || ' ' || attempts || ':' || correct || ':' || omitted from private.practice_course_export_v1 where unidad_id = 'U1';"), "1/1 16:8:0");
    assert.equal(sql("select students || ' ' || attempts || ':' || omitted from private.practice_course_export_v1 where unidad_id = 'U2';"), "1 2:4");
  });
  check("servidor no incorpora columnas de respuesta individual", () => {
    assert.equal(sql("select count(*) from information_schema.columns where table_schema='private' and table_name like 'practice_%' and column_name in ('item_id','selected_option','response_time_ms','responses','payload');"), "0");
    assert.equal(sql("select count(*) from private.responses;"), "0");
  });
  check("revocación y período vencido bloquean ambos dispositivos", () => {
    sql("update private.practice_codes set active=false;");
    for (const user of users.slice(0,2)) rejects(auth("select api.get_practice_progress_v1('synthetic');", user), /not_authorized/);
    sql("update private.practice_codes set active=true; update private.practice_scopes set ends_on=current_date-1;");
    rejects(auth(submit(payload())), /not_authorized/);
  });
  console.log(`PostgreSQL local OK — ${checks} grupos de comprobaciones; sin Supabase remoto.`);
} finally {
  try { docker(["rm", "--force", name]); console.log(`Eliminado contenedor sintético ${name}; no contenía datos reales.`); } catch {}
}
function sqlRawContract() {
  assert.equal(sql("select count(*) from information_schema.columns where table_schema='private' and table_name='responses' and column_name in ('correct','score');"), "0");
}
