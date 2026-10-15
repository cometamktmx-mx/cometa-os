# Magenta: lanzamiento autorizado - 15 de octubre de 2026

## Resultado vigente del lanzamiento

### Verificación autenticada posterior al lanzamiento

Completada el 15/10/2026 con la sesión real iniciada por el usuario en `app.cometaos.com`, sin crear cuentas ni extraer credenciales. POS, Caja y catálogo cargaron; Caja mostró cero turnos y el catálogo real un producto/27 variantes. Desde Configuración se abrió el asistente ELEVENTA y se consultaron los historiales de Productos, Inventario y Clientes. Inventario exige sucursal; seleccionando Principal se habilita Archivo, y sin archivo no permite revisar correspondencias. No se cargaron muestras ni se confirmó ninguna importación.

La prueba encontró y corrigió un rechazo indebido del administrador global al guardar Personalización: una comprobación adicional exigía membresía local después de la autorización central. `983cf39`, integrado por [PR #3](https://github.com/cometamktmx-mx/cometa-os/pull/3), merge `86dd88b`, elimina únicamente esa comprobación redundante y conserva `requirePosMutationAccess(settings.manage)`. La prueba ejecuta ruta, política y RBAC reales con transporte simulado: administrador global y owner/admin permitidos; roles restringidos, no autenticado, marca ajena y Food sin operador rechazados. Sin cambios de roles, permisos persistidos, schema o inventario. TypeScript, lint dirigido, prueba de permisos y build pasaron. Administración actual: `https://cometa-3w0ahzu0f-cometa-os-s-projects.vercel.app`, READY/Production, promovida al dominio existente; storefront sin nuevo despliegue.

Guardado reversible realizado desde la interfaz: Personalización → Tema **Oscuro → Sistema**, guardar y recargar confirmó `system`; después **Sistema → Oscuro**, guardar y recargar confirmó `dark`. Todos los campos del formulario volvieron a sus valores iniciales. Comparación de DB antes/después: configuración exactamente igual salvo `updated_at`; ventas=0, importaciones=0, pedidos=0 e inventario con la misma huella. Evidencia privada: `.next/magenta-launch-audit/authenticated-verification.json`; captura `personalizacion-restaurada.jpg` en el mismo directorio.

Quedan cerrados login real, navegación autenticada POS/importador y guardado reversible de Personalización. **No equivale a configurar ni verificar guardado de las siete secciones comerciales de la tienda**: siguen vacías, con tienda cerrada y tarjeta bloqueada. No se inicializaron para esta prueba. Stripe live, contenido real y onboarding del titular conservan sus pendientes. El error de la auditoría histórica `audit-pos-business-personalization-v1.mjs` por migración ausente es preexistente; se mantuvo intacta y se añadió la prueba ejecutable específica `test-pos-personalization-access.mjs`.

El usuario autorizó explícitamente merge, las cinco migraciones revisadas y despliegues Production, sin cambios de dominio/DNS, sin cobros reales y con tienda cerrada. Candidato funcional: `dbd075e`, que incluye `ca7b86d` (impuesto explícito) y `dbd075e` (existencias iniciales/absolutas). La aceptación manual del importador y la revisión visual ya están cerradas. Los registros inferiores son históricos y no revocan esta autorización.

- Destinos renovados: Supabase `zhtagqrzyovsrmsicaot`, marca `magenta-fitwear` (`70880b54-b6fe-4775-bb39-c9ff19c47c39`); Vercel `cometa-os` y `magenta-controlled-preview`. No confundir con las otras marcas ni con Preview.
- Respaldo fresco 15/10 14:19 UTC: instantánea única SQL de esquema/datos, roles/propietarios, 26 objetos Storage. Restauración privada sin puertos publicados, descarga HTTP con 26 hashes iguales y cinco migraciones ensayadas: PASS. Custodia local privada; no se afirma PITR ni copia externa. Evidencia `.next/magenta-launch-audit/recovery-result.json`.
- Cinco migraciones aplicadas y registradas atómicamente; ledger 81 -> 86. Hashes iguales a la tabla revisada. Marcas, usuarios, accesos, productos e inventario conservaron sus huellas. Evidencia `production-migrations.json` y `production-preservation.json` en el mismo directorio privado de evidencia.
- Instalado `magenta-store-expiry` mediante el instalador autorizado, autenticación PostgreSQL/service_role, exclusivamente Magenta. Dos ejecuciones comprobadas: 14:33 y 14:34 UTC, ambas `succeeded`. No se cambiaron otros trabajos.
- Sin configuración comercial guardada ni cuenta Connect para la marca: la ausencia de configuración mantiene la tienda cerrada. No se sembraron datos ni se importaron muestras en producción.
- Pendientes concretos de Stripe: `STOREFRONT_STRIPE_LIVE_SECRET_KEY` y `STOREFRONT_STRIPE_LIVE_CONNECT_WEBHOOK_SECRET` en Production de ambas aplicaciones. Las claves locales son test; las claves sensibles existentes de otras integraciones no son recuperables ni se reutilizan por su nombre. Pau todavía debe completar y activar su cuenta live. POS no depende de ello.
- Endpoint previsto: `https://magenta-controlled-preview.vercel.app/api/stripe/connect-webhook`, eventos de cuentas conectadas `account.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Sin clave live no se ha creado el endpoint externo ni se afirma recepción live. No crear dos receptores para el mismo flujo.
- Publicado el candidato `4e4cc0b74e6ac009f55e9a68ae9b80658c504669` mediante [PR #1](https://github.com/cometamktmx-mx/cometa-os/pull/1), merge `74ef7bf66bc826614d2a79369e94415007d5c66c`. Contiene `dbd075e`; los cambios posteriores a ese commit son ejecutores y documentación, sin cambios al diseño o motor comercial.
- Administración: `https://cometa-n9dpqh97b-cometa-os-s-projects.vercel.app`; storefront: `https://magenta-controlled-preview-f8mmltn45-cometa-os-s-projects.vercel.app`. Ambos **READY / Production**, promovidos a los dominios existentes. Los dos builds comprobaron el backend real y modo live antes de compilar. No se modificaron dominios ni DNS.
- TypeScript sin emisión, lint dirigido al importador, pruebas del asistente y gates de publicación: PASS. Compilación de ambas aplicaciones: PASS. Sin advertencia standalone en estos builds; los despliegues Vercel funcionan. No se repitió el pago Connect test ni hubo cobros reales.
- Home, catálogo y bolsa: HTTP 200, un solo footer, sin referencias demo/test en el contenido renderizado. Navegador comprobó el producto real existente; sin fotos comerciales cargadas, se muestra su placeholder, sin sustituirlo por una fotografía demo. Las secciones editoriales necesitan contenido real para completar la presentación pública. No se declara tienda comercial lista.
- API pública: modo `live`, tarjeta no disponible. Prueba de solo lectura en PostgreSQL confirmó rechazo `STORE_CONFIGURATION_REQUIRED`. Cero pedidos, cero importaciones y cero cuentas Connect en la marca real; ledger 86. Las RPC internas del importador no son ejecutables por `anon` ni `authenticated`; la operación pública del servidor conserva su autorización. Solicitud anónima válida al historial: HTTP 401.
- Variables Production separadas de las compartidas conservando los identificadores y ramas de Preview. Preview funcional consultada mediante su acceso automatizado existente: modo `test`. Storage conserva los mismos 26 IDs/versiones que la instantánea canónica respaldada.
- POS publicado y acceso comercial efectivo habilitado por la cortesía Pro existente; un owner activo y sucursal/caja existentes. **Login dentro de la sesión, navegación autenticada y guardado/recarga de configuración productiva pendientes**: el navegador llegó al login real y se solicitó al usuario entrar; no se crearon usuarios, enlaces de suplantación ni sesiones de prueba. No confundir redirección al login con verificación autenticada.

### URLs operativas

- POS: https://app.cometaos.com/brand/magenta-fitwear/pos
- Importar información: https://app.cometaos.com/brand/magenta-fitwear/pos/settings/import
- Configuración: https://app.cometaos.com/brand/magenta-fitwear/pos/online-store
- Pagos: https://app.cometaos.com/brand/magenta-fitwear/pos/online-store?section=payments
- Atelier (Production, nombre histórico del proyecto): https://magenta-controlled-preview.vercel.app

### Pendientes para abrir ventas web

1. Responsable técnico: suministrar privadamente la clave live de la plataforma correcta en `STOREFRONT_STRIPE_LIVE_SECRET_KEY` para Production de ambas aplicaciones. Configurar el endpoint de eventos Connect indicado arriba y su secreto en `STOREFRONT_STRIPE_LIVE_CONNECT_WEBHOOK_SECRET`, también en ambas. Redeploy para cargar variables. No reutilizar credenciales/IDs test ni cambiar branding global de COMU.
2. Pau/titular: iniciar sesión con su acceso real, completar onboarding live desde Pagos una vez disponible, consultar estado y activar únicamente su cuenta habilitada. Ningún cargo real está autorizado por este lanzamiento.
3. Pau: archivos ELEVENTA reales, impuestos, códigos, existencias por sucursal, precios, fotos y contenido comercial autorizado; contacto, entrega/recolección y políticas. Importar tras revisar correspondencias y vista previa; mantener estado CLOSED hasta confirmar los datos. Compatibilidad con archivos reales y hardware se verifica con esos archivos/dispositivos, sin declararla probada por las muestras.
4. Verificar acceso autenticado y persistencia de las siete secciones con configuración real. El importador/POS no dependen del onboarding online. No abrir la tienda ni habilitar tarjeta mientras persistan los requisitos anteriores.

### Recuperación vigente

Conservar la copia privada fresca y los despliegues anteriores registrados en `admin-before-deploy.json` y `storefront-before-deploy.json`. Ante incidente, bloquear nuevas compras y evaluar promoción del despliegue compatible anterior; mantener cron/webhook para conciliar operaciones en tránsito. No deshacer las cinco migraciones ni restaurar datos automáticamente: cualquier escritura posterior, usuarios y otras marcas requieren evaluación previa. El rollback de código no revierte DB ni Storage.

## Registro histórico previo al lanzamiento (no es el estado vigente)

Estado actualizado desde `df05a0a`. Candidato de aplicación: **`816883d`**. Implementación y evidencia detalladas en [Cierre ejecutado](magenta-closure-20261014.md), que prevalece sobre los registros históricos de abajo. Production intacto; no merge, migraciones, variables live, dominios ni despliegue productivo.

## Estado previo usado para decidir el lanzamiento

- Implementados y publicados en Preview: acceso visible a ELEVENTA y CSV; Atelier independiente de Preview con demos restringidas a test; bloqueo de tarjeta sin Connect listo; activación explícita; alta POS con publicación web inicial/galería; corrección del paso de conteo de caja.
- Verificados por interfaz: alta de producto y aparición en catálogo/ficha, bolsa/cotización por $80, venta POS por $75 con descuento de una unidad, cierre $275/diferencia cero y apertura nueva $100, aviso leído y activación de sonido. Connect test aprobado se conserva sin otro pago.
- Pendiente de interfaz por bloqueo externo: carga de CSV y fotos; Chrome requiere permitir URLs de archivo para la extensión ChatGPT. No eludir. Archivos reales ELEVENTA, cámara, lector e impresora se prueban con Pau.
- Respaldo fresco de solo lectura obtenido y restaurado en contenedor privado sin puertos: DB, roles/propietarios y 26 archivos Storage, descargados por HTTP con hashes idénticos; cinco migraciones ensayadas conservando conteos. Detalle y límites en el informe de cierre. Copia coherente final y PITR se verifican en la ventana aprobada.
- Producción: misma marca `magenta-fitwear`, un owner activo, sucursal Principal/MXN, una caja y un producto. 81 migraciones; las cinco de abajo siguen pendientes y sin cambios de hash. `pg_cron` no instalado; instalador preparado en `supabase/release/install-magenta-expiry.sql`, no ejecutado.
- Live: variables específicas ausentes, onboarding/cuenta receptora y webhook live pendientes. Efectivo/POS/importación no dependen de Connect; tarjeta bloqueada hasta capacidades y destino válidos. Contenido, stock, contacto/políticas y acceso de Pau requieren datos reales.

No confundir presentación aprobada con operación live habilitada. Ver matriz de cierre antes de autorizar producción.

## Requisitos manuales indispensables

1. Completar la prueba manual de POS e importador en Preview y comunicar aceptación o defectos concretos. Atelier, configuración y Connect test están aprobados; no necesitan otra ronda sin un cambio o fallo que la justifique.
2. Confirmar destino privado y responsable de custodia para respaldo/restauración, ventana operativa y tolerancia de pérdida de datos/tiempo de recuperación. No copiar datos productivos a Preview ni contratar servicios automáticamente.
3. Confirmar dominio definitivo/registrador y entregar contenido autorizado: imágenes reales por SKU/variante, textos, políticas, contacto, dirección/horarios, cobertura/tarifas y stock real por ubicación. No copiar fixtures ni usuarios de prueba. Confirmar el responsable que operará pedidos y atenderá devoluciones/disputas.
4. Para live, el titular de Magenta debe completar su identidad y cuenta bancaria **dentro de Stripe**, y aprobar el modelo Standard/direct charges y responsabilidades económicas. Credenciales live y secretos de webhook se suministran solo en Vercel, nunca en chat ni formularios de tienda. El país legal se confirma antes de crear la cuenta, no se infiere del país de pruebas.
5. Aprobar la ventana y el plan de recuperación después de verificar respaldo restaurable y todos los bloqueos técnicos siguientes. Esta aprobación será separada del trabajo de Preview.

La URL alojada permite operar y no exige dominio propio. `MAGENTAFITWEAR.COM.MX`, observado en onboarding test, es solo candidato: no demuestra control DNS ni autoriza cambiarlo. Si se adopta dominio propio, obtener de Vercel los registros exactos del hostname autorizado, preservar correo/MX y otros servicios y verificar TLS/redirección canónica. No inventar registros. El titular también debe aceptar la presentación compartida actual “COMU / Volver a COMU” o aprobar expresamente el cambio global de branding y su impacto; no alterar la plataforma por resolver la marca.

## Destinos verificados y migraciones exactas

Auditoría renovada del 15/10/2026 01:55:34 UTC: `scripts/audit-magenta-launch.mjs`, exclusivamente transacciones `READ ONLY`. Producción: `zhtagqrzyovsrmsicaot`, **Cometa BRAND IA**, ACTIVE_HEALTHY; 81 versiones registradas. Marca autorizada: `magenta-fitwear`, ID `70880b54-b6fe-4775-bb39-c9ff19c47c39`. La otra marca `magenta-fit-wear` es distinta y queda excluida. Pruebas: `ephmrsjnpkcgddulvckj`, `magenta-preview-test`.

Aplicar únicamente estos archivos, en este orden, después de repetir la auditoría y revisar cualquier deriva:

| Archivo en `supabase/migrations/` | SHA-256 |
|---|---|
| `20261014120000_pos_imports_v1.sql` | `d65d64a6242e879b03f94da62f9db83c5d83b08009bcb2fddf2346be08993c1e` |
| `20261014140000_pos_product_delivery_save.sql` | `c24559391cc82b69f148e39bc6225be10da4a9f94e3aaf942530bbd5568a9b53` |
| `20261014160000_store_operations_m7.sql` | `d429865609ae5db82380e66cf8521952a50c6c37dba2f2ff6022afd485176dbd` |
| `20261014180000_store_order_presentation_m8.sql` | `4e89f219cf835d73e37ac6215ed9ec34156d89c4ac7500f14517355d39f91101` |
| `20261014200000_store_payment_accounts_m9.sql` | `35d61b823cb171cc7d321c1bfa2b065ce0dda893032ffc1c36dafcd408336cbd` |

El ensayo local partió de base vacía: baseline y 86 migraciones, importación/POS/compra, webhook firmado localmente, presentación y Connect. M9 se aplicó **solo en pruebas**, comprobando que pedidos, artículos, stock y configuración existentes quedaron idénticos. No ejecutar el baseline sobre producción ni usar instaladores de fixtures. La auditoría compara el ledger, no demuestra igualdad byte a byte de funciones históricas: revisar schema drift antes de autorizar la ejecución.

## Respaldo y recuperación

Tomar copia fresca tras pausar escrituras afectadas o definir un punto coherente de recuperación. Registrar responsable, pérdida máxima tolerada y duración aceptable. `pg_dump` no cifra por usar una extensión determinada: custodiar en volumen cifrado o cifrar con la herramienta aprobada. Un archivo listado con `pg_restore --list` no sustituye un ensayo restaurado con integridad, roles y dependencias verificados. No hay autorización actual para exportar datos productivos a otro servicio.

Ya se obtuvo y ensayó una copia privada mediante `scripts/rehearse-magenta-recovery.mjs`; consultar el cierre para alcance, resultado y custodia. No se afirma disponer de PITR. Antes de la ventana: Supabase → proyecto confirmado → Database → Backups: verificar plan, último punto recuperable, retención y procedimiento disponible, sin contratar servicios. Si hace falta respaldo lógico, preparar una conexión privada de lectura y usar `pg_dump --format=custom --file=<archivo-cifrado-en-destino-privado>` con `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` en el entorno privado (no contraseña en argumentos). Guardar versión PostgreSQL, hora, SHA-256 y alcance de roles/esquemas. Validar `pg_restore --list` y ensayar la restauración con `pg_restore --exit-on-error --no-owner --dbname=<base-aislada-privada> <archivo>` en un entorno de recuperación compatible, sin salida de correos/webhooks y con las dependencias de Auth/Storage verificadas. Ese ensayo no se sustituye por el bootstrap sintético.

Guardar también inventario y copia versionada de objetos Storage y configuración de buckets/políticas; el respaldo de base no incluye los archivos de Storage. Exportar metadatos de despliegue, alias, variables (custodia privada) y ledger, sin secretos en Git. El ensayo con datos reales **no va al backend público de Preview**: requiere entorno de recuperación privado, acceso restringido y autorización de custodia; no crear un servicio de pago automáticamente. Si no existe ese entorno o respaldo restaurable, bloquear lanzamiento. [Alcance de backups Supabase](https://supabase.com/docs/guides/platform/backups).

Recuperación preferida: cerrar nuevas compras de esta marca, conservar webhook y expiración para conciliar pedidos en tránsito, volver al despliegue compatible anterior y mantener tablas/eventos nuevos. No borrar pedidos ni restaurar stock hacia atrás mientras Stripe tenga pagos posteriores. Una restauración completa del proyecto compartido afecta a otras marcas: solo tras incidente aprobado, ventana global, conciliación de pagos/inventario desde el punto de recuperación y restauración de objetos. No presentar un rollback destructivo de las cinco migraciones como seguro.

## Pagos, permisos, webhook y expiración

Backend preparado: relación marca/cuenta/modo con RLS y RPC service-role autorizada, creación idempotente de cuenta **Standard**, onboarding alojado, capacidades consultadas al proveedor, activación explícita. Direct charges crea la sesión con contexto `stripeAccount` de Magenta; sin `transfer_data`, comisión de aplicación ni fallback live a la plataforma. El ID de destino queda congelado en cada pedido. Las condiciones de comisiones, reembolsos y disputas se deben aceptar antes de live. [Direct charges](https://docs.stripe.com/connect/direct-charges), [onboarding alojado](https://docs.stripe.com/connect/hosted-onboarding).

API administrativa: `/api/pos/online-store/payments?brandSlug=magenta-fitwear`; GET estado y POST `create` (country), `onboard`, `sync`, `activate`. En pruebas se usa exclusivamente `brandSlug=magenta-preview`. Mantiene autenticación POS, administrador web, modo Retail y `settings.manage`; no concede roles globales ni usa IDs recibidos del cliente para vincular cuentas. Retorno/refresco se construyen desde `STOREFRONT_ADMIN_ORIGIN`. Los controles **Conectar cuenta**, **Completar configuración** y **Consultar estado** están conectados a esta API; retorno y renovación automática conservan la cuenta vinculada. No se activa el destino de cobro por el simple retorno de Stripe. Las etiquetas ahora se derivan del modo efectivo; la tarjeta requiere cuenta activa y capacidades actuales. El retorno de Stripe sigue sin activar el destino automáticamente.

### Cierre Connect después del onboarding

**Sección histórica, cerrada por `1a605b7` y aprobación del titular.** La evidencia vigente está en “Cierre de Connect test — pedido 17D591A9”, al final. Los pasos y capacidades pendientes relatados a continuación describen el estado previo, no tareas por repetir. Para live se requiere una cuenta y configuración independientes.

Administración Preview verificada: `https://cometa-cv5cyi71c-cometa-os-s-projects.vercel.app`, Ready/Preview, alias estable de Pagos actualizado. Verificación HTTP autenticada del 14/10/2026 23:58 UTC: página y bundles contienen los tres controles; dos solicitudes de onboarding produjeron enlaces nuevos válidos para la misma cuenta, sin publicarlos ni conservarlos en el informe. API y Stripe coinciden en capacidades pendientes. Prueba del componente cubre retorno/renovación, permisos, bloqueo de doble clic y borrador sin guardar; no sustituye una revisión en navegador. Build, TypeScript y lint dirigido correctos. Storefront visual aprobado y destinos Production sin cambios. Archivos de esta continuación: `src/app/brand/[brandSlug]/pos/online-store/operations.tsx` (enlace directo Pagos), `scripts/verify-magenta-connect-onboarding.mjs` (verificación segura) y este procedimiento.

No crear el checkout mientras las capacidades estén incompletas. Tras el alta: volver a consultar Stripe y verificar metadata marca/modo, cuenta distinta de la plataforma, capacidades y endpoint Connect test; activar explícitamente solo la cuenta test para pedidos nuevos. Crear un checkout nuevo con un registro separado del pago histórico (`connect-chain.json` privado), conservar intento idempotente y capturar stock/reservas anteriores. No sobrescribir `chain.json` ni reutilizar el checkout pagado de plataforma. Consultar sesión y PaymentIntent con `stripeAccount` de la cuenta conectada; el pago debe ser test y el evento llevar esa misma cuenta. Después del pago manual test, comprobar importe/moneda, pedido PAID, un único evento aplicado, un único aviso por evento/destinatario y un solo descuento de inventario; repetir consultas/reintentos sin otro cobro. Si vence el intento, comprobar liberación y preparar otro intento explícito. **Este recorrido completo Connect sigue pendiente; las firmas locales y el pago de plataforma no lo sustituyen.**

Webhook de cuentas conectadas: storefront `/api/stripe/connect-webhook`, eventos `account.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Secretos separados por modo y endpoint; firma sobre cuerpo original, cuenta, marca, sesión, importe y moneda comprobados; ledger idempotente. `/api/stripe/webhook` conserva el flujo de plataforma test existente. No hace falta otro webhook en administración para estos pedidos; COMU conserva sus endpoints independientes. El endpoint live Connect debe escuchar eventos de **cuentas conectadas**, no solo los de la plataforma. Acceso público únicamente al receptor firmado; no desproteger el panel. No publicar el bypass de Vercel de pruebas como configuración live.

Producción todavía no tiene `pg_cron`. Después de aprobación: instalar `pg_cron` en Supabase y programar job **`magenta-store-expiry`** cada minuto con comando `set role service_role; select public.store_orders_expire_m6('magenta-fitwear');`. Su autenticación es la conexión PostgreSQL del scheduler, no una clave pública ni una variable sin ejecutor. Verificar marca/ID, función y rol antes de instalar; inspeccionar job y últimas ejecuciones `succeeded`. En pruebas ya se comprobó el ejecutor remoto y la liberación idempotente, excluyendo pedidos pagados. No añadir cron de Vercel que active tareas globales. Para retirar el job específico: `select cron.unschedule('magenta-store-expiry');`, únicamente cuando no queden reservas pendientes de conciliación o exista ejecutor sustituto.

No ejecutar `supabase/preview/install-expiry.sql` en producción: está restringido al backend sintético. Usar el instalador preparado supabase/release/install-magenta-expiry.sql contra el proyecto confirmado, revisar `cron.job` y `cron.job_run_details` filtrados por este job y conservar todos los jobs ajenos. No debilitar los límites del instalador de pruebas. [Ejecutor y monitorización oficiales](https://supabase.com/docs/guides/cron).

Storage productivo auditado: bucket `pos-products` existe público, límite 5 MB, MIME JPEG/PNG/WebP. Mantener políticas autorizadas por marca, no abrir escrituras públicas. Verificar upload del propietario, denegación de otra marca y lectura pública de recursos publicados. No subir recursos ZIP como fotografías de productos reales.

## Configuración de lanzamiento: solo después de aprobación

La configuración real se prepara en estado **CLOSED**: General (identidad, contacto y sucursal); Envíos/recolección (cobertura, tarifas, umbral gratis, plazos, horario/instrucciones); Pagos (métodos autorizados y Connect live); Mayoreo (reglas aprobadas); Dominio (URL confirmada); Políticas (textos autorizados); Notificaciones (responsables reales con acceso mínimo). No trasladar fixtures ni usuarios test. Revisar precios y stock canónico por variante/ubicación sin reinicializar existencias. La campanita POS es el canal disponible; correo/WhatsApp automáticos no están implementados y el sonido requiere navegador abierto y activación por clic.

Onboarding live del titular, después de configurar servidor y publicar con tienda cerrada: administración `/brand/magenta-fitwear/pos/online-store?section=payments` → Conectar cuenta (país legal confirmado) → Completar configuración → Consultar estado. Verificar metadata marca/modo y capacidades, luego activar explícitamente. En Stripe live, Workbench → Webhooks, configurar un destino de cuentas conectadas hacia la ruta exacta indicada arriba, con los cinco eventos y secreto exclusivo. La revisión externa de Stripe puede demorar: no abrir mientras esté pendiente. No usar datos simulados ni aceptar condiciones en nombre del titular.

Vercel: proyectos existentes `cometa-os` (root `cometa-brand-ai`) y `magenta-controlled-preview` (root `apps/magenta-storefront`). No usar `scripts/configure-magenta-release.mjs`: su alcance histórico de variables compartidas no es el procedimiento de esta entrega. Preview sigue con test y `STOREFRONT_LIVE_ENABLED=false`.

En ambos proyectos, **scope Production únicamente**: `STOREFRONT_PAYMENTS_MODE=live`, `STOREFRONT_LIVE_ENABLED=true`, `STOREFRONT_STRIPE_LIVE_SECRET_KEY`, `STOREFRONT_STRIPE_LIVE_CONNECT_WEBHOOK_SECRET`, `STOREFRONT_ADMIN_ORIGIN=https://app.cometaos.com`. La clave de plataforma se custodia en servidor, no se pide al cliente. `STOREFRONT_STRIPE_LIVE_WEBHOOK_SECRET` solo si se mantiene un receptor de eventos live de plataforma; no reutilizar whsec test. No modificar claves COMU/billing ni sobrescribir variables compartidas incidentalmente.

Administración conserva su backend productivo y `APP_ORIGIN`; ampliar `OWN_STOREFRONT_URLS` preservando las otras marcas, asignando solo `magenta-fitwear` al dominio confirmado. Storefront: `STOREFRONT_SUPABASE_URL`, `STOREFRONT_SUPABASE_ANON_KEY`, `STOREFRONT_SUPABASE_SERVICE_ROLE_KEY` del proyecto confirmado, `STOREFRONT_BRAND_SLUG=magenta-fitwear`, `STOREFRONT_ORIGIN=https://<dominio-aprobado>`. Ningún service-role llega al navegador. Configurar DNS/TLS/orígenes y redirecciones exactos después de aprobar el dominio; no cambiar el dominio de administración ni los de otras marcas.

## Secuencia exacta que se someterá a aprobación final

1. Recibir aceptación manual de POS/importador. Conservar diseño y Connect test aprobados. Cerrar únicamente los bloqueos de implementación live enumerados al inicio y recibir contenido/configuración reales. Mantener la evidencia ya aprobada sin repetir pagos ni pruebas salvo cambio o fallo justificado.
2. Congelar commit y artefactos; ejecutar TypeScript/build y checks pertinentes a los cambios posteriores, con comparación visual dirigida a preservar Atelier. Auditar ledger/schema/destinos y comparar hashes. Registrar ID de despliegue previo compatible y estado de datos. No ejecutar un push de migraciones genérico con versiones no revisadas.
3. Obtener aprobación explícita del lanzamiento, ventana, cinco migraciones, modelo de pagos, dominio y respaldo restaurado. Hacer backup fresco y validar recuperación privada. Si cambia el alcance, detener y actualizar la aprobación.
4. Mantener tienda cerrada a nuevas compras; aplicar los cinco archivos secuencialmente con registro de versión y transacciones propias de cada migración, contra referencia productiva confirmada. Comprobar RPC/RLS/permisos y que otras marcas no cambien. Instalar job específico de expiración y verificar reloj.
5. Incorporar contenido real y configuración cerrada de Magenta, sin importar fixtures. Revisar archivo de importación en dry-run, duplicados, SKU/variantes, ubicación y stock canónico; aplicar solo cantidades aprobadas sin reinicializar inventario existente. Preparar personal con permisos mínimos de marca.
6. Configurar variables live, onboarding del titular, capacidades de cobros/depósitos, destino vinculado y receptor Connect. Desplegar builds aprobados con tienda cerrada; asociar dominio autorizado y verificar TLS, secretos de servidor, acceso y webhook. No activar por nombre de variable ni por simple retorno del onboarding.
7. Con autorización específica para importe y medio real, ejecutar una compra controlada live y conciliar cuenta Stripe, evento, pedido y stock. Si se autoriza reembolso, realizarlo y conciliarlo realmente; no simularlo. Antes de esa autorización solo se pueden acreditar pruebas test. Confirmar proceso humano de envíos, cancelaciones y devoluciones.
8. Abrir ventas de Magenta únicamente con aceptación visual y operativa, datos reales, destino/capacidades confirmados y todos los controles anteriores en verde. Monitorizar webhook/reintentos, cron, reservas, stock y pedido/aviso en POS. Ante fallo, cerrar nuevas compras y aplicar la recuperación descrita sin perder eventos en tránsito.

Este documento es un procedimiento para aprobar, **no autorización ni certificado de producción lista**.

## Configuración POS e identidad Stripe — 14 de octubre, hora México

**Registro histórico:** sus referencias a aprobaciones visuales y Connect test pendientes quedaron cerradas por la aprobación posterior. Se conserva la propuesta de branding global como decisión todavía no aplicada; no reabrir pruebas cerradas.

La configuración conserva el shell POS y sus permisos. Las siete secciones usan navegación interna, panel central y pendientes derivados de datos; una URL alojada basta y no se exige dominio propio. Envío se edita en pesos y se convierte a centavos enteros al guardar; mayoreo ya usa pesos en el contrato y no se multiplica de nuevo. Las identidades de notificaciones se consultan solo para el actor y administradores activos de la marca autorizada; no se muestran UUID. No hay migraciones nuevas.

Auditoría Stripe test del 15/10/2026 00:18 UTC: la plataforma expone `settings.dashboard.display_name = Cometa POS`, nombre público nulo, icono configurado y logo no configurado. La cuenta Standard sintética tiene nombre público, logo e icono sin configurar. El navegador mostró realmente **COMU / Volver a COMU** en el onboarding. El Account Link no incluye nombre/logo: corresponde a la personalización de plataforma Connect, distinta del nombre interno del Dashboard. El Dashboard de personalización exige iniciar sesión, por lo que no se inspeccionaron ni cambiaron esos campos privados. El formulario Stripe además mostró un error de credenciales de una cuenta existente; lo debe resolver el titular con acceso Stripe, no con el usuario/contraseña POS.

Propuesta concreta, **no aplicada**: Dashboard de la plataforma → Settings → Connect → Branding (acceso directo https://dashboard.stripe.com/account/applications/settings), revisar el modo test y cambiar el nombre mostrado **COMU → COMETA POS**, logo al COMETA existente `public/logo.png`, color principal **#1A4F85**. Mantener titular legal y nombre comercial de la cuenta Magenta independientes. El nombre/icono del onboarding son compartidos por todas las cuentas conectadas de esa plataforma: cambiarlo también cambia la presentación de COMU. No guardar hasta aprobar ese impacto; si Dashboard indica alcance compartido con live, detenerse. El icono debe ser un recurso COMETA aprobado y legible en formato cuadrado; no convertir el logo Magenta en identidad de plataforma ni subir un recorte improvisado.

Para la identidad del cobro directo de Magenta, la cuenta conectada puede personalizar su propio perfil público y branding desde su Dashboard (Settings → Business → Public details / Branding). Propuesta para la cuenta test exclusivamente: nombre público **Magenta · pruebas**, logo original Atelier y URL alojada de la tienda test; no modificar titular legal ni inventar información. Esta personalización no sustituye el nombre de plataforma en el onboarding. La cuenta Standard ya inició onboarding: su titular debe completar los datos y confirmar cambios dentro de Stripe; no se intenta sobrescribir KYC por API. [Onboarding Standard y personalización de plataforma](https://docs.stripe.com/connect/standard-accounts).

Los callbacks ahora incluyen `?section=payments&connect=return` y `?section=payments&connect=refresh`, bajo la marca resuelta por autorización y un origen HTTPS de servidor. Un retorno o refresco consulta Stripe y nunca activa cobros por sí solo. A las 00:14 UTC seguían pendientes descripción/teléfono/URL del negocio, cuenta receptora y aceptación de condiciones; cobros/depósitos/detalles y activación eran falsos. **No se creó ni cobró otro checkout; la prueba Connect completa sigue pendiente del alta test.** El pago anterior a plataforma permanece separado.

Despliegues de esta revisión: administración https://cometa-djuj6oyw4-cometa-os-s-projects.vercel.app y storefront https://magenta-controlled-preview-radk7j256-cometa-os-s-projects.vercel.app, ambos **READY / Preview**, con sus alias test habituales. El verificador confirmó builds y destinos Production sin cambios. TypeScript sin emisión, lint dirigido, pruebas de formulario/conversión/errores, permisos de API e identidad de destinatarios y callbacks de onboarding pasaron. La consulta remota de las 00:29 UTC confirmó controles desplegados y renovación real de dos enlaces distintos sin cambiar cuenta; capacidades test seguían deshabilitadas.

El navegador permitió revisar escritorio en Pagos, General y Envíos; se observó el importe incompleto `1.` retenido, error en español y diálogo de confirmación al salir. Después el control del navegador dejó de responder al intentar recuperar el foco. **Móvil, revisión visual del resto de secciones y aprobación del usuario siguen pendientes**; no se eludió el bloqueo. El ensayo HTTP de las siete secciones verificó guardado/recarga exactos, identidades, URL alojada, privacidad pública y cotización de 18,000 + 2,551 = 20,551 centavos. Los valores originales se restauraron y pedidos/stock permanecieron iguales. Se actualizaron expectativas antiguas del ensayo que aún buscaban elementos de una home previa; el diseño Atelier no se cambió.

Archivos de esta revisión (sin archivos de Atelier ni migraciones):

- `src/app/brand/[brandSlug]/pos/online-store/operations.tsx`
- `src/app/brand/[brandSlug]/pos/online-store/payment-onboarding.tsx`
- `src/app/brand/[brandSlug]/pos/online-store/settings.module.css`
- `src/app/api/pos/online-store/operations/route.ts`
- `src/app/api/pos/online-store/payments/route.ts`
- `packages/own-storefront/settings-presentation.ts`
- `scripts/test-store-settings-ui.mjs`
- `scripts/test-store-operations-api.mjs`
- `scripts/test-store-payment-onboarding.mjs`
- `scripts/test-store-payments-api.mjs`
- `scripts/test-magenta-settings-preview.mjs`
- `docs/magenta-production-launch.md`

## Ajuste al mockup de configuración recibido

**Registro histórico de la adaptación.** Las frases siguientes sobre aprobación pendiente describen su fecha original; la configuración visual ya está aprobada por el usuario.

Estado posterior: el usuario aprobó la configuración visual. La revisión descrita abajo queda aprobada; Atelier conserva su aprobación previa.

Se abrió `referencias-magenta/configuracion-tienda-aprobada.png` antes de modificar. Diferencias corregidas respecto a la primera versión: cabecera con título/ayuda/acciones en una fila; franja independiente de identidad y disponibilidad guardada; navegación vertical con indicador lateral; campos en filas con etiquetas alineadas; disponibilidad en tarjeta separada; panel derecho ampliado para Atelier y revisión de pendientes. El lenguaje de paneles, controles y espaciado aplica a las siete secciones. Se conserva el shell real POS y sus condiciones, incluido cualquier aviso de suscripción que corresponda; no se copia la navegación ficticia del mockup.

La vista embebida resultó bloqueada en el navegador y se retiró sin eludir protecciones. La miniatura usa una copia intacta de `apps/magenta-storefront/public/atelier/hero-demo.jpg`, identificada como referencia editorial de pruebas y enlazada al storefront configurado. No se rediseñó Atelier ni se publicaron las imágenes ilustrativas del mockup. La disponibilidad se toma del documento guardado, el distintivo test de la respuesta de pagos, y los pendientes de las validaciones existentes; no se muestran comprobaciones ficticias de dominio o pagos.

Archivos de este ajuste: `src/app/brand/[brandSlug]/pos/online-store/operations.tsx`, `src/app/brand/[brandSlug]/pos/online-store/settings.module.css`, `public/brand/atelier-editorial.jpg`, `scripts/test-store-settings-ui.mjs` y `docs/magenta-production-launch.md`. El PNG de referencia y el directorio ajeno de recuperación se conservaron sin incluirlos en el commit.

Validación: TypeScript sin emisión, ESLint dirigido y prueba de formulario (siete secciones, conversión monetaria, errores, borradores y guardado/recarga) pasaron. Build administrativo READY / Preview: https://cometa-n69z6wiet-cometa-os-s-projects.vercel.app. Alias actualizado: https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos/online-store. Se verificaron destinos Production sin cambios. Storefront aprobado conservado, sin nuevo despliegue: https://magenta-controlled-preview-test-delivery-cometa-os-s-projects.vercel.app.

El navegador permitió comprobar la composición de escritorio y recorrer las siete secciones a 390 px, esperando su encabezado visible: ningún campo desbordó y el documento no presentó desbordamiento horizontal. La imagen editorial cargó correctamente. Se restauró el tamaño normal del navegador. La aprobación visual del usuario sigue pendiente. No hubo migraciones, cambios de configuración remota, pedidos ni pagos nuevos por este ajuste visual.

## Cierre de Connect test — pedido 17D591A9

Verificado el 15 de octubre de 2026 a las 01:41 UTC. Se satisfizo `individual.verification.document` mediante el simulador oficial alojado de Stripe: Iniciar verificación → Simular → Verificación correcta → Enviar resultado. No se subió identificación real. Stripe terminó la revisión y habilitó cobros y depósitos, sin requisitos pendientes. Se activó únicamente la vinculación test de Magenta para nuevas compras.

El usuario pagó manualmente el nuevo pedido `17d591a9-fbb4-4b4c-b91c-21be7c84836e`, por 10,000 centavos MXN. Se recuperaron sesión completa, PaymentIntent succeeded, cargo pagado y transacción de saldo dentro de la cuenta conectada vinculada a la marca, distinta de la plataforma. Es una prueba completa de pago Connect test; no reutiliza el pago anterior de plataforma ni implica depósito bancario real.

El evento original `checkout.session.completed` de Stripe coincide con cuenta, sesión y PaymentIntent. Su recepción quedó persistida a las 01:37:22 UTC, antes de cualquier repetición de auditoría. Pedido PAID visible por la API POS, un evento PAYMENT_PAID, un aviso persistido para el administrador y un único efecto SALE de una unidad. Stock 5 → 4; reserva 1 → 0.

Dos lecturas del pedido y dos reintentos simultáneos devolvieron el mismo pedido pagado sin nueva URL de cobro. Dos repeticiones concurrentes del evento original, con firma test generada para ensayar deduplicación, respondieron HTTP 200. La auditoría de eventos de pago, historial, avisos y efectos de inventario quedó idéntica; stock final 4 y reserva 0. Estas repeticiones prueban idempotencia y se distinguen de la entrega original de Stripe y del pago manual completo.

Evidencia detallada privada: `.next/magenta-functional/ephmrsjnpkcgddulvckj/connect-payment-proof.json`. No se cambió código de aplicación, no se creó otro cobro, no hubo migración ni despliegue. Production permanece intacto. El onboarding y el pago Connect test dejan de ser pendientes; las dependencias y autorización finales de lanzamiento live continúan vigentes.
