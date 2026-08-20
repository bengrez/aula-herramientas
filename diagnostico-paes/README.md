# Diagnóstico PAES: mapa para seguir aprendiendo

Aplicación web estática, instalable y *offline-first* para una sesión diagnóstica breve de Ciencias. Presenta una secuencia fija sin nota ni retroalimentación por ítem, conserva el avance en el dispositivo y, al terminar, muestra un mapa cualitativo de evidencia. La misma aplicación puede dejar una entrega pendiente para sincronizar con Supabase o producir un respaldo manual recuperable como CSV crudo.

> **Estado actual: NO-GO para estudiantes, con el contenido ya cerrado.** El banco ancla v1.0 contiene los 12 ítems aprobados por el docente —los tres del piloto el 2026-08-02 y los nueve restantes el 2026-08-03—, de modo que los dos gates pedagógicos están cerrados. Lo que falta es físico y operativo: teléfono sin conexión, impresión, respaldo por QR y operación de sala, más la URL pública y el backend. Los 12 ítems tienen rol de `contexto`, por lo que no producen evidencia de contenido en el mapa. `pilot_ready` es `false`, el backend está desactivado y la administración de base de datos se crea deshabilitada. `?demo=1` permite revisar un flujo aislado; no convierte esta versión en un piloto válido.

La administración **no declara fecha objetivo** (`fecha_objetivo: null`): la del 17 de agosto de 2026 pasó sin que la sesión se aplicara y arrastrarla haría pasar por vigente algo que no lo está. `npm run readiness` la lista como pendiente. Al fijar la fecha real basta con escribir `administracion.fecha_objetivo` y `administracion_id` en `deployment.v1.json` y regenerar el seed; el nombre del archivo de sesión ya no la codifica.

## Qué hace y qué no hace

La versión v1:

- solicita un código opaco, no nombre, RUN ni correo;
- comprueba localmente solo la forma y el checksum del código; la pertenencia a la administración es autoridad exclusiva del backend;
- ejecuta una sesión ancla de orden fijo, sin retroceso y con omisión explícita;
- guarda perfil, intento, respuestas, instantánea de datos y cola de envío en IndexedDB;
- mantiene los recursos esenciales en caché mediante un *service worker*;
- reanuda una sesión interrumpida en el mismo navegador;
- evita repetir la misma administración en ese navegador;
- calcula en el cliente un mapa cualitativo desde reglas versionadas, sin persistir ese resultado;
- guarda y exporta respuestas crudas, sin puntaje, nota, porcentaje, ranking ni diagnóstico persistido;
- después de un respaldo en nube confirmado, permite borrar código, respuestas, instantánea, cola y token locales, conservando solo una marca de cierre sin identificador personal;
- permite imprimir la sesión y recuperar un código/QR de respaldo como CSV.

No es una prueba segura de alto impacto. El banco y sus claves se publican como JSON porque el mapa se calcula localmente; una persona con herramientas de desarrollo puede inspeccionarlos. Tampoco genera todavía guías de reforzamiento: ese uso corresponde a una iteración posterior.

## Arquitectura

| Capa | Responsabilidad | Archivos principales |
|---|---|---|
| Entrada web | Aplicación, hoja de acceso, impresión, transcripción de papel y recuperación docente | `index.html`, `access.html`, `print.html`, `paper.html`, `backup.html` |
| Motor genérico | Contratos, sesión, códigos, evidencia y CSV; no contiene vocabulario PAES | `src/engine/` |
| Interfaz | Pantallas y renderizadores de estímulos | `src/ui/` |
| Infraestructura cliente | IndexedDB, cola, cliente HTTP, QR y registro del *service worker* | `src/infra/` |
| Contrato de datos | Selección de versiones y recursos que se guardan para uso offline | `data/active.json` |
| Contenido versionado | Marco, banco, plantilla y configuración de despliegue | `data/paes-ciencias-2027/` |
| Backend opcional | Tablas privadas, RPC de inserción y vista administrativa cruda | `supabase/` |
| Verificación | Contratos, unidades, preflight y pruebas PostgreSQL | `tests/`, `tools/`, `supabase/tests/` |

