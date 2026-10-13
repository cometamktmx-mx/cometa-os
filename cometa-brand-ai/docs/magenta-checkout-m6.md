# MAGENTA checkout M6 — implementation in progress

Status: NOT READY for final review or production. No deployment, commit, staging, live payment, or migration on an existing database was performed.

## M6.2 — HTTP/PostgREST y recuperación real del checkout

Recorrido integrado aprobado en `cometa_m6_1791697943877` y ejecución final en `cometa_m6_1791698066172`, ambas eliminadas al terminar sin FORCE. No se repitió la matriz SQL M6.1: no cambió SQL de aplicación ni su protocolo de inventario.

### Entorno y fronteras

- PostgreSQL real: base nueva desechable dentro del cluster local, con copia de esquema y fixtures. Las bases existentes solo se leen para obtener esquema/versiones; no reciben migraciones ni cambios.
- PostgREST y Supabase Auth/GoTrue reales, en contenedores nuevos conectados exclusivamente a esa base, con claves efímeras. Gateway HTTP local de paso: reenvía las solicitudes a esos servicios, no sustituye sus respuestas.
- Dos instancias Next.js con copias del código real en `.next/...`, marcas sintéticas `m1-brand` y `m1-other`, puertos 3182/3183. Sin copiar `.env` ni usar configuración comercial MAGENTA. Navegador Chrome real, páginas Producto, Bolsa y Checkout y handlers originales.
- Contrato vigente: checkout **invitado**. Cookie aleatoria HttpOnly, SameSite=Lax, host-only, y propietario derivado por hash. No se exige registro. Se creó e inició sesión de un usuario real en Auth aislado: su JWT válido fue rechazado por PostgREST al intentar leer `store_orders`, y no reemplaza la credencial privada del invitado.
- Los puertos de un mismo host comparten cookies por reglas del navegador. La segunda aplicación no puede leer el pedido de la primera porque el servidor resuelve su propia marca. No se afirma certificación HTTPS, dominios comerciales ni SSO del workspace.
- Únicamente Stripe y envío son sintéticos: preload del proceso de prueba intercepta **solo** `api.stripe.com` y lo dirige a un servidor local de respuestas de proveedor. No sustituye Supabase, fetch del navegador, handlers ni PostgREST. Cotización fixture persistida por el harness, ligada al propietario y al hash canónico de líneas/dirección. El SDK Stripe real sigue ejecutándose, pero **el proveedor Stripe no está certificado**.
- La pérdida de respuesta se inyecta con Chrome DevTools en la etapa Response de un POST `pay`, después de que el handler real termine. No se fabrica una respuesta de éxito ni se simula persistencia.

### Fallo de aplicación reproducido y corregido

El POST para iniciar la sesión de checkout devolvía 403 desde su propio navegador: Next normaliza la URL interna de `127.0.0.1` a `localhost`, por lo que comparar Origin contra `request.url` rechazaba el origen público correcto. El handler compara ahora contra `checkoutOrigin()`/`STOREFRONT_ORIGIN`, resuelto en servidor. La prueba verifica aceptación del origen configurado y rechazo de un origen externo. No se confía en Host/X-Forwarded-Host suministrados por el cliente.

Los otros ajustes fueron del harness: restaurar propiedad de objetos Auth con `supabase_admin` solo en la base nueva, esperar hidratación de React, normalizar el hash de la cotización sintética y completar la señal de conexión esperada por el SDK en el transporte Stripe simulado. No se relajaron permisos ni se modificó la lógica de producción para esos ajustes.

### Casos ejecutados

| Caso | Resultado |
| --- | --- |
| Producto → Bolsa → Checkout por navegador, con lectura PostgREST | PASS |
| Cookie real HttpOnly/SameSite, inaccesible mediante document.cookie | PASS |
| Persistir y perder la respuesta; recargar y recuperar misma clave/pedido | PASS |
| Replay con toda la existencia reservada | PASS |
| Dos creaciones iniciales simultáneas y reintentos concurrentes | PASS: misma operación |
| Cambiar comprador, aplicación/marca, dirección o cantidad usando la clave | PASS: rechazo sin devolver pedido ajeno |
| Cancelación y expiración mediante handlers, luego replay | PASS: terminal, sin resurrección |
| Cambiar después el precio POS | PASS: total original y dirección original conservados |
| Consulta sin cookie, con otro invitado o solo con JWT Auth | PASS: sin exposición; contrato GET devuelve order:null |
| Cookie inválida y página privada real del pedido en desktop/phone | PASS |
| A1 suspendido | PASS: cotización/nuevas operaciones bloqueadas; resume/cancel del propietario permitidos |
| Conteos finales | Dos pedidos para dos claves legítimas; una reserva por operación; reserved_quantity vuelve a cero |

