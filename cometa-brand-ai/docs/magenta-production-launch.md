# Magenta: procedimiento de lanzamiento pendiente de aprobación

Estado vigente desde `1a605b7`: **Atelier, configuración visual POS y Connect test aprobados; operación live no lista**. Conservar estas versiones y pruebas. Falta la prueba manual del titular del POS e importador. No se hizo merge, migración, cambio de variables/dominios ni despliegue de producción. El documento de diferencias Atelier y las secciones históricas de este informe no constituyen bloqueos visuales vigentes.

## Bloqueos técnicos vigentes para decidir el lanzamiento

Auditoría renovada el **15/10/2026 01:55:34 UTC**, exclusivamente `READ ONLY`: mismo proyecto productivo, 81 versiones, las cinco migraciones y hashes de abajo siguen pendientes; `cronAvailable=false`. Bucket `pos-products` conserva límite 5 MB, acceso público de lectura y MIME JPEG/PNG/WebP. Evidencia privada: `.next/magenta-launch-audit/audit.json`. No se copiaron datos ni se repitieron pruebas cerradas.

| Bloqueo | Preparación exacta / criterio de cierre |
|---|---|
| Atelier fuera de Preview | `apps/magenta-storefront/lib/atelier-store.tsx:16` devuelve `StoreHome` cuando `VERCEL_ENV` no es `preview`. El código actual **no publicaría Atelier aprobado en producción**. Separar selección de composición y uso de demos, habilitando la composición para la marca autorizada con recursos reales; no quitar simplemente el guard publicando las demos. Conservar tamaños, navegación, movimiento y footer aprobados. Implementación pendiente. |
| Textos y recursos de test | Hay textos fijos en `atelier-store.tsx`, `packages/own-storefront/checkout.tsx`, `packages/own-storefront/operations-contract.ts` y `src/app/brand/[brandSlug]/pos/online-store/operations.tsx`. Derivar las etiquetas del modo efectivo del servidor y conectar hero/categorías/look a recursos autorizados. Preview conserva su aviso test. No rediseñar ni usar imágenes demo como productos reales. Implementación pendiente. |
| Migraciones y deriva | Aplicar solo las cinco versiones de este informe tras aprobación. Comparar además definiciones/RLS/grants: el ledger no certifica ausencia de cambios manuales. No ejecutar baseline, fixtures ni un push genérico. |
| Respaldo recuperable | Todavía no hay evidencia de respaldo productivo restaurado ni confirmación de PITR. Requiere destino privado compatible y custodia aprobada; copia DB y objetos Storage, ensayo y punto de recuperación documentados. |
| Configuración live | Cuenta, claves y webhook live aún no verificados. No copiar IDs, sesiones, claves ni secretos test. Mantener tienda cerrada hasta capacidades y vinculación live confirmadas. |
| Expiración | Instalar job exclusivo `magenta-store-expiry`, cada minuto, después de aprobación. Verificar dos ejecuciones correctas y permisos; no fabricar pedidos vencidos productivos para repetir pruebas ya cerradas. |
| Permisos y publicación | Confirmar operadores, sucursal/caja, Retail, suscripción/capacidades, administrador web, `settings.manage` y destinatarios reales. Verificar políticas efectivas de Storage y aislamiento de marca. Congelar artefactos y verificar únicamente los cambios posteriores a las pruebas aprobadas. |

Los dos primeros pendientes son cambios de código aún no ejecutados. Los demás requieren instalación/configuración final o acceso/datos; no se declaran cerrados por existir variables o por pasar un build. Los scripts de Preview siguen rechazando Production y no deben convertirse en instaladores live.

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

No se creó ni restauró todavía un respaldo productivo; no se afirma disponer de PITR. Antes de la ventana: Supabase → proyecto confirmado → Database → Backups: verificar plan, último punto recuperable, retención y procedimiento disponible, sin contratar servicios. Si hace falta respaldo lógico, preparar una conexión privada de lectura y usar `pg_dump --format=custom --file=<archivo-cifrado-en-destino-privado>` con `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` en el entorno privado (no contraseña en argumentos). Guardar versión PostgreSQL, hora, SHA-256 y alcance de roles/esquemas. Validar `pg_restore --list` y ensayar la restauración con `pg_restore --exit-on-error --no-owner --dbname=<base-aislada-privada> <archivo>` en un entorno de recuperación compatible, sin salida de correos/webhooks y con las dependencias de Auth/Storage verificadas. Ese ensayo no se sustituye por el bootstrap sintético.