El motor carga cuatro documentos enlazados por `data/active.json`:

1. `framework`: habilidades, criterios, áreas, unidades, matriz contenido × habilidad y tabla cualitativa de inferencia.
2. `bank`: estímulos, alternativas, claves y referencias al marco.
3. `session`: versión del banco, orden fijo y reglas de navegación.
4. `deployment`: textos de interfaz, administración, fecha, modo de publicación y conexión opcional al backend. `hashes_permitidos` permanece vacío por contrato: los hashes reales nunca se publican en el cliente.

Los intentos guardan una instantánea de esos cuatro documentos. Por eso una actualización posterior del sitio no debe reinterpretar una sesión ya iniciada.

### Contrato del banco ancla v1.0

La sesión presenta exactamente este orden: `A-01`, `B-02`, `C-03`, `D-01`, `A-02`, `B-03`, `C-01`, `D-02`, `A-03`, `B-01`, `C-02`, `D-03`. Los contratos comprueban además que no se repitan consecutivamente criterio ni eje y que las claves queden balanceadas en tres A, tres B, tres C y tres D.

Los 12 ítems son anclas de habilidad con `unidad_rol: "contexto"`. Sus referencias de contenido sirven para describir el estímulo, pero se excluyen deliberadamente de `content_zones`; por eso este banco, por sí solo, deja el mapa de contenido como territorio pendiente. Una futura sesión que busque medir contenido deberá incorporar unidades con rol `medicion` y evidencia suficiente.

Una respuesta visible por menos de 10 segundos se marca como rápida. En la sesión ancla conserva su evidencia, porque el tiempo es una señal de revisión y no una razón automática para descartarla; en un modo autónomo se excluye de la cobertura. El umbral y ambas decisiones son configuración explícita y deben recalibrarse con datos reales.

## Ejecución local

Requiere Node.js 20 o superior y no necesita instalar dependencias de ejecución.

```bash
cd diagnostico-paes
npm run serve
```

Abrir:

- `http://127.0.0.1:4173/` para comprobar el bloqueo normal de la versión pendiente;
- `http://127.0.0.1:4173/?demo=1` para recorrer la demostración técnica;
- `http://127.0.0.1:4173/print.html` para la versión imprimible;
- `http://127.0.0.1:4173/paper.html?demo=1` para probar la transcripción de papel;
- `http://127.0.0.1:4173/backup.html?demo=1` para convertir localmente un respaldo de demostración a CSV;
- `http://127.0.0.1:4173/access.html?demo=1` para revisar la hoja imprimible con URL y QR de acceso.

No se debe abrir `index.html` con `file://`: los módulos, `fetch`, IndexedDB y el *service worker* requieren un origen HTTP(S).

## Pruebas

```bash
npm test
npm run validate
npm run readiness
git diff --check
```

`npm test` cubre contratos, códigos, aislamiento de demostración, sesión, mapa de evidencia, transcripción de papel, sincronización, recuperación CSV y el gate de liberación. `npm run validate` verifica el inventario esperado, las referencias cruzadas, la disponibilidad de recursos offline, la ausencia de CDN, los gates de runtime y que el motor continúe siendo agnóstico al contenido. `npm run readiness` enumera con estado `OK` o `PENDIENTE` cada condición de GO; `npm run release-check` usa el mismo análisis y termina con error mientras exista una condición pendiente, por lo que sirve como gate antes de publicar el piloto.

La demostración usa una base IndexedDB y una administración distintas, acepta exclusivamente el código demo y fuerza el backend a deshabilitado aunque la configuración real esté activa. Por eso no consume códigos reales, no envía respuestas a la administración del curso y no puede dejar un intento que bloquee el piloto en el mismo navegador.