El fixture inicial cuesta 120 MXN + envío sintético de 50 MXN; conserva 170 MXN tras cambiar el precio del catálogo a 999 MXN. Estos importes no configuran MAGENTA ni certifican reglas comerciales.

### Reproducción y archivos

`node scripts/test-storefront-m6-local.mjs --http`

- `apps/magenta-storefront/app/api/checkout/route.ts`: comparación de origen corregida.
- `scripts/test-storefront-m6-local.mjs`: modo HTTP y restauración Auth en destino desechable; conserva el modo SQL M6.1.
- `scripts/test-storefront-m62-http.mjs`: entorno, Auth/PostgREST, Next, navegador, aserciones y limpieza.
- `scripts/test-storefront-m62-stripe.cjs`: frontera de proveedor simulada, solo en procesos de prueba.
- Esta documentación y `docs/evidence/m62/`: evidencia nueva, sin sustituir M6/M6.1.

Evidencia inspeccionada: `bag-real.png`, `checkout-real.png`, `recovered-after-reload.png`, `private-order-real.png`, `private-order-phone-real.png`. Las capturas identifican explícitamente Stripe/envío sintéticos. La pantalla recuperada muestra el pedido pendiente original y permite reanudarlo; la bolsa separada informa disponibilidad libre cero porque la unidad ya pertenece a esa reserva.

Verificaciones finales: TypeScript sin emisión PASS; lint dirigido PASS; contratos Node M6 y bolsa M5 PASS; diff-check PASS. Este último no incluye archivos untracked, que se verificaron además por lint y ejecución. Comparación de hashes: tres archivos previos modificados (handler, runner y documento), dos scripts nuevos y cinco capturas; ningún archivo previo eliminado ni cambio en SQL M6.1. HEAD e índice permanecen intactos.

Pendientes fuera de M6.2: Stripe test real y webhook recibido del proveedor, logística/cotización real, configuración comercial aprobada, HTTPS/dominios y restantes requisitos de lanzamiento de M6. No se declara M6 completo ni listo para producción.

## M6.1 — recuperación y certificación de persistencia

La evidencia histórica de M6 que sigue más abajo se conserva; esta sección describe la continuación M6.1.

- Diagnóstico: C: tenía 648,929,280 bytes libres y D: unos 312.8 GB. Docker Desktop tenía procesos abiertos, pero `/_ping` agotaba 10 segundos y WSL mostraba `docker-desktop` detenido. No se encontró PostgreSQL nativo en PATH ni en las ubicaciones habituales revisadas. Un único `docker desktop restart --timeout 45` recuperó el motor: `PING OK` y PostgreSQL saludable. No se borraron volúmenes, discos virtuales ni datos existentes.
- La base `cometa_m6_1791690938119` coincidía con el runner/documentación del intento interrumpido: 24,494,607 bytes, 224 tablas de esquema, sin tablas M6 y cero marcas, usuarios e inventario. No tenía sesiones ni runners M6 activos. Se retiró exclusivamente esa base con `dropdb`, sin FORCE. El runner M6 también elimina ahora su base sin FORCE: una conexión restante impide la limpieza en vez de ser desconectada.
- Fallo reproducido 1: `store_cart_m6` fallaba por alias `x` ambiguo frente a la variable PL/pgSQL. Se calificaron los alias de líneas tanto en cotización como en normalización de la solicitud.
- Fallo reproducido 2: un pago que esperaba el bloqueo de inventario hasta después del vencimiento acababa como PAID. Prueba controlada: reserva con vencimiento a 6 segundos y bloqueo de inventario mantenido 10 segundos. La resolución ahora adquiere todos los bloqueos de inventario en orden antes de evaluar el plazo. El resultado esperado es PAYMENT_REVIEW, stock intacto y reserva liberada, sin reembolso ficticio.
- Solo se modifican la migración nueva M6, su runner, pruebas SQL y este documento. No se modifica SQL histórico ni código Retail/COMU/HTTP/UI.

La suite M6 pasó en `cometa_m6_1791696468988` y eliminó su base sin FORCE. La ejecución final ampliada pasó en `cometa_m6_1791696645918`, también eliminada sin FORCE:

