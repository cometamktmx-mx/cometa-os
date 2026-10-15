# COMU Orders O1 — contrato y seguridad de estados

Alcance: seguridad/lectura funcional de Pedidos. Sin Visual V4, notificaciones,
outbox, cambios de catálogo, POS, Buyer o ejecución remota.

## Instalación y entorno

Migración: `20261005120000_comu_order_contract_state_safety_v1.sql`.
Transaccional, sin backfill ni tablas paralelas de pedidos. Añade únicamente
`comu_fulfillment_incidents.request_id`, su índice de idempotencia, un índice de
lectura por seller/fecha/ID y funciones dirigidas.

Depende de los objetos existentes de Orders/Payments, Marketplace Economics
(refunds/disputes), Fulfillment/HUB, Direct Shipping, Shipping webhook events y C1.
El harness clona **solo schema** public/auth/storage de PostgreSQL local hacia
`comu_o1_<timestamp>`, crea fixtures eliminables y aplica O1 exclusivamente allí.
No copia usuarios, pedidos ni datos comerciales. Solo copia versiones de
`auth.schema_migrations` necesarias para iniciar GoTrue aislado.

**O1 no está instalada en la base local principal ni en un remoto.** El código
depende de sus RPCs: antes de habilitarlo en un entorno persistente se necesita
autorizar e instalar esta migración. No hay fallback que restaure el bypass.

## Autorización y pago

`comu_order_actor_v1`: identidad autenticada, perfil activo, membership activa y
rol OWNER/ADMIN/ORDER_MANAGER. COMETA admin conserva su acceso administrativo.
C1 exige seller VERIFIED, estado PREPARING/ACTIVE, solicitud APPROVED/APPROVED,
marca/seller coincidentes y revisión real registrada. Legacy exige explícitamente
`approval_origin=LEGACY`, verificación VERIFIED y estado VERIFIED/ACTIVE; no crea
solicitudes ni revisiones históricas. No se concede acceso POS.

El fixture legacy se siembra únicamente en la base vacía desechable, suspendiendo
el trigger de inserción C1 solo durante esa siembra y restaurándolo inmediatamente.
Las pruebas de autorización/operación corren con todos los triggers activos.
El fixture C1 usa la RPC real de aprobación; no falsifica esa aprobación.

La transición bloquea master y suborder, vuelve a autorizar incluso si el estado
destino ya coincide y bloquea los pagos antes de validar una operación nueva.
Un retry autorizado de un estado histórico no vuelve a mutar ni duplica eventos.

Pago confirmado exige master PAID, último payment SUCCEEDED, mismo buyer, importe
en centavos igual al total y moneda coincidente. Refund REQUESTED/PROCESSING/
SUCCEEDED y dispute OPEN/UNDER_REVIEW/LOST invalidan una nueva operación aun si
master/payment todavía no reflejan la excepción. Refund/dispute se presentan por
su significado propio, nunca como simple pago pendiente.

## Estados y acciones

Se mantienen separados commercialState, fulfillmentState, paymentState,
financialCondition, shipment status y route.

| Ruta seller | Transiciones |
| --- | --- |
| HUB | PAID → PREPARING → READY_FOR_HUB → HANDED_TO_HUB |
| DIRECT | PAID → PREPARING → READY_TO_SHIP → SHIPPED, este último con shipment preparado y asociado |

Las etapas HUB posteriores no pertenecen al seller. No se mezclan rutas.
`getSellerOrderAllowedActions` y `getSellerOrderNextAction` son presentación,
compartida por fila/detalle; no sustituyen SQL. Keys: START_PREPARING,
MARK_READY_FOR_HUB, MARK_HANDED_TO_HUB, MARK_READY_TO_SHIP, SHIP_DIRECT,
WAITING_FOR_HUB y NO_ACTION.

## Lectura, privacidad y navegación

`GET /api/comu/seller/orders?contract=o1&sellerId=...` y
`GET /api/comu/seller/orders/{suborderId}?sellerId=...` usan la RPC autenticada
`comu_seller_orders_read_o1`. El helper de detalle SQL no tiene grants públicos.

DTO explícito: master/suborder IDs, folio, fecha, recipientName, items/snapshots
(título/imagen/variante/SKU/atributos/cantidad/precio/total), total/moneda, estados,
modo/ruta, deadline, timeline, tracking operativo e incidencias tipadas.
No entrega dirección completa, teléfono, token HUB, payloads de proveedor, label
privado, notas internas ni settlement. APIs sensibles usan `private, no-store`.