Antes de liberar también se necesita una prueba manual en un teléfono real:

1. cargar una vez con conexión y esperar que el modo offline quede listo;
2. iniciar, responder algunos ítems, recargar y comprobar reanudación;
3. desconectar la red, completar y verificar que aparece el mapa y el respaldo;
4. reconectar, reintentar y confirmar una sola entrega en Supabase;
5. borrar la copia local después del respaldo confirmado, volver a abrir y comprobar que solo aparece la marca de cierre y no se inicia un segundo intento;
6. ensayar un código inválido y uno ajeno a la administración;
7. revisar teclado, orientación, contraste, zoom, foco y lectura de tablas en pantalla pequeña;
8. imprimir o guardar PDF y comprobar cortes, alternativas y hoja de respuesta;
9. escanear el QR con la cámara de un teléfono distinto, decodificar también el texto en otro navegador y comparar las 12 filas crudas.

## Sustituir marco, banco o sesión sin tocar el motor

No se editan `src/`, `index.html` ni `sw.js` para cambiar de asignatura, marco o conjunto de ítems.

1. Crear archivos nuevos y versionados dentro de `data/<proyecto>/`. No sobrescribir una versión que ya haya sido utilizada.
2. Mantener `schema_version: 1` y asignar identificadores/versiones nuevos.
3. En el banco, referir un `unidad_id` y un `criterio_id` existentes en el marco, y declarar `unidad_rol: "medicion" | "contexto"`. Cada alternativa debe tener ID único, diagnóstico de distractor y la `clave` debe apuntar a una de ellas. Solo `medicion` aporta evidencia de contenido; `contexto` puede aportar evidencia de habilidad.
4. En la sesión, referir exactamente `banco_id`, `banco_version`, `marco_id` y `marco_version`; usar órdenes correlativos desde 1.
5. En el despliegue, referir la plantilla y versión activas. Mientras falte cualquier gate, conservar `release_status: "placeholder"` y `pilot_ready: false`.
6. Actualizar las cuatro URL, el inventario esperado de `validation` y todos los recursos necesarios en `data/active.json`. Todo archivo requerido sin red debe aparecer en `offline_assets`. Al detectar un `active.json` distinto, el *service worker* solo activa ese manifiesto después de precargar correctamente su conjunto offline; una falla deja la nueva versión fuera de servicio en vez de anunciarla como lista sin red. Si cambia el propio código, el nuevo controlador toma control y fuerza una única recarga antes de iniciar, evitando mezclar módulos antiguos y nuevos.
7. Regenerar `supabase/seed-content-placeholder.sql` con `node tools/generate-content-seed.mjs` y revisar el resultado. El generador resuelve los cuatro documentos desde `data/active.json`, así que renombrar un banco o refechar una sesión no exige tocarlo. El nombre del archivo se conserva por compatibilidad histórica; el seed refleja el banco ancla v1.0 y deja la administración deshabilitada.
8. Ejecutar las pruebas automáticas y el recorrido manual completo.

Para regenerar el marco desde su documento maestro:

```bash
node tools/build-framework-from-markdown.mjs /ruta/al/ref-paes-ciencias-admision-2027-scope-diagnostico.md
```

El comando escribe JSON en la salida estándar. Revisarlo y guardarlo como una **nueva versión** mediante un flujo controlado; no reemplazar a ciegas el archivo activo. Las etiquetas públicas y la tabla de inferencia requieren validación docente independiente del parseo técnico.

## Modos de continuidad y recuperación

### Sin conexión

Después de una primera carga completa, los recursos declarados en `offline_assets` quedan disponibles y las respuestas se acumulan en IndexedDB. Una tarjeta aceptada provisionalmente se vuelve a consultar si la red está disponible antes de crear o comenzar el intento. Si el backend está habilitado, la cola vuelve a intentarlo al reabrir o mediante el control de reintento; cada ejecución queda acotada al intento y administración activos, de modo que no envía colas históricas a otro despliegue. No borrar datos del sitio, cambiar de navegador ni desinstalar la aplicación antes de confirmar el envío o guardar el respaldo: la identidad anónima y el intento pertenecen a ese almacenamiento local.

