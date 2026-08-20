# Operación de Supabase para el diagnóstico

Este directorio contiene un backend de recepción de respuestas crudas. No calcula puntajes ni perfiles y no expone lectura de tablas al navegador.

> **Estado actual: no desplegado y NO-GO.** No hay URL ni clave real configuradas en los datos públicos y `private.administrations.enabled` se siembra como `false`. El contenido sí está cerrado: los 12 ítems ancla quedaron aprobados por el docente y el seed refleja el banco v1.0.

## Modelo de seguridad

La migración crea:

- `private`: marco, contenido, códigos hash, autorizaciones, intentos, respuestas y exportación administrativa;
- `api`: solo los wrappers `enroll_session_v1` y `submit_session_v1` expuestos a PostgREST;
- RLS habilitado en todas las tablas y privilegios de tabla revocados a `public`, `anon` y `authenticated`;
- una función interna `security definer`, con `search_path` vacío y validación completa del payload;
- un wrapper `security definer` mínimo en el esquema expuesto, con `search_path` vacío;
- permisos de ejecución solo para usuarios `authenticated`;
- una comprobación adicional de `auth.jwt().is_anonymous = true`;
- validación de pertenencia al abrir la sesión, sin publicar hashes de cohorte en el cliente;
- idempotencia por `attempt_id` y hash del payload;
- recepción provisional de una entrega cuyo código aún no existe como `orphaned`, seguida de conciliación administrativa explícita;
- recepción uniforme de lotes `device` o `paper`, con reglas temporales específicas para cada procedencia;
- unicidad de estudiante seudónimo + administración;
- `private.raw_response_export_v1`, sin permiso para clientes.

