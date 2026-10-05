# COMU Notifications N1 — foundation local

## Checkpoint O1

Commit local: `e465f89a740010a8491905f12e25dede156b25a3`.
Mensaje: `feat(comu): harden seller order state and fulfillment contracts`.
Staging selectivo de los 20 archivos enumerados en `comu-orders-o1.md`.
Índice vacío después del commit. Cambios ajenos preservados.

Antes del commit pasaron:

- `node scripts/test-comu-orders-o1-local.mjs --http`: PostgreSQL + HTTP,
  `O1 PostgreSQL PASS`, base `comu_o1_1791223084013` eliminada al finalizar.
- `node scripts/test-comu-orders-o1-presentation-local.mjs`.
- `node scripts/test-comu-seller-orders-local.mjs`.
- `node scripts/test-comu-seller-approval-local.mjs` (C1).
- `node scripts/test-comu-seller-catalog-local.mjs` (C2).
- `node scripts/test-comu-auth-local.mjs`.
- TypeScript sin emisión, ESLint dirigido y `git diff --cached --check`.

Diff-check detectó una línea vacía al final del nuevo harness O1; se eliminó
antes del commit, sin cambio de comportamiento.

## Migración y límites

`supabase/migrations/20261005150000_comu_notifications_v1.sql`.
Depende de O1. Crea exclusivamente dos tablas COMU, índices, RLS, grants,
funciones y triggers de captura. No cambia las funciones de transición,
el catálogo, POS, Buyer Account ni cron. No crea eventos de negocio alternos.

Se prueba únicamente en una base `comu_n1_<timestamp>` desechable: schema local
sin datos comerciales, fixtures nuevos, O1 y luego N1. La base principal solo
se usa para leer schema y versiones Auth; nunca recibe estas migraciones.
No hay instalación remota ni deploy. El checkpoint local N1 fue autorizado
posteriormente; su preparación se registra al final de este documento.

## Modelo y flujo

`comu_notifications`: recipient_user_id, audience SELLER/BUYER, order/suborder/
seller, referencia al evento original, event_kind de presentación, clave de
deduplicación, título, cuerpo, deep_link, metadata mínima (folio y scope),
created_at, read_at y visibility. No contiene dirección, teléfono, notas de
incidencia, datos bancarios, Stripe IDs, tokens HUB, guías ni payloads de carrier.

`comu_notification_outbox`: referencia de evento, destinatario, notification_id,
channel, dedupe_key, status, attempt_count, next_attempt_at, claimed_at,
lease_until, claim_token, first_send_at, delivered_at, last_error y payload de
email congelado, accesible solo al servidor. El payload privado contiene la
dirección de entrega del email; nunca se expone en APIs de usuario.

Flujo:

1. Un INSERT real en `comu_order_events` o `comu_fulfillment_events` captura
   transaccionalmente una fila outbox `EVENT`. EVENT es trabajo interno de
   distribución, no un canal de usuario ni un evento de negocio nuevo.
2. El worker reclama el evento y resuelve destinatarios actuales en servidor.
3. Una transacción crea la notificación visible, su entrega IN_APP completada
   y, cuando corresponde, la intención EMAIL pendiente.
4. Otro claim prepara el email y llama al transporte fuera de SQL. Solo después
   confirma la entrega. El pedido nunca depende de la respuesta del proveedor.

La captura no hace HTTP. Un error de captura produce únicamente el warning
`COMU_N1_CAPTURE_RETRY_REQUIRED`; el evento original no se revierte. El worker
reconcilia hasta 200 capturas faltantes por llamada, desde los eventos durables.
Un rollback de la transacción del evento también revierte su intención outbox.
Errores de expansión se reintentan sin volver a crear eventos o estados de pedido.

El corte es el timestamp inmutable guardado por `comu_n1_cutover()` al aplicar
la migración. No se recorren eventos anteriores para notificar ni se habilita
backfill retrospectivo. Los destinatarios se resuelven con permisos vigentes al
distribuir, no desde recipientName ni una lista histórica de emails.

## Mapping y destinatarios