Guardar también inventario y copia versionada de objetos Storage y configuración de buckets/políticas; el respaldo de base no incluye los archivos de Storage. Exportar metadatos de despliegue, alias, variables (custodia privada) y ledger, sin secretos en Git. El ensayo con datos reales **no va al backend público de Preview**: requiere entorno de recuperación privado, acceso restringido y autorización de custodia; no crear un servicio de pago automáticamente. Si no existe ese entorno o respaldo restaurable, bloquear lanzamiento. [Alcance de backups Supabase](https://supabase.com/docs/guides/platform/backups).

Recuperación preferida: cerrar nuevas compras de esta marca, conservar webhook y expiración para conciliar pedidos en tránsito, volver al despliegue compatible anterior y mantener tablas/eventos nuevos. No borrar pedidos ni restaurar stock hacia atrás mientras Stripe tenga pagos posteriores. Una restauración completa del proyecto compartido afecta a otras marcas: solo tras incidente aprobado, ventana global, conciliación de pagos/inventario desde el punto de recuperación y restauración de objetos. No presentar un rollback destructivo de las cinco migraciones como seguro.

## Pagos, permisos, webhook y expiración

Backend preparado: relación marca/cuenta/modo con RLS y RPC service-role autorizada, creación idempotente de cuenta **Standard**, onboarding alojado, capacidades consultadas al proveedor, activación explícita. Direct charges crea la sesión con contexto `stripeAccount` de Magenta; sin `transfer_data`, comisión de aplicación ni fallback live a la plataforma. El ID de destino queda congelado en cada pedido. Las condiciones de comisiones, reembolsos y disputas se deben aceptar antes de live. [Direct charges](https://docs.stripe.com/connect/direct-charges), [onboarding alojado](https://docs.stripe.com/connect/hosted-onboarding).

API administrativa: `/api/pos/online-store/payments?brandSlug=magenta-fitwear`; GET estado y POST `create` (country), `onboard`, `sync`, `activate`. En pruebas se usa exclusivamente `brandSlug=magenta-preview`. Mantiene autenticación POS, administrador web, modo Retail y `settings.manage`; no concede roles globales ni usa IDs recibidos del cliente para vincular cuentas. Retorno/refresco se construyen desde `STOREFRONT_ADMIN_ORIGIN`. Los controles **Conectar cuenta**, **Completar configuración** y **Consultar estado** están conectados a esta API; retorno y renovación automática conservan la cuenta vinculada. No se activa el destino de cobro por el simple retorno de Stripe. Antes de live siguen pendientes las etiquetas fijas “Stripe test” del checkout y el método, que hoy corresponden al modo exclusivo de pruebas.

### Cierre Connect después del onboarding

**Sección histórica, cerrada por `1a605b7` y aprobación del titular.** La evidencia vigente está en “Cierre de Connect test — pedido 17D591A9”, al final. Los pasos y capacidades pendientes relatados a continuación describen el estado previo, no tareas por repetir. Para live se requiere una cuenta y configuración independientes.

Administración Preview verificada: `https://cometa-cv5cyi71c-cometa-os-s-projects.vercel.app`, Ready/Preview, alias estable de Pagos actualizado. Verificación HTTP autenticada del 14/10/2026 23:58 UTC: página y bundles contienen los tres controles; dos solicitudes de onboarding produjeron enlaces nuevos válidos para la misma cuenta, sin publicarlos ni conservarlos en el informe. API y Stripe coinciden en capacidades pendientes. Prueba del componente cubre retorno/renovación, permisos, bloqueo de doble clic y borrador sin guardar; no sustituye una revisión en navegador. Build, TypeScript y lint dirigido correctos. Storefront visual aprobado y destinos Production sin cambios. Archivos de esta continuación: `src/app/brand/[brandSlug]/pos/online-store/operations.tsx` (enlace directo Pagos), `scripts/verify-magenta-connect-onboarding.mjs` (verificación segura) y este procedimiento.

No crear el checkout mientras las capacidades estén incompletas. Tras el alta: volver a consultar Stripe y verificar metadata marca/modo, cuenta distinta de la plataforma, capacidades y endpoint Connect test; activar explícitamente solo la cuenta test para pedidos nuevos. Crear un checkout nuevo con un registro separado del pago histórico (`connect-chain.json` privado), conservar intento idempotente y capturar stock/reservas anteriores. No sobrescribir `chain.json` ni reutilizar el checkout pagado de plataforma. Consultar sesión y PaymentIntent con `stripeAccount` de la cuenta conectada; el pago debe ser test y el evento llevar esa misma cuenta. Después del pago manual test, comprobar importe/moneda, pedido PAID, un único evento aplicado, un único aviso por evento/destinatario y un solo descuento de inventario; repetir consultas/reintentos sin otro cobro. Si vence el intento, comprobar liberación y preparar otro intento explícito. **Este recorrido completo Connect sigue pendiente; las firmas locales y el pago de plataforma no lo sustituyen.**

Webhook de cuentas conectadas: storefront `/api/stripe/connect-webhook`, eventos `account.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Secretos separados por modo y endpoint; firma sobre cuerpo original, cuenta, marca, sesión, importe y moneda comprobados; ledger idempotente. `/api/stripe/webhook` conserva el flujo de plataforma test existente. No hace falta otro webhook en administración para estos pedidos; COMU conserva sus endpoints independientes. El endpoint live Connect debe escuchar eventos de **cuentas conectadas**, no solo los de la plataforma. Acceso público únicamente al receptor firmado; no desproteger el panel. No publicar el bypass de Vercel de pruebas como configuración live.

Producción todavía no tiene `pg_cron`. Después de aprobación: instalar `pg_cron` en Supabase y programar job **`magenta-store-expiry`** cada minuto con comando `set role service_role; select public.store_orders_expire_m6('magenta-fitwear');`. Su autenticación es la conexión PostgreSQL del scheduler, no una clave pública ni una variable sin ejecutor. Verificar marca/ID, función y rol antes de instalar; inspeccionar job y últimas ejecuciones `succeeded`. En pruebas ya se comprobó el ejecutor remoto y la liberación idempotente, excluyendo pedidos pagados. No añadir cron de Vercel que active tareas globales. Para retirar el job específico: `select cron.unschedule('magenta-store-expiry');`, únicamente cuando no queden reservas pendientes de conciliación o exista ejecutor sustituto.

No ejecutar `supabase/preview/install-expiry.sql` en producción: está restringido al backend sintético. Preparar la instalación específica contra el proyecto confirmado, revisar `cron.job` y `cron.job_run_details` filtrados por este job y conservar todos los jobs ajenos. No debilitar los límites del instalador de pruebas. [Ejecutor y monitorización oficiales](https://supabase.com/docs/guides/cron).

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