| Caso SQL real | Resultado |
| --- | --- |
| Última unidad Retail / COMU / tienda, simultáneos | PASS: una sola operación gana; las demás rechazan por stock |
| Dos creaciones nuevas simultáneas con la misma clave | PASS: mismo pedido, un efecto RESERVE |
| Reintento con stock cero, precio posterior distinto y respuesta original perdida | PASS: mismo pedido, snapshot y total original |
| Clave con comprador/selección distintos; marca ajena | PASS: rechazo, sin reutilizar pedido ajeno |
| Cancelación, fallo y vencimiento repetidos; reintento terminal | PASS: sin resurrección ni doble liberación |
| Pago concurrente con cancelación/expirador | PASS: PAID o PAYMENT_REVIEW coherente con bloqueos/plazo |
| Pago esperando inventario hasta vencer | PASS: PAYMENT_REVIEW, sin consumo |
| Pago duplicado y expiración posterior a PAID | PASS: un movimiento de venta, sin liberar pedido pagado |
| Pago tardío después de que otro comprador consumió la unidad | PASS: revisión y ningún segundo consumo |
| Inventario disponible únicamente en otra sucursal | PASS: no se toma ni se libera stock de esa sucursal |
| Resolución de pedido existente después de suspensión A1 | PASS |
| RLS/grants instalados | PASS: seis tablas con RLS; RPCs operativas negadas a anon/authenticated |

Regresiones incluidas M4/M5 SQL: PASS. Sus handlers/SSR se ejecutan con transporte Supabase simulado conectado a SQL real; no certifican PostgREST. `node scripts/test-storefront-m6-contract.mjs`, lint dirigido de los dos scripts y `git diff --check`: PASS. No se cambió TypeScript de producción, por lo que no se repitió build ni certificación visual.

Comparación por hashes contra el inicio de M6.1: únicamente cambiaron estos cuatro archivos; ningún archivo previo falta ni se añadió otro archivo. HEAD permanece `e11383a1864aee98736834a8ca8c4bb7c7cb7bca`, sin staging ni commit.

La regresión M0 pasó en `comu_m0_1791696571811`: idempotencia, aislamiento, confirmación repetida, cancelación/vencimiento concurrentes, última unidad Retail/COMU y pago tardío sin consumo duplicado ni refund inventado. Se ejecutó el script previo sin modificarlo en disco; únicamente se retiró FORCE de su limpieza en memoria. La base se eliminó correctamente. Sus reproducciones iniciales corresponden al baseline anterior a aplicar M0 en esa base nueva, no a un fallo nuevo del esquema final.

Límites: fixtures comerciales, contactos, sesiones e identificadores de pago sintéticos. Son conexiones PostgreSQL reales y RPCs reales, no mocks de inventario. Recuperar la respuesta perdida se prueba volviendo a llamar desde una nueva conexión con la misma clave: mismo pedido, estado, snapshot y total aun sin stock y después de cambiar el precio del catálogo. Esto no certifica cookies, recarga de navegador contra PostgREST, autenticación real ni Stripe real. No se ha configurado MAGENTA comercialmente.

## Audit and boundaries

- POS `pos_inventory.quantity` and `reserved_quantity`, by location and variant, remain the inventory authority. M0 (`20261010120000_comu_reservation_lifecycle_m0.sql`) and `20260923110000_comu_shared_inventory_core_v1.sql` define the existing shared inventory protocol. M6 locks those same rows; it does not introduce another stock table.
- COMU reservation/order RPCs require marketplace buyers/listings/sellers. They are not a suitable direct own-store order API. M6 adds separate order/intention records, sharing POS products, variants and inventory.
- `src/lib/stripe/server.ts` handles POS subscriptions; `src/lib/comu/stripe.ts` handles marketplace payments/Connect. Neither account or commercial policy is inherited.
- `src/lib/comu/shipping-provider.ts` contains local simulated quotations and a Skydropx adapter requiring verified origin/destination/packages. Simulated prices are not used by M6. No certified MAGENTA dispatch location, carrier quotation or shipping policy was found.
- COMU wholesale policies in `20260923120000_comu_wholesale_core_v1.sql` are marketplace policies. M2 wholesale content is editorial. M6 does not silently import either into own-store pricing.
- Public eligibility continues through A1/M1/M2/M3/M5. Zero stock does not unpublish a product.

## Delivery sequence

1. Bag/checkout shell, server validation, durable attempt and passive status recovery.
2. Transactional own-store orders and shared stock reservations, certified in disposable PostgreSQL.
3. Stripe test Checkout/signature verification, paid confirmation, verified shipping integration.
4. HTTP/browser/SSR regressions, slow-network recovery, screenshots and real provider certification.

## Implemented locally, not yet certified