| Evento fuente | In-app Seller | In-app Buyer | Email Seller | Email Buyer |
| --- | --- | --- | --- | --- |
| ORDER_PAID | Sí, suborden propia | Sí, master | Nuevo pedido | Pedido confirmado |
| SUBORDER_PREPARING | Sí | Preparación | No | No |
| SUBORDER_READY_FOR_HUB | Sí | Avance logístico | No | No |
| SUBORDER_READY_TO_SHIP | Sí | Listo para envío | No | No |
| SUBORDER_SHIPPED | Sí | En tránsito, parte del pedido | No | Sí |
| SUBORDER_DELIVERED | Sí | Entregada esta parte | No | Sí |
| SUBORDER_ISSUE | Sí | Incidencia | No, incidencia logística | Sí |
| INCIDENT_RECORDED | Sí si ISSUE activo | Sí si ISSUE activo | Solo INCOMPLETE_PACKAGE / WRONG_PRODUCT / DAMAGED_PACKAGE | Sí |

O1 reconcilia tracking IN_TRANSIT con SUBORDER_SHIPPED. N1 escucha ese evento
canónico de fulfillment, sin una segunda suscripción al carrier que lo duplique.
No convierte la entrega de una suborden en una afirmación de entrega del master.
Incidencias registradas sobre DELIVERED/CANCELLED no originan avisos de ISSUE
activo. OTHER se informa in-app al seller, pero no dispara email seller.

Seller: OWNER, ADMIN y ORDER_MANAGER activos, perfil activo, seller habilitado
y política C1/legacy equivalente a O1. No se notifica CATALOG_MANAGER ni se
concede acceso por rol global sin membership operativa. Buyer: comu_orders →
comu_buyers.user_id, con perfil activo. Solo el dueño real del master.

Cada Seller recibe datos de su suborden. La identidad de entrega incluye
audience y suborder/master scope, para que contextos de tiendas distintos no
se mezclen. Dedupe por fuente/destinatario/canal/contexto y clave semántica por
tipo/scope/audience/destinatario. ORDER_PAID repetido con otro ID también se
colapsa; ISSUE mantiene la identidad de cada incidencia real independiente.

Se revalida autorización al expandir, antes de enviar email y en cada lectura
o actualización de in-app. Una revocación oculta también avisos antiguos y
suprime emails todavía pendientes. La autorización del destino se vuelve a
comprobar por los handlers existentes al abrir el enlace. Como con cualquier
proveedor externo, una revocación posterior al envío no puede retirar un email
ya aceptado por el proveedor.

## APIs y campana

- `GET /api/comu/notifications?audience=SELLER|BUYER&sellerId=<opcional>&limit=20`:
  últimas notificaciones y unreadCount total del contexto, máximo 50 elementos.
- `PATCH /api/comu/notifications`, JSON `{action:"read",id,audience,sellerId?}`.
- Mismo PATCH con `{action:"read-all",audience,sellerId?}`.
- `POST /api/comu/notifications/dispatch`: solo bearer secret del worker.

La identidad sale de la sesión, nunca de un recipient_user_id del body. Las
funciones autenticadas y RLS comprueban ownership; no existen grants de escritura
directa para usuarios ni lectura pública del outbox. Todas las respuestas son
`private, no-store`. Los errores de proveedor no llegan al usuario final.

La campana Seller muestra badge, últimas diez notificaciones, lectura individual
y lectura global del contexto, cierre con Escape/click exterior y estados de
carga/vacío/error. Refresca al abrir y cada 60 segundos; el despacho no depende
de la campana ni del navegador. No se agrega una pantalla “ver todas” inexistente.
Buyer tiene APIs y modelo listos, sin cambios de UI en Account.

Deep links:

- Seller: `/comu/seller/{brandSlug}/orders?selected={suborderId}`.
- Buyer: `/comu/account/orders/{masterOrderId}?view=detail`.

Solo IDs y rutas normales. No contienen tokens ni enlaces privados de proveedor.

## Worker, retry y email

Secret independiente `COMU_NOTIFICATIONS_WORKER_SECRET` (mínimo 32 caracteres),
comparación de tiempo constante. No acepta destinatarios, payloads ni IDs de
pedido desde quien llama. Los RPC de dispatch son solo service_role.