El contrato antiguo de lista se conserva para el Dashboard existente, con
proyección explícita limitada; el nuevo contrato no usa `select *` para respuestas.
La respuesta de mutación devuelve el detalle saneado en `suborder`.

Timeline procede de eventos persistidos de order/suborder/shipment, sin fabricar
fechas a partir de updated_at. Un evento de otra suborden no se propaga a la tienda.
Pago presenta PENDING/PROCESSING/PAID/FAILED/CANCELLED/EXPIRED/
PARTIALLY_REFUNDED/REFUNDED/DISPUTED/REVIEW.

Ruta explícita `/comu/seller/{brandSlug}/orders`. Ruta genérica: una tienda redirige;
varias muestran elección. El Shell incorpora acceso ORDER_MANAGER sin otorgarle
catálogo. Selected se autoriza y resuelve independientemente de página/filtros.
Filtros 30/90 días, estados (READY agrupa estados logísticos listos), búsqueda
literal por folio/título/SKU; paginación 20 predeterminada, máximo 50, orden estable
created_at DESC + id DESC. Métricas de la pantalla antigua describen la página
cargada, no un total comercial inventado. No se implementa diseño V4.

## Tracking e incidencias

El webhook conserva firma/parser existentes y llama una sola RPC transaccional.
Esta valida/deduplica evento, bloquea master/shipment, impide retroceder DELIVERED,
actualiza shipment y suborders asociados, agrega fulfillment master y persiste
eventos antes de processed_at. Error provoca rollback; respuesta HTTP 503 permite
retry. UNKNOWN queda registrado como ignorado. Cancelación logística produce
incidencia operativa; no cancela ni reembolsa el estado comercial.

La asociación es `comu_shipment_suborders`; para DIRECT se admite el contrato
existente de master con una única suborden. No se atribuye tracking arbitrariamente
a las otras tiendas de un master.

Incidencia: registro + evento + ISSUE cuando corresponde + agregado master en
una transacción. No retrocede DELIVERED/CANCELLED. requestId identifica el intento;
repetir con contenido diferente falla. Las llamadas antiguas sin requestId siguen
siendo nuevas incidencias; un cliente que necesite retry debe conservar requestId.
No se implementa soporte/tickets ni recuperación automática de ISSUE.

## Verificación reproducible