- `/bolsa`, `/checkout`, `/pedido/[orderId]`: quantity/removal, contact/address form, server-priced summary, loading/errors, pending attempt recovery and payment status. Product bag link connects to `/bolsa`. Existing approved Home/Catalog/Product composition is preserved.
- A per-brand HttpOnly guest session token is hashed for ownership. Knowing an order UUID is insufficient. Loss of the cookie currently requires a future secure recovery flow; email is not ownership.
- Backend rejects client prices/totals and unrecognized line fields. It reads canonical variant retail prices, computes minor units, and requires explicit reviewed `RETAIL_GROSS` configuration. No inferred wholesale discounts. Shipping/total remain unknown when no verified quote exists, and payment is blocked.
- Additive migration `20261011160000_storefront_checkout_m6.sql`: configuration, verified quote references, orders, immutable item snapshots, payment events and inventory effect ledger. RLS enabled, no anon/authenticated direct order grants, service-only operational RPCs.
- Config is absent by default and is not a second A1 enablement flag. Configuration names a dispatch location, currency and own Stripe account. No configuration UI or implicit setup is created.
- Create reserves the same POS inventory rows in deterministic order, snapshots prices, and binds owner/payload/idempotency key. One pending order per owner/brand. Retry lookup precedes availability in HTTP and SQL; terminal attempts do not resurrect.
- Resolution serializes on order then inventory rows. Paid consumes quantity and reserved quantity once, adding a POS inventory movement. Cancel/expiry releases only the corresponding reservation. Late payment enters PAYMENT_REVIEW without selling unavailable stock or claiming a refund.
- Expiry endpoint is bearer-protected and scoped to the server-resolved brand. No cron activated. Existing pending operations may resolve after A1 suspension.
- Stripe Checkout uses a stable order idempotency key, backend amount and own account verification. Only `sk_test_` accepted. Raw webhook signature verification uses the installed official Stripe SDK. Browser return cannot mark paid.
- Purchase integration descriptor is only returned for a paid order with a stable order event ID. No Meta calls are sent.

## Files added

- `supabase/migrations/20261011160000_storefront_checkout_m6.sql`
- `packages/own-storefront/checkout-contract.ts`
- `packages/own-storefront/checkout.tsx`
- `packages/own-storefront/checkout.css`
- `apps/magenta-storefront/lib/checkout-server.ts`
- `apps/magenta-storefront/lib/checkout-page.tsx`
- `apps/magenta-storefront/app/api/checkout/route.ts`
- `apps/magenta-storefront/app/api/checkout/expire/route.ts`
- `apps/magenta-storefront/app/api/stripe/webhook/route.ts`
- `apps/magenta-storefront/app/bolsa/page.tsx`
- `apps/magenta-storefront/app/checkout/page.tsx`
- `apps/magenta-storefront/app/pedido/[orderId]/page.tsx`
- `scripts/test-storefront-m6-local.mjs`
- `scripts/test-storefront-m6-sql.mjs`
- `scripts/test-storefront-m6-contract.mjs`
- `scripts/test-storefront-m6-ui.mjs`
- this document.

Existing M5 files touched: `apps/magenta-storefront/app/layout.tsx`, `apps/magenta-storefront/package.json`, `packages/own-storefront/bag.ts`, `packages/own-storefront/product.tsx`.

## Verification so far

The SQL harness copies schema only from local PostgreSQL to a newly named disposable database, then applies files and fixtures there. No SQL is applied to the existing database. It prepares actual Retail/COMU last-unit races, duplicate/concurrent checkout, payment/cancel/expiry, late payment after stock resale, snapshot/idempotency checks and role denials. These prepared assertions are NOT a passing certification.

- First disposable attempt `cometa_m6_1791690882052`: failed on a dollar-quote syntax error in the new M6 migration. Corrected in the new file. That database was dropped successfully.
- Second disposable attempt `cometa_m6_1791690938119`: Docker failed with OCI/setns errors; cleanup also failed. Existence/removal remains to be verified once Docker recovers. Never drop another database as cleanup.
- Host C: reported 0 bytes free; D: had approximately 313 GB available. The sandbox could no longer start processes or edit files. No files were deleted to make room.
- TypeScript initially found an incorrect Stripe SDK overload; corrected to `accounts.retrieveCurrent()`. Subsequent compiler/lint results must be recorded when complete.
- No real Stripe/Supabase HTTP/PostgREST/Storage end-to-end certification yet. Actual React browser screenshots use explicitly simulated commerce transport; no real card payment or external mutation executed.

## Blockers and remaining implementation