### Código y QR de respaldo

Al finalizar, la aplicación representa el intento y sus respuestas en un código compacto `DX3` con control de integridad y en un QR del mismo contenido. Conserva el estado de enrolamiento confirmado/provisional, los UUID y los datos crudos necesarios para una entrega idempotente, pero deriva del paquete activo los metadatos repetidos de sesión e ítem; por eso `backup.html` exige que el respaldo corresponda exactamente a la versión publicada. La herramienta mantiene compatibilidad de lectura con los formatos anteriores `DX1` y `DX2`.

El docente puede pegar el texto en `backup.html` y descargar un CSV de respuestas crudas. La conversión ocurre localmente; `backup.html` no envía el contenido a Supabase. El caso papel sintético actual bajó de 2.217 a 745 caracteres y de 157 a 93 módulos QR; una simulación de dispositivo de 25 minutos produjo 851 caracteres y 97 módulos. El render usa tres píxeles nativos por módulo y conserva su zona silenciosa dentro del lienzo. Esto reduce sustancialmente la densidad, pero el escaneo con la cámara y condiciones reales de luz sigue siendo un gate del piloto.

El QR/código es una vía de recuperación, no cifrado. Contiene el código opaco y las respuestas, por lo que debe tratarse como información restringida y eliminarse una vez conciliada la entrega.

### Papel

`print.html` produce una sesión sin nombre y una hoja de respuestas asociada al código opaco. `paper.html` valida el código, exige una marca u omisión por cada uno de los 12 ítems y genera CSV, código y QR de respaldo. Conserva `source = paper`, deja `response_time_ms` sin dato y no calcula claves ni resultados.

El mismo RPC `api.submit_session_v1` acepta lotes homogéneos de dispositivo o papel. Para papel exige `started_at = null`, `response_time_ms = null` en todas las filas y un término válido; no permite mezclar procedencias. La prueba PostgreSQL local cubre ambas rutas con códigos distintos. El envío real sigue en NO-GO hasta aplicar esta versión de la migración al proyecto definitivo y repetir el ensayo extremo a extremo desde `paper.html` publicado; mientras tanto, conservar CSV y respaldo permite recuperar la transcripción.

## Privacidad y modelo de datos

El diseño previsto es **seudonimizado, no anónimo**. La aplicación no solicita nombres, RUN, correo ni teléfono, pero el código permite vincular respuestas con una referencia de estudiante si existe una tabla de correspondencia separada. Los códigos reales, sus hashes, los UUID de enrolamiento y cualquier correspondencia deben mantenerse fuera de este repositorio, con acceso restringido. En el estado NO-GO actual, el despliegue público y el seed versionado contienen cero registros de cohorte. La única excepción es el código sintético de demostración, que es público por diseño y no debe autorizar una administración real; nunca se debe publicar el ledger del curso.

En el dispositivo quedan temporalmente el código, la sesión anónima, la instantánea y las respuestas en IndexedDB/localStorage. Al abrir una sesión con red y backend activos, el cliente crea o recupera la identidad anónima de Auth y consulta `api.enroll_session_v1`; el servidor decide si el código pertenece a la administración. Sin red, con backend desactivado o ante una falla transitoria, la sesión queda marcada como `provisional` y puede continuar. Al respaldarla, un código aún desconocido se conserva como entrega huérfana para conciliación privada, sin inventar una asociación de estudiante. Tras recibir confirmación, el control “Borrar copia de este teléfono” elimina perfil/código, intento, respuestas, instantánea, cola y token Auth; conserva únicamente administración, fechas de término/purga y estado `local_copy_purged` para impedir una repetición accidental. Esa acción no borra la entrega en Supabase.