Cada llamada procesa hasta diez trabajos, reclamados de uno en uno con
`FOR UPDATE SKIP LOCKED`. Lease de 120 segundos y token de fencing; un worker
antiguo no puede confirmar el trabajo reclamado por otro. Timeout HTTP de email
de diez segundos. Claims vencidos vuelven a ser elegibles. Máximo seis intentos;
backoff exponencial de 30 segundos, con tope de una hora. FAILED requiere revisión.

El transporte adapta el fetch Resend existente, sin imports del dominio POS y
sin modificar invitaciones. Usa `RESEND_API_KEY`, `RESEND_FROM_EMAIL` y
`COMETA_APP_ORIGIN`. El envío real además requiere
`COMU_NOTIFICATIONS_EMAIL_ENABLED=true`; queda desactivado por defecto.
No se leyeron ni editaron archivos .env. Los tests no llaman a Resend real.

Idempotency-Key estable: `comu-n1/{outboxId}`. Se congela el payload del primer
intento para mantener idéntico destinatario, remitente, asunto y texto. Si cambia
el email del usuario, pasa a revisión en lugar de enviar al nuevo con la misma
clave. Resend conserva claves durante 24 horas: N1 detiene reintentos a las 23
horas desde first_send_at, evitando reenvío automático tras expirar esa ventana.
No se promete exactly-once ilimitado. Referencia oficial:
[Resend idempotency](https://resend.com/blog/engineering-idempotency-keys).

`DELIVERED` en EMAIL significa aceptación por el transporte, no recepción en
la bandeja del destinatario. No hay tracking de apertura, bounce o webhook de
delivery en N1. La entrega real del proveedor sigue MANUAL/PENDING.

Sin cron modificado. Recomendación para una futura activación autorizada:
ejecución server-side cada minuto, con monitoreo de backlog y FAILED; aumentar
capacidad mediante workers concurrentes acotados si el volumen lo requiere.

Consulta operativa administrativa (no exponer a usuarios finales):

```sql
select channel,status,count(*),min(created_at) as oldest,
       max(attempt_count) as max_attempts
from public.comu_notification_outbox group by channel,status;
select id,source_table,source_event_id,status,last_error,next_attempt_at
from public.comu_notification_outbox
where status in ('RETRY','FAILED') order by created_at;
```

No resetear automáticamente first_send_at, claves ni FAILED: ante respuesta
perdida se requiere reconciliar con el proveedor antes de autorizar un reenvío.

## Certificación

Comandos reproducibles, sin instalar dependencias:

```text
node scripts/test-comu-notifications-n1-local.mjs --http
node scripts/test-comu-notifications-n1-local.mjs --http-only
node scripts/test-comu-notifications-n1-node.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

La suite local clona solo schema hacia una DB desechable; el worker TypeScript
real ejecuta sus RPC contra PostgreSQL real con transporte inyectado local.
HTTP usa Auth, cookies, PostgREST y Next reales aislados, llaves efímeras,
email desactivado y fixtures propios. Chromium usa un perfil nuevo del harness.
Las capturas de estado de UI se guardan bajo `.next/n1-http-*/` (ignorado por Git).

Resultados:

- PostgreSQL/worker: PASS, exit code 0 en la ejecución independiente final
  `comu_n1_1791224807930`, eliminada al terminar. ORDER_PAID Seller/Buyer, MASTER/SUBORDER, aislamiento
  multitienda, dedupe de evento repetido, ownership/RLS, read/read-all/unread,
  PREPARING/READY in-app, DIRECT/tracking reconciliado/DELIVERED, política ISSUE,
  revocación antes y después de expansión, proveedor fallido sin rollback,
  respuesta perdida, backoff, stale claims/fencing, fallo de captura recuperable,
  rollback transaccional, límite de intentos y ventana del proveedor, roles,
  C1 real/legacy y dos sesiones PostgreSQL concurrentes con SKIP LOCKED.
- Node: PASS configuración validada, proveedor apagado = cero llamadas,
  contrato email/clave estable, error saneado y autenticación del worker.
- HTTP/Chromium: PASS, exit code 0, base `comu_n1_1791224612706` eliminada.
  Auth/cookies, worker secret, Seller/Buyer, read/read-all/count, cross-user/store,
  revocación, privacidad, email sin configurar reintentable y logout.
- Campana: PASS Chromium real, carga retrasada, datos reales, badge/mark-read,
  cambio de tienda vacía, fallo de red y panel móvil dentro del viewport.
  Capturas inspeccionadas en `.next/n1-http-d8PE4p/bell-*.png`.
- TypeScript sin emisión: PASS, 0 errores.
- ESLint dirigido a todos los TS/TSX y los tres scripts N1: PASS, 0 warnings.
- `git diff --check` y `git diff --cached --check`: PASS; índice vacío.
- Whitespace de los doce archivos nuevos (aún sin seguimiento Git): PASS.

Una repetición HTTP previa encontró un 404 de descubrimiento de ruta O1 en el
proyecto Next temporal. Se fijó `outputFileTracingRoot` únicamente en su copia
de configuración; la repetición posterior pasó, incluida la ruta O1. No se
modificó next.config.ts del proyecto real. No hay certificación de Resend real
ni build de producción.

Comprobación final READ ONLY de la base principal: no existen tablas N1 ni las
RPC O1 comprobadas. No quedaron bases `comu_o1_*`/`comu_n1_*` ni contenedores N1
de las ejecuciones finalizadas. Ninguna migración se aplicó a principal/remoto.

## Archivos N1

Modificado:

```text
src/app/comu/seller/seller-shell.tsx
```

Creados:

```text
supabase/migrations/20261005150000_comu_notifications_v1.sql
src/lib/comu/notification-contract.ts
src/lib/comu/notifications.ts
src/lib/comu/notification-email.ts
src/lib/comu/notification-worker.ts
src/app/api/comu/notifications/route.ts
src/app/api/comu/notifications/dispatch/route.ts
src/app/comu/seller/notification-bell.tsx
scripts/test-comu-notifications-n1-local.mjs
scripts/test-comu-notifications-n1-http-local.mjs
scripts/test-comu-notifications-n1-node.mjs
docs/comu-notifications-n1.md
```

## Activación futura

Para habilitar en un entorno persistente falta autorización de instalación O1/N1,
configurar y validar remitente/credenciales/origen/secret, certificar entrega real
en destinatario de prueba autorizado y aprobar scheduling. Nada de esto se
ejecutó en producción. No se inició Visual V4, Web Push, WhatsApp ni SMS.

Notifications N1 FUNCTIONALLY READY: **YES, motor certificado localmente**.
Email Provider Delivery: **MANUAL/PENDING**, transporte simulado y envío real
desactivado. Listo para Visual V4 Pedidos: **YES**, sin iniciar su implementación.
No quedan blockers del motor local. La activación persistente y la entrega real
mantienen los requisitos de autorización/configuración descritos arriba.

## Git status --short final

Snapshot anterior al checkpoint N1: índice vacío, N1 sin commit. El resto
corresponde a trabajo preexistente conservado.

```text
 M scripts/test-comu-buyer-visual-local.mjs
 M scripts/test-comu-stripe-checkout-e2e-testmode.mjs
 M scripts/test-comu-stripe-dispute-testmode.mjs
 M scripts/test-pos-food-access-server-v1.mjs
 M scripts/test-pos-food-configurator-v1.mjs
 M scripts/test-pos-food-modifiers-v1.mjs
 M scripts/test-pos-food-operations-v1.mjs
 M scripts/test-pos-food-pilot-hardening-v1.mjs
 M scripts/test-pos-mobile-m1.mjs
 M scripts/test-pos-multirole-cash-v1.mjs
 M src/app/api/comu/buyer/experience/route.ts
 M src/app/api/pos/devices/route.ts
 M src/app/brand/[brandSlug]/components/pos-food-modifiers.tsx
 M src/app/brand/[brandSlug]/components/pos-food-operations.tsx
 M src/app/brand/[brandSlug]/components/pos-food-receipt.tsx
 M src/app/comu/account/buyer/buyer-account.tsx
 M src/app/comu/account/buyer/page.tsx
 M src/app/comu/account/page.tsx
 M src/app/comu/cart/page.tsx
 M src/app/comu/components/auth-boundary.tsx
 M src/app/comu/components/commerce.tsx
 M src/app/comu/page.tsx
 M src/app/comu/products/[slug]/add-to-cart.tsx
 M src/app/comu/seller/finance/page.tsx
 M src/app/comu/seller/seller-shell.tsx
 M src/lib/comu/buyer-experience.ts
 M src/lib/comu/buyers.ts
 M src/lib/comu/public-routes.ts
 M src/lib/pos/device-server.ts
 M src/lib/pos/server.ts
 M src/lib/pos/staff-server.ts
 M src/proxy.ts
 M tsconfig.json
?? apps/
?? config/
?? docs/cometa-pos-mobile-m1-5-certification.md
?? docs/cometa-pos-mobile-m2-5.md
?? docs/cometa-pos-mobile-m2-6-1.md
?? docs/cometa-pos-mobile-m2-6.md
?? docs/cometa-pos-mobile-m2-7b.md
?? docs/cometa-pos-mobile-m2-scope.json
?? docs/cometa-pos-mobile-m2.md
?? docs/comu-buyer-auth-v1.md
?? docs/comu-notifications-n1.md
?? docs/comu-product-editor-v3b-final-git-status.txt
?? docs/comu-product-editor-v3b-git-status.txt
?? docs/comu-seller-certification-final-local.md
?? docs/comu-seller-certification-git-status.txt
?? docs/comu-seller-certification-local.md
?? docs/comu-v3b-pos-roundtrip-git-status.txt
?? docs/visual-references/
?? public/comu/
?? scripts/certify-comu-seller-final-local.mjs
?? scripts/certify-comu-sellers-http-local.mjs
?? scripts/pos-beta-download-preview.mjs
?? scripts/prepare-pos-beta-schema.mjs
?? scripts/test-comu-account-capabilities-http-local.mjs
?? scripts/test-comu-auth-local.mjs
?? scripts/test-comu-finance-lifecycle-local.mjs
?? scripts/test-comu-notifications-n1-http-local.mjs
?? scripts/test-comu-notifications-n1-local.mjs
?? scripts/test-comu-notifications-n1-node.mjs
?? scripts/test-pos-mobile-m2-http-local.mjs
?? src/app/android/
?? src/app/api/comu/admin/finance/
?? src/app/api/comu/notifications/
?? src/app/api/pos/mobile/
?? src/app/brand/admin/comu/finance/
?? src/app/comu/account/buyer/account-icon.tsx
?? src/app/comu/account/buyer/buyer-account.css
?? src/app/comu/auth/
?? src/app/comu/components/auth-editorial.tsx
?? src/app/comu/components/auth-entry.tsx
?? src/app/comu/components/auth-form.tsx
?? src/app/comu/components/home-image.tsx
?? src/app/comu/forgot-password/
?? src/app/comu/home.css
?? src/app/comu/login/
?? src/app/comu/register/
?? src/app/comu/reset-password/
?? src/app/comu/seller/finance/connect-card.tsx
?? src/app/comu/seller/notification-bell.tsx
?? src/app/dev/
?? src/app/mobile/
?? src/components/pos-mobile-download.tsx
?? src/lib/comu/account-access.ts
?? src/lib/comu/auth-navigation.ts
?? src/lib/comu/notification-contract.ts
?? src/lib/comu/notification-email.ts
?? src/lib/comu/notification-worker.ts
?? src/lib/comu/notifications.ts
?? src/lib/pos/beta-policy.ts
?? src/lib/pos/beta-release.ts
?? src/lib/pos/client-transport.tsx
?? src/lib/pos/transport-server.ts
?? supabase/.branches/
?? supabase/migrations/20261005150000_comu_notifications_v1.sql
?? ../cometa-hotfix-recovery/
```

## Preparación del checkpoint N1

Certificación repetida completa antes de staging: PostgreSQL, concurrencia,
dedup/retry, RLS/privacidad, HTTP y Chromium PASS, exit code 0. Base desechable
`comu_n1_1791225264848` eliminada. Node, TypeScript y lint dirigido PASS.
Staging selectivo de exactamente los 13 archivos N1 de este informe;
`git diff --cached --check` PASS. Sin emails reales ni efectos remotos.