1. Recover C: space and Docker, then rerun disposable SQL certification and fix actual failures before considering the inventory protocol certified. Check the remaining disposable database explicitly.
2. Decide dispatch location, own Stripe test account, reviewed pricing policy (including whether own-store wholesale exists) and verified shipping tariff/provider. No credentials should be pasted into chat. Missing configuration deliberately blocks checkout.
3. Implement/wire a trusted shipping quote producer; current boundary consumes verified persisted quotes only. No quote is fabricated, and there is no public quote insertion API.
4. Finish HTTP-to-PostgreSQL tests with real handler execution, cookies, cross-owner/brand, retries and signed webhook events. Provider transport mocks must be labelled separately from actual Stripe test delivery.
5. Complete real HTTP SSR/integration, deeper slow-network/session failure tests and persistence regressions. Independent build and fixture browser desktop/tablet/phone checks passed; these are not a real payment certification.
6. Finish non-network ViewContent/AddToCart/InitiateCheckout integration descriptors and future consent/dedup contract. Do not send Meta events now.
7. Review invalid-input HTTP codes, initial session failure recovery, order confirmation item detail and refreshing pending payment status. Bag edits now share the addition queue and Web Lock; directed mixed-mutation certification remains pending.
8. Verify Stripe minimum session expiry window when resuming an old unbound attempt, provider session cancellation versus local cancellation, and response-loss recovery before provider idempotency retention expires. Current late payment policy is review, not automatic refund.
9. Rate limiting/abuse protection, durable guest order recovery, operational PAYMENT_REVIEW queue and scheduling are launch requirements not certified here. POS inventory movements exist in the proposed flow; POS cash/sales revenue reporting integration is not claimed.

## Configuration names (no values)

`STOREFRONT_BRAND_SLUG`, `STOREFRONT_SUPABASE_URL`, `STOREFRONT_SUPABASE_SERVICE_ROLE_KEY`, `STOREFRONT_STRIPE_TEST_SECRET_KEY`, `STOREFRONT_STRIPE_TEST_WEBHOOK_SECRET`, `STOREFRONT_ORIGIN`, `STOREFRONT_EXPIRY_SECRET`.

Do not reuse COMU/POS Stripe account implicitly. No production key is accepted. Actual test-mode account/webhook configuration and a real payment remain pending.

## Safe disable / rollback policy

Disable new own-store operations through existing A1. Preserve orders, items, quotes, reservation effects and event history; keep authenticated server payment resolution and expiry available. Do not drop tables or manually adjust stock to undo a migration with live orders. The migration is additive/reviewable and has only been attempted in disposable databases. Operational rollback preserves pending and paid records rather than destroying them.

HEAD remains `e11383a1864aee98736834a8ca8c4bb7c7cb7bca`; no staging or commits. M6 is partial and blocked, not approved for launch.
## Final static verification at interruption

- TypeScript `--noEmit --incremental false --pretty false`: PASS.
- Directed ESLint: PASS, 0 errors; one existing `product.tsx` img performance warning.
- `git diff --check`: PASS. This Git check does not cover untracked new files.
- Hash comparison against the initial pending-file inventory: only four pre-existing files changed (layout.tsx, package.json, bag.ts, product.tsx); no baseline file is missing and all other prior pending files retain their hashes. Fifteen M6 files were added, including this report.
- Independent Next.js webpack build: PASS, including `/bolsa`, `/checkout`, `/pedido/[orderId]`, checkout and Stripe webhook APIs.
- M6 Node contract: PASS; strict quantity/contact validation, rejects client prices, stable paid-only Purchase descriptor, real Stripe SDK rejects tampered/wrong-secret/stale signatures using synthetic events. No provider calls.
- M2/M3/M4/M5 Node contract regressions: PASS. M5 storage/fetch simulated explicitly.
- PostgreSQL and HTTP integration remain unverified. Third disposable-run attempt failed at Docker API before creating a new database, despite C: temporarily recovering approximately 706 MB.
- Browser capture harness PASS outside sandbox: actual React in Chrome at 1440, 820 and 390px; no horizontal overflow, contact form/summary, delayed synthetic quotation, bag retained after reload, no contact persisted locally, paid confirmation fixture. The sandbox run stalled and was interrupted; the successful retry used a fresh browser profile.
- Screenshots inspected: `docs/evidence/m6/checkout-desktop.png`, `checkout-summary-fixture.png`, `checkout-tablet.png`, `checkout-phone.png`, `confirmation-phone-fixture.png`. Every capture visibly states simulated session/shipping/payment. No actual Stripe payment-page screenshot is claimed.