Los accesos anónimos crean un usuario real de Auth que usa el rol `authenticated`, no el rol `anon`. La distinción mediante `is_anonymous` sigue la [documentación oficial de Supabase](https://supabase.com/docs/guides/auth/auth-anonymous). Si se modifica la política, revisar también [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y las recomendaciones para [funciones de base de datos](https://supabase.com/docs/guides/database/functions).

La clave publicable de Supabase puede estar en un cliente estático; su seguridad depende de RLS y de los privilegios de los RPC. El rol cliente solo puede ejecutar `api.enroll_session_v1` y `api.submit_session_v1`: no tiene `USAGE` sobre `private` ni permiso para invocar funciones internas. **Nunca** incorporar al sitio una clave `service_role`, contraseña de base de datos, token personal ni cadena de conexión.

`api` es un esquema dedicado a este contrato. La migración retira privilegios cliente de cualquier
objeto previo en `api` y `private`, y fija privilegios predeterminados restrictivos para los objetos que
cree después el mismo rol propietario. Si otro rol crea objetos en esos esquemas, debe configurar sus
propios `ALTER DEFAULT PRIVILEGES` y volver a ejecutar el contrato de esquema antes del GO.

## Archivos y orden de aplicación

1. `migrations/202607310001_diagnostic_engine.sql`: esquema, tablas, restricciones, RLS y contrato inicial.
2. `migrations/202608020001_enrollment_authority_and_orphans.sql`: autoridad de enrolamiento, sesiones provisionales, entregas huérfanas, conciliación y contrato RPC vigente.
3. `seed-content-placeholder.sql`: marco, banco ancla v1.0, plantilla y administración. El nombre se conserva por compatibilidad histórica; el seed deja la administración deshabilitada.
4. `seed-enrollment-hashes.example.sql`: ejemplo público deliberadamente vacío. El archivo privado `seed-enrollment-hashes.sql` está ignorado por Git y no debe vivir en el árbol que se publica.

Los seeds de contenido son repetibles sobre los mismos IDs, pero no deben usarse para mutar una versión que ya recibió respuestas. Para un nuevo instrumento o aplicación, crear IDs/versiones y seeds nuevos. El enrolamiento real se provisiona desde una fuente restringida controlada por el docente, nunca desde el repositorio público.

## Configuración del proyecto

Antes de ejecutar SQL:

1. crear o seleccionar el proyecto Supabase propio del docente y documentar su región;
2. activar **Anonymous Sign-Ins** en Authentication;
3. añadir `api` a los esquemas expuestos por Data API/PostgREST; no exponer `private`;
4. mantener `public`/`anon` sin ejecución de `api.submit_session_v1`;
5. configurar mitigación de abuso y revisar los límites de Auth;
6. definir responsables de administración, exportación, retención y eliminación;
7. registrar el cambio en el ADR de privacidad.

Aplicar como propietario desde SQL Editor o una conexión administrativa, en este orden:

```text
supabase/migrations/202607310001_diagnostic_engine.sql
supabase/migrations/202608020001_enrollment_authority_and_orphans.sql
supabase/seed-content-placeholder.sql
supabase/seed-enrollment-hashes.example.sql
```

No habilitar todavía la administración. Comprobar primero:

```sql
select framework_id, framework_version, status
from private.framework_versions;

select bank_id, bank_version, status
from private.item_banks;

select session_template_id, session_version, status
from private.session_templates;

select administration_id, enabled, target_date
from private.administrations;

select count(*) as codigos from private.enrollment_codes;
select count(*) as autorizaciones from private.session_authorizations;
```

La configuración pública esperada en este estado técnico es cero códigos, cero autorizaciones y `enabled = false`. La cohorte real se agrega únicamente en el entorno privado de destino.

## Códigos y ledger restringido

`tools/generate-enrollment-codes.mjs` genera códigos en claro, UUID y hashes:

```bash
node tools/generate-enrollment-codes.mjs --count=26 \
  --output=/ruta/restringida/ledger-enrolamiento.json
```

El generador rechaza destinos dentro del repositorio y no sobrescribe archivos existentes. La salida completa es un **secreto operacional**. Debe guardarse directamente en una ubicación restringida bajo control del docente y nunca agregarse a Git, a un issue, a GitHub Actions ni a un registro de consola compartido. El código sintético visible de `?demo=1` es la única excepción y no debe sembrarse como autorización real. Desde el ledger se derivan dos productos privados:

- el seed de hashes/UUID que se aplica directamente al backend privado;
- las tarjetas o sobres individuales con el código en claro.

La asociación entre `ALN-NN`/UUID y una persona vuelve identificable el conjunto. Mantener esa correspondencia separada de las respuestas y limitar quién puede unir ambas fuentes. El despliegue público mantiene `hashes_permitidos: []` de forma permanente. El cliente comprueba solo forma y checksum; con red, `api.enroll_session_v1` determina la pertenencia. Sin red o ante una falla transitoria, la sesión continúa como provisional y se concilia al respaldar. Un rechazo definitivo de pertenencia no permite comenzar.

## Validación local de PostgreSQL

Los archivos de `tests/` permiten revisar sintaxis, privilegios, inventario e idempotencia en PostgreSQL 16. El *harness* local simula roles y funciones de Auth; no sustituye una prueba contra un proyecto Supabase real.

Ejemplo con un contenedor temporal y un ledger restringido local:

```bash
docker run --name paes-sql-check \
  -e POSTGRES_PASSWORD=diagnostic-local-only \
  -d postgres:16

docker exec -i paes-sql-check psql -v ON_ERROR_STOP=1 -U postgres \
  < supabase/tests/local-postgres-prelude.sql
docker exec -i paes-sql-check psql -v ON_ERROR_STOP=1 -U postgres \
  < supabase/migrations/202607310001_diagnostic_engine.sql
docker exec -i paes-sql-check psql -v ON_ERROR_STOP=1 -U postgres \
  < supabase/migrations/202608020001_enrollment_authority_and_orphans.sql
docker exec -i paes-sql-check psql -v ON_ERROR_STOP=1 -U postgres \
  < supabase/seed-content-placeholder.sql
docker exec -i paes-sql-check psql -v ON_ERROR_STOP=1 -U postgres \
  < supabase/tests/schema-contract.sql

node supabase/tests/run-local-rpc-test.mjs \
  /ruta/al/ledger-restringido.md paes-sql-check
```

Al terminar, eliminar **solo** ese contenedor temporal:

```bash
docker rm -f paes-sql-check
```

El test RPC inyecta transitoriamente registros desde el ledger restringido, habilita la administración solo dentro del contenedor y no escribe esos valores en el repositorio. Comprueba: enrolamiento conocido y rechazo genérico de código ajeno; rechazo de JWT no anónimo; rechazo de lote incompleto, alternativa inexistente y marco inconsistente; entrega de 12 respuestas de dispositivo con tiempos; forma exacta de los recibos; reintento idempotente con la misma identidad, después de perder la sesión Auth y después de cerrar la administración/vencer el código; conservación de la identidad Auth original; rechazo de un intento nuevo desde la identidad de reemplazo, de un segundo intento para la misma administración y de un payload conflictivo; entrega de 12 respuestas de papel sin tiempos; y recepción, reintento y conciliación privada de una entrega huérfana.

## Activación del cliente

Solo después del GO pedagógico, legal y técnico, editar una nueva versión de `data/paes-ciencias-2027/deployment.v1.json` o su sucesora:

```json
{
  "backend": {
    "enabled": true,
    "url": "https://ID-REAL.supabase.co",
    "publishable_key": "CLAVE_PUBLICABLE_REAL",
    "schema": "api",
    "enrollment_rpc_name": "enroll_session_v1",
    "rpc_name": "submit_session_v1"
  }
}
```

Los valores anteriores son marcadores explicativos, no credenciales. No copiarlos literalmente. Preferir una nueva versión del despliegue y actualizar `data/active.json` para conservar trazabilidad.

Configurar el backend no basta para abrir el modo real. La cohorte y sus hashes se cargan únicamente en el backend privado; `hashes_permitidos` debe seguir vacío. Antes del GO hay que probar la consulta de enrolamiento, el inicio provisional sin red, el rechazo definitivo, la recepción huérfana y su conciliación desde la URL publicada.

Cuando el proyecto final ya pasó el ensayo extremo a extremo, el propietario puede habilitar exclusivamente la administración aprobada:

```sql
update private.administrations
set enabled = true
where administration_id = 'ivb-2026-ancla-01';
```

Antes de hacerlo, verificar que contenido y plantilla en base coincidan byte/versión con los publicados. Para detener ingresos, ejecutar el mismo cambio con `enabled = false`; no es necesario retirar GitHub Pages para cerrar el RPC.

## Qué validan los RPC

`api.enroll_session_v1` se consulta al abrir una sesión con red. Verifica la identidad Auth anónima, la administración, la forma y el checksum, y la pertenencia del código al ledger privado. Si autoriza, liga el código a esa identidad. Los rechazos de pertenencia usan un mensaje genérico para no revelar qué códigos existen. Una indisponibilidad transitoria no se interpreta como rechazo: el cliente marca la sesión como provisional.

`api.submit_session_v1` rechaza:

- llamadas sin sesión Auth o con usuario no anónimo;
- administración inactiva o fuera de ventana;
- código con forma/checksum inválido; si el código ya existe, autorización deshabilitada, prematura o vencida;
- un código ligado antes a otro usuario Auth;
- plantilla, versión o marco distintos de la administración;
- cantidad incompleta de respuestas;
- ítems, versiones, orden o alternativa no pertenecientes a la plantilla;
- omisiones inconsistentes, IDs repetidos o un lote que mezcle procedencias;
- dispositivo sin inicio, con término anterior al inicio o con tiempos por ítem ausentes/fuera de rango;
- papel con inicio informado o con tiempos por ítem inventados;
- un segundo intento del mismo código en la administración;
- reutilización de `attempt_id` con un payload distinto.

Si una sesión provisional presenta un código todavía ausente del ledger, el RPC conserva el intento y sus respuestas con `reconciliation_status = 'orphaned'`, `enrollment_code_id = null` y solo el hash del código presentado. Devuelve `orphaned`; un reintento idéntico devuelve `already_orphaned`. La función privada `private.reconcile_orphaned_attempt` permite asociarlo después de provisionar la autorización correcta. No está expuesta al cliente.

Para un código conocido, un reintento idéntico devuelve `already_synced` y no duplica filas.

Ese acuse idempotente sigue disponible si el primer intento quedó confirmado pero luego se cerró o deshabilitó la administración, venció el código o se perdió la identidad Auth local. No crea una escritura nueva: exige el mismo código, `attempt_id` y payload exacto. Las puertas mutables de administración, ventana y vigencia del código continúan aplicándose a todo intento nuevo.

## Exportación cruda

La vista administrativa tiene una fila por respuesta y las mismas columnas permitidas por el CSV local. Incluye `reconciliation_status`; una entrega huérfana conserva `participant_ref = null` hasta su conciliación:

```sql
select *
from private.raw_response_export_v1
where administration_id = 'ivb-2026-ancla-01'
order by participant_ref, presentation_order;
```

Ejecutar la consulta solo como propietario/rol administrativo en SQL Editor o mediante una conexión segura y descargar el resultado como CSV. No conceder acceso a la vista al cliente, no exponer `private` en Data API y no copiar una clave privilegiada al navegador.

Validaciones posteriores a la exportación:

- 12 filas por intento completo;
- combinación `response_id` única;
- orden 1–12 sin duplicados;
- `selected_option` vacío exactamente cuando `omitted = true`;
- ningún campo de clave, acierto, puntaje, porcentaje, nota, ranking, estado o diagnóstico;
- conciliación de respaldos manuales sin duplicar intentos.

La exportación cruda no es todavía una guía de reforzamiento. Cualquier análisis debe ocurrir en un entorno separado, versionado y con las mismas reglas pedagógicas aprobadas.

## Papel y respaldos manuales

El código/QR final puede convertirse a CSV local desde `backup.html`; esa herramienta no escribe en Supabase. El formato compacto `DX3` conserva el estado confirmado/provisional y los identificadores crudos para idempotencia, y solo se reconstruye contra la versión exacta del paquete activo; el recuperador también acepta los formatos legados `DX1` y `DX2`. La hoja de `print.html` puede asociarse a un código opaco y `paper.html` permite transcribir sus 12 marcas, validarlas y generar CSV/código/QR sin inventar tiempos.

El mismo `api.submit_session_v1` admite el envío desde `paper.html`, pero somete ambos orígenes a reglas distintas:

1. todas las respuestas de un lote deben tener el mismo `source`;
2. dispositivo requiere `started_at`, un término igual o posterior y tiempo válido en cada ítem;
3. papel requiere `started_at = null`, término válido y `response_time_ms = null` en cada ítem;
4. ambos validan código/autorización, 12 ítems, versiones, alternativas, orden, unicidad e idempotencia.

La ruta papel pasó el *harness* PostgreSQL local con un código distinto al de dispositivo. Eso no acredita el backend de producción: antes de ofrecerla hay que aplicar esta migración en el proyecto final, probar el envío desde la URL de GitHub Pages y conciliar sus 12 filas. El CSV y el QR siguen siendo el respaldo si la red o el RPC fallan.

## Privacidad, logs y retención

Supabase Auth registra automáticamente eventos de autenticación. Sus [logs de auditoría incluyen IP y agente de usuario](https://supabase.com/docs/guides/auth/audit-logs), y siguen existiendo en el almacenamiento externo del dashboard incluso si se desactiva su copia en `auth.audit_log_entries`. Por esto el sistema es seudonimizado, no una solución en la que ningún dato técnico salga del dispositivo.

Antes del piloto, el docente debe fijar y registrar en el ADR como mínimo:

- responsable del tratamiento y administradores del proyecto;
- finalidad exclusiva y usos prohibidos;
- región del proyecto y terceros involucrados;
- aviso para estudiantes y, si corresponde, apoderados;
- plazo de conservación de respuestas, ledger, Auth y logs;
- exportación final, eliminación verificable y tratamiento de respaldos;
- respuesta ante código perdido, teléfono compartido, fuga o acceso indebido.

Supabase no elimina automáticamente usuarios anónimos; la [documentación de Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous) entrega un ejemplo de limpieza. No ejecutar una eliminación por antigüedad sin cruzarla con la retención definida por el docente y sin confirmar que no afectará una sesión activa.

## Capacidad y disponibilidad el día de aplicación

La documentación oficial vigente al 31-07-2026 indica un límite predeterminado de [30 solicitudes de ingreso anónimo por hora y por IP](https://supabase.com/docs/guides/auth/auth-anonymous), modificable en el dashboard. Con 26 estudiantes que comparten la misma IP pública, cuatro solicitudes de margen no cubren ensayo docente, errores ni reingresos. Ajustar el límite y hacer una prueba de concurrencia desde la red real es obligatorio; CAPTCHA/Turnstile también es recomendado por Supabase para evitar abuso.

Los proyectos Free con poca actividad durante siete días pueden [pausarse automáticamente](https://supabase.com/docs/guides/platform/free-project-pausing). Un plan pagado no está sujeto a esa pausa. Para el 17-08-2026 se debe, como mínimo, revisar avisos del propietario y probar Auth + RPC desde la URL pública dentro de la semana previa; si la continuidad es crítica, usar un plan que no se pause.

## GO / NO-GO de backend

### GO solo si

- [ ] los 12 ítems, claves, distractores y reglas están aprobados y versionados;
- [ ] el docente registró su decisión de privacidad y definió el aviso final;
- [ ] ledger, hashes y UUID derivados permanecen fuera del repositorio y del sitio público;
- [ ] migración, seeds y privilegios fueron auditados en el proyecto correcto;
- [ ] Auth anónimo, esquema `api`, límite por IP y mitigación de abuso fueron configurados;
- [ ] cliente publicado usa solo URL y clave publicable reales;
- [ ] prueba desde GitHub Pages confirmó `synced`, `already_synced` y 12 filas únicas para dispositivo;
- [ ] otra prueba confirmó apertura provisional, recibos `orphaned`/`already_orphaned` y conciliación privada sin pérdida ni duplicación;
- [ ] si habrá papel, otra prueba confirmó envío `paper`, tiempos nulos y conciliación sin duplicados;
- [ ] prueba offline confirmó cola, reintento y recuperación manual;
- [ ] exportación, retención, eliminación y cierre de administración tienen responsables;
- [ ] disponibilidad del proyecto fue verificada en la semana de aplicación.

### NO-GO automático si

- persisten ítems pendientes de revisión, etiquetas provisionales o banderas de bloqueo;
- falta proyecto/credencial real o la administración sigue deshabilitada;
- se pretende usar `service_role` en el sitio;
- los 26 dispositivos no pueden autenticarse desde la red real;
- se afirma anonimato total pese a los metadatos técnicos del proveedor;
- el papel se ofrece sin haber aplicado la migración compatible y probado su envío/conciliación real;
- no se puede exportar y conciliar respuestas crudas sin puntajes ni diagnósticos.