En Supabase, `private.responses` conserva solo respuesta seleccionada u omisión, tiempos, orden, versiones e identificadores opacos. No incluye clave, acierto/error, puntaje, nivel ni diagnóstico. La vista `private.raw_response_export_v1` está revocada para clientes y es solo administrativa.

No es correcto afirmar que “ningún dato identificante sale del dispositivo”. [GitHub Pages registra la dirección IP de cada visita por motivos de seguridad](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection). Cuando se intenta el respaldo, Supabase Auth registra eventos y sus [logs de auditoría incluyen dirección IP y agente de usuario](https://supabase.com/docs/guides/auth/audit-logs); además, el proveedor procesa metadatos técnicos de conexión. Antes del uso real, el docente debe dejar definidos y registrados en el ADR de privacidad la información a estudiantes, la región, responsables, finalidad, plazos de conservación, exportación y eliminación. El ADR registra una decisión docente propia; no es una solicitud de aprobación institucional ni un `release_gate` del código.

Los usuarios anónimos de Supabase operan con el rol PostgreSQL `authenticated` y se distinguen mediante `is_anonymous`; esto está contemplado en el RPC y debe conservarse al cambiar políticas. Véase la [documentación oficial de accesos anónimos](https://supabase.com/docs/guides/auth/auth-anonymous), la guía de [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) y la de [funciones de base de datos](https://supabase.com/docs/guides/database/functions).

## Despliegue en GitHub Pages

La aplicación no necesita compilación. Debe publicarse como la carpeta `diagnostico-paes/` del repositorio de GitHub Pages, manteniendo su estructura relativa completa. Con una página de proyecto, la URL esperada será equivalente a:

```text
https://<usuario>.github.io/<repositorio>/diagnostico-paes/
```

Flujo de publicación:

1. ejecutar pruebas y checklist GO/NO-GO;
2. copiar la carpeta completa, sin ledgers, credenciales privadas ni artefactos de prueba;
3. añadir un enlace desde la portada del repositorio si corresponde;
4. confirmar `operacion.url_publica` y revisar `access.html?demo=1`; la hoja real permanece bloqueada mientras `pilot_ready` sea falso;
5. publicar mediante la rama/carpeta ya configurada en GitHub Pages;
6. abrir la URL final, confirmar que no redirige a otra página y revisar consola/red;
7. cargar una vez, activar modo sin conexión y recargar desde la URL final;
8. comprobar que el *service worker* solo controla `/diagnostico-paes/`;
9. verificar que los enlaces de acceso, impresión y respaldo funcionan bajo el subdirectorio.

Un teléfono usado con versiones técnicas anteriores debe abrirse online y completar la recarga automática de actualización antes de entrar al modo avión. Si aparece el mensaje de recarga manual, cerrar todas las pestañas de la herramienta, volver a abrir la URL pública y comprobar la versión visible antes del piloto.

Publicar la versión actual solo publica una demostración bloqueada. Para configurar la recepción real, seguir [supabase/README.md](supabase/README.md).

## Checklist de preparación y liberación para el 17-08-2026

El recurso es una herramienta docente personal. Este checklist no exige aprobación de UTP, PIE ni de otra instancia del establecimiento. `npm run readiness` aplica controles automáticos y seis `release_gates` de calidad; la decisión expresa del docente de publicar queda representada por `release_status` y `pilot_ready`.

### Contenido y medición

- [x] Los 12 ítems del banco ancla v1.0 fueron revisados por contenido, lenguaje, accesibilidad, clave y distractores: `A-01` a `A-03` el 2026-08-02 y `B-01` a `D-03` el 2026-08-03.
- [ ] El banco pasó de `estado_autoria: contenido_docente_pendiente_revision` al estado final aprobado, sin perder la trazabilidad por ítem.
- [ ] Las etiquetas públicas, estados y tabla de inferencia fueron aprobados por el docente responsable.
- [ ] Cada criterio objetivo tiene evidencia suficiente; “territorio aún no medido” sigue siendo distinto de desempeño débil.
- [ ] La versión impresa coincide exactamente con la versión digital aprobada.

### Privacidad y operación

- [ ] El docente dejó registrada su decisión sobre finalidad, región, roles, aviso, retención, eliminación e incidentes; cambiar el ADR de `proposed` a `accepted` es una decisión suya y no un permiso de terceros.
- [ ] La información a estudiantes describe correctamente la seudonimización y los logs técnicos del proveedor.
- [ ] El ledger, sus hashes y los UUID derivados están fuera de Git/GitHub/Supabase Storage y tienen responsable y acceso definido.
- [ ] Se definió cuándo ejecutar la purga local y se comprobó que elimina datos detallados, conserva el cierre y no afecta la entrega remota.
- [ ] Hay un código por estudiante, sobres de entrega o mecanismo equivalente y un procedimiento de contingencia.
- [ ] Si se ofrecerá papel, se ensayaron transcripción, CSV/QR, envío por el RPC real y conciliación sin duplicados.

### Backend y concurrencia

- [ ] El docente seleccionó su proyecto y región de Supabase; Auth anónimo y esquema `api` están configurados.
- [ ] Migración y seeds fueron aplicados en el proyecto correcto; no se usó `service_role` en el cliente.
- [ ] `backend.enabled`, URL y clave publicable corresponden al proyecto final; no son valores inventados.
- [ ] La administración está habilitada solo después de las pruebas y dentro de la ventana de aplicación definida por el docente.
- [ ] Se probó el flujo real desde GitHub Pages: entrega, idempotencia, reintento, rechazo de código y no repetición.
- [ ] Se verificó la exportación de 12 filas por intento y la ausencia de columnas derivadas.
- [ ] Se ajustó y ensayó el límite de autenticación anónima para la red del colegio. El valor predeterminado actual es [30 solicitudes por hora y por IP](https://supabase.com/docs/guides/auth/auth-anonymous); 26 dispositivos bajo una misma salida a Internet dejan margen insuficiente para ensayo, errores o reintentos.
- [ ] Se habilitó mitigación de abuso adecuada, como CAPTCHA/Turnstile, o el docente documentó una alternativa compatible con el contexto de aula.
- [ ] Se confirmó que el proyecto estará activo durante la aplicación. Supabase puede [pausar proyectos Free con baja actividad durante siete días](https://supabase.com/docs/guides/platform/free-project-pausing); realizar una comprobación dentro de la semana previa o usar un plan que no se pause.

### Ensayo final

- [ ] Un teléfono de gama baja completó la sesión online y offline sin pérdida de datos.
- [ ] Un cierre/recarga a mitad de sesión reanudó exactamente el mismo ítem.
- [ ] Un corte de red al finalizar quedó en cola y sincronizó una sola vez al volver la conexión.
- [ ] La cámara de un segundo teléfono leyó el QR en condiciones de sala; QR y código manual produjeron un CSV equivalente y fueron conciliados sin duplicar el intento.
- [ ] Docente y apoyo de sala ensayaron mensajes, tiempos, papel, recuperación y criterios para detener la aplicación.

Los seis campos de `release_gates` son `contenido_real_revisado`, `criterios_y_reglas_aprobados`, `telefono_offline_validado`, `qr_respaldo_validado`, `impresion_validada` y `operacion_sala_validada`. El backend sigue sujeto a comprobaciones técnicas automáticas, no a aprobación institucional. Solo después de completar esos controles y de que el docente decida publicar se cambian coordinadamente el banco/semilla, `release_status`, `pilot_ready`, `backend.enabled` y `private.administrations.enabled`. El preflight rechaza un `pilot_ready: true` si falta cualquiera de esos gates. La aplicación, la hoja de acceso, la impresión y la transcripción vuelven a evaluar el conjunto completo en runtime: cambiar una sola bandera no constituye una liberación.