```text
node scripts/test-comu-orders-o1-local.mjs --http
node scripts/test-comu-orders-o1-presentation-local.mjs
node scripts/test-comu-seller-orders-local.mjs
node scripts/test-comu-seller-approval-local.mjs
node scripts/test-comu-seller-catalog-local.mjs
node scripts/test-comu-auth-local.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

El test integrado usa Docker existente, GoTrue/Auth y PostgREST aislados, gateway
127.0.0.1:58230 y Next 127.0.0.1:3117 con llaves aleatorias locales. No lee .env,
no usa Stripe/carrier real, deshabilita hooks/proveedores de email externos y no
almacena credenciales en evidencia. Los contenedores y DB se eliminan al finalizar.
El workspace temporal Next queda bajo `.next/o1-http-*` (ignorado por Git).

La matriz cubre pagos incompatibles/importe/moneda/refund/dispute, roles,
revocación incluso en retry, buyer/cross-seller, C1/legacy, HUB/DIRECT, requisito de
shipment, rollback/retry/duplicados/tracking atrasado, incidentes, privacidad,
snapshots y filtros. HTTP usa sesión real y APIs reales. Node prueba presentación
y regresiones; sus dobles de unidad no sustituyen la certificación HTTP/SQL.

No se ejecutan los scripts históricos que mutan la base principal o intentan
instalar migraciones allí. Sus garantías relevantes de fulfillment y acceso se
vuelven a certificar en el harness desechable O1.

## Reversión segura

Antes de cualquier instalación futura: respaldar definiciones/grants específicos
de funciones afectadas. Ante regresión grave, detener las rutas afectadas y revocar
EXECUTE de `comu_transition_suborder_fulfillment_v1(uuid,text,text,text)` a
authenticated; suspender webhook/worker afectado si hace falta. No restaurar la
función antigua que permite preparar sin pago. Mantener eventos, request_id y
datos. Corregir y reinstalar funciones conservando payment gate, autorización y
transacciones; restaurar grants dirigidos tras repetir la matriz desechable.
No se ofrece rollback destructivo ni eliminación de evidencia.

## Límites hacia V4/N1

V4 puede consumir DTO/acciones sin inventar datos; imágenes/campos ausentes quedan
null. N1 debe consumir eventos persistidos con su propia deduplicación/retry;
O1 no crea outbox ni asegura entrega de notificaciones. Requiere instalación
autorizada de O1 en el entorno donde se ejecute la futura certificación.

## Recuperación de sesión — 2026-10-05

Directorio confirmado: `D:\COMETA-AI\cometa-brand-ai`; raíz Git:
`D:\COMETA-AI`. Se conservó todo el árbol de trabajo, incluidos cambios ajenos
a O1. No se ejecutaron reset, checkout ni stash.

Evidencia anterior recuperada en `.next/o1-http-*/next.log`:

- `A0oyvh`: compilación detenida por ausencia de config en el workspace de prueba;
  el harness actual ya incluye `config` en su copia aislada.
- `LDpWNk`: APIs y webhook ejecutados; páginas explícita y genérica respondieron
  200, sin constancia de finalización de todas las aserciones.
- `JCcx6v`: APIs, filtros, detalle, incidencias y webhook ejecutados; compilación
  de la página explícita abortada por falta de memoria.

Estos logs y las copias de los harnesses acreditan ejecución previa sobre el
entorno aislado, pero no un PASS integral. No se recuperó salida concluyente de
los comandos Node/TypeScript anteriores; sus resultados se verificaron de nuevo.
Una consulta SQL `BEGIN READ ONLY` confirmó antes de reanudar: ninguna base
`comu_o1_*`, ninguna de las funciones `comu_order_actor_v1`,
`comu_seller_orders_read_o1`, `comu_process_tracking_event_v1` ni columna
`comu_fulfillment_incidents.request_id` en la base principal. Tampoco había
contenedores O1 activos o detenidos.

Inventario de implementación O1 recuperada (no atribuye a O1 otros cambios
coexistentes del repositorio):

```text
Modificados antes de recuperar la sesión:
scripts/test-comu-seller-orders-local.mjs
src/app/api/comu/admin/hub/incidents/route.ts
src/app/api/comu/seller/orders/route.ts
src/app/api/comu/seller/orders/[id]/fulfillment/route.ts
src/app/api/comu/shipping/skydropx/webhook/route.ts
src/app/comu/seller/[brandSlug]/[view]/page.tsx
src/app/comu/seller/layout.tsx
src/app/comu/seller/orders/page.tsx
src/app/comu/seller/seller-dashboard.tsx
src/app/comu/seller/seller-shell.tsx
src/lib/comu/fulfillment.ts

Creados antes de recuperar la sesión, aún sin seguimiento Git:
docs/comu-orders-o1.md
scripts/test-comu-orders-o1-local.mjs
scripts/test-comu-orders-o1-http-local.mjs
scripts/test-comu-orders-o1-presentation-local.mjs
src/app/api/comu/seller/orders/[id]/route.ts
src/app/comu/seller/orders-manager.tsx
src/lib/comu/order-presentation.ts
src/lib/comu/seller-orders.ts
supabase/migrations/20261005120000_comu_order_contract_state_safety_v1.sql
```

Durante la recuperación solo se editó este documento; se preservó la
implementación existente. Verificaciones nuevas:

- PASS: los cinco scripts Node de presentación O1, seller-orders,
  seller-approval, seller-catalog y auth enumerados arriba.
- PASS: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`.
- PASS: ESLint dirigido a los helpers, componentes y rutas TypeScript de O1
  enumerados en el inventario, sin errores ni advertencias.
- PASS: `git diff --check`.
- PASS: certificación SQL/HTTP reanudada con
  `node scripts/test-comu-orders-o1-local.mjs --http`, exclusivamente en
  `comu_o1_1791222408182`; salida final `O1 PostgreSQL PASS`, exit code 0.
  Incluye migración, matriz SQL, Auth/cookies, APIs reales, webhook firmado,
  ruta explícita, ruta genérica de una/varias tiendas, ORDER_MANAGER y logout.
  El harness confirmó `Removed disposable comu_o1_1791222408182` y completó
  la eliminación de sus contenedores Auth/PostgREST. Log HTTP conservado en
  `.next/o1-http-mf6Nzz/next.log`.

No se ejecutó build de producción ni validación visual interactiva de navegador.
Las comprobaciones de página del harness son HTTP/HTML y no certifican el layout
ni interacciones en navegador. No se instaló O1 en un entorno persistente.
