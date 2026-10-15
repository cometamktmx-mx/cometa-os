# COMU — Seller Orders Visual V4

Fecha: 2026-10-05. Implementación local. Revisión manual del usuario: **FUNCTIONAL = PASS · VISUAL = APPROVED**. Checkpoint local autorizado; sin push ni deploy.

## Checkpoint N1

## Certificación previa al checkpoint V4 aprobado

Repetida tras autorización del usuario: O1 PostgreSQL y Node PASS; V4 PostgreSQL/HTTP/Chromium PASS, incluyendo N1 deep links y Seller Visual V1 / Productos V2 ACTIVE en desktop/tablet/phone; Seller Orders/V4 Node PASS; N1 Node PASS; C2 y V3B PASS; TypeScript sin emisión PASS; lint dirigido PASS. Todos los comandos terminaron con código 0.

Bases locales desechables de esta repetición: `comu_o1_1791229046637` y `comu_v4_1791229038559`, ambas eliminadas. Sin emails reales ni escrituras a PostgreSQL principal/remoto. Evidencia visual regenerada con el diseño aprobado, sin cambios de implementación.

Checkpoint: `feat(comu): redesign seller order operations`. Alcance selectivo: los 10 archivos de implementación/pruebas/documentación V4 enumerados abajo, más los 14 PNG y `results.json` de la carpeta de evidencia V4: 25 archivos en total. Sin O1/N1 adicionales, Buyer, Home, POS, fixtures privados ni archivos ajenos. `git diff --cached --check` se verifica después del staging selectivo y antes del commit; el SHA y el índice final se reportan tras crearlo.

### Antecedente N1

- SHA: `8f85c4a45e1870ce86f27fc99522780a0deb862e`.
- Mensaje: `feat(comu): establish durable order notifications`.
- Padre O1: `e465f89a740010a8491905f12e25dede156b25a3`.
- Staging selectivo: exactamente 13 archivos; índice vacío después del commit.
- PostgreSQL N1, concurrencia/claims, dedup/retry/backoff, privacidad/RLS, HTTP, campana Chromium, Node, TypeScript, lint dirigido y cached diff-check: PASS antes del commit.
- Base de certificación N1: `comu_n1_1791225264848`, eliminada. Solo PostgreSQL local desechable. Cero correos reales. Provider delivery: MANUAL/PENDING.

Archivos del checkpoint:

1. `docs/comu-notifications-n1.md`
2. `scripts/test-comu-notifications-n1-http-local.mjs`
3. `scripts/test-comu-notifications-n1-local.mjs`
4. `scripts/test-comu-notifications-n1-node.mjs`
5. `src/app/api/comu/notifications/dispatch/route.ts`
6. `src/app/api/comu/notifications/route.ts`
7. `src/app/comu/seller/notification-bell.tsx`
8. `src/app/comu/seller/seller-shell.tsx` — solo import/inserción de campana N1.
9. `src/lib/comu/notification-contract.ts`
10. `src/lib/comu/notification-email.ts`
11. `src/lib/comu/notification-worker.ts`
12. `src/lib/comu/notifications.ts`
13. `supabase/migrations/20261005150000_comu_notifications_v1.sql`

## Presentación e interacción

Solo la parte superior de `docs/visual-references/comu-seller-orders-approved.png` inspira V4. Se conserva el Seller Shell V1 verde/crema y la campana N1 sin modificaciones. No se implementa la parte Buyer, push ni canales futuros.

- Header y copy aprobados. Seis métricas calculadas con pedidos reales de la página; su alcance aparece explícito. O1 no proporciona totales globales por estado, por lo que no se inventan.
- Tabla desktop; cards en tablet y teléfono, sin tabla horizontal. Búsqueda por folio/producto/SKU, estado, 30/90 días, orden O1 y paginación.
- Drawer desktop y detalle fullscreen en teléfono; cierre por botón, Escape o backdrop, foco contenido y restaurado al cerrar.
- Productos exclusivamente desde snapshots: imagen, nombre, variante/atributos, SKU, cantidad y precio. Fallback de imagen ausente o fallida.
- Destinatario usa `recipientName`; no se presume identidad Buyer. Entrega usa ruta HUB/DIRECT. Tracking solo desde el DTO autorizado; no ETA inventada.
- Pago separado de fulfillment; etiquetas de la presentación O1.
- Timeline de cinco hitos más historial. Cada hito confirmado requiere un evento persistido real; los eventos ausentes no se infieren del estado actual.
- Incidencias autorizadas con banner de atención, sin notas privadas ni sistema nuevo de soporte.
- Una acción primaria solo cuando `nextAction` coincide con `allowedActions`. WAITING_FOR_HUB y NO_ACTION no crean botón operativo. DIRECT requiere la preparación de envío que exige O1 antes de SHIP_DIRECT.
- Mutación O1 confirmada por servidor; bloqueo de doble envío, aviso de éxito/error por pedido y recarga de lista/detalle/timeline/métricas. Sin transición optimista.
- `selected` conserva resolución O1 independiente de página/filtros/periodo, incluidas notificaciones N1 de la tienda correcta.

## Certificación

Resultado final: **FUNCTIONAL = PASS · VISUAL = APPROVED**, según revisión manual del usuario. Sin bloqueos funcionales V4 pendientes. El provider email N1 conserva su estado MANUAL/PENDING y no bloquea V4.

| Verificación | Resultado real |
|---|---|
| `node scripts/test-comu-orders-v4-local.mjs` | PASS, exit 0: PostgreSQL desechable, Auth/PostgREST/Next reales, HTTP y Chromium |
| `node scripts/test-comu-orders-o1-local.mjs` | PASS: payment gate, OWNER/ADMIN/ORDER_MANAGER, denegaciones buyer/cross-seller/revoked, C1/legacy, HUB/DIRECT, tracking idempotente/out-of-order/retry, timeline, privacidad y filtros |
| `node scripts/test-comu-orders-o1-presentation-local.mjs` | PASS |
| `node scripts/test-comu-seller-orders-local.mjs` | PASS; incluye `test-comu-orders-v4-node.mjs` |
| `node scripts/test-comu-notifications-n1-node.mjs` | PASS; cero emails reales |
| `node scripts/test-comu-seller-catalog-local.mjs` | PASS C2; incluye `test-comu-product-editor-v3b.mjs` PASS |
| Seller Visual V1 y Productos V2 | PASS Chromium con tienda ACTIVE aislada en 1536×1024, 834×1112 y 390×844; no se usaron credenciales de los scripts históricos contra la base principal |
| TypeScript | PASS: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` |
| Lint dirigido | PASS para las cuatro superficies TS/TSX afectadas y los cuatro scripts de pruebas V4/Seller Orders |
| `git diff --check` / `git diff --cached --check` | PASS; índice vacío |

Ejecución final V4: `comu_v4_1791228424749`, eliminada. Regresión SQL O1: `comu_o1_1791227255129`, eliminada. No se aplicó ninguna migración a PostgreSQL principal ni remoto. No se creó ni modificó ninguna migración.

Chromium verificó búsqueda, filtros, 30/90 días, paginación, selected, abrir/cerrar, HUB y DIRECT nextAction, éxito/error/retry, respuesta perdida después del commit servidor sin evento duplicado, incidencias, multitienda, campana N1 → tienda correcta → pedido fuera del periodo/página, loading/error/empty y ausencia de overflow. Se corrigió una carrera de presentación entre el cambio de query y su respuesta: el detalle permanece en carga hasta recibir la query actual. Los avisos de mutación quedan asociados a su suborden.

Comparación visual inspeccionada con la referencia superior: misma jerarquía de métricas/lista/detalle, badges, timeline, snapshots, destinatario/entrega, pago y acción. Paleta y navegación del Shell V1 conservadas. Desktop muestra tabla; tablet cards de dos columnas; teléfono cards de una columna con primer pedido legible desde la primera pantalla, detalle fullscreen y CTA persistente. No se copian datos ilustrativos ni información ausente del DTO.

Capturas en `docs/visual-evidence/comu-seller-orders-v4/`:

- `orders-desktop-list.png`
- `orders-desktop-detail-hub.png`
- `orders-desktop-detail-direct.png`
- `orders-phone-list.png`
- `orders-phone-detail.png`
- `orders-issue.png`
- `orders-tablet-list.png`
- `orders-empty.png`
- `regression-v1-desktop.png`
- `regression-v1-tablet.png`
- `regression-v1-phone.png`
- `regression-v2-desktop.png`
- `regression-v2-tablet.png`
- `regression-v2-phone.png`
- `results.json`

Límites deliberados: métricas por página explícitas, no agregados globales inventados; no ETA, contacto Buyer, datos financieros internos ni canales no disponibles. El envío DIRECT mantiene la precondición O1 de shipment preparado; V4 no implementa infraestructura nueva de shipping. Sin cambios a Shell, campana, N1, SQL O1, Buyer, Dashboard, Productos, Finance o POS.

El harness V4 crea `comu_v4_<timestamp>`, restaura schema local sin datos principales y aplica migraciones O1/N1 existentes únicamente en esa base desechable. Auth/PostgREST y Next usan credenciales efímeras y endpoints loopback. No lee `.env.local`. Los productos/órdenes y las imágenes SVG son fixtures exclusivos del workspace temporal. N1 se activa después de los fixtures históricos; el nuevo evento usado en el deep link no produce backfill. Email sin configuración, ningún envío real.

## Archivos V4

Modificados:

- `src/app/comu/seller/orders-manager.tsx`
- `src/app/comu/seller/[brandSlug]/[view]/page.tsx` — solo rama orders.
- `scripts/test-comu-seller-orders-local.mjs`

Creados:

- `src/app/comu/seller/orders-detail.tsx`
- `src/app/comu/seller/orders-view.ts`
- `src/app/comu/seller/orders-v4.css`
- `scripts/test-comu-orders-v4-node.mjs`
- `scripts/test-comu-orders-v4-local.mjs`
- `scripts/test-comu-orders-v4-http-local.mjs`
- `docs/comu-orders-v4.md`
- Capturas y resultados en `docs/visual-evidence/comu-seller-orders-v4/`.

O1 SQL, contratos, APIs y N1 permanecen sin cambios. Se conservan los cambios ajenos preexistentes del working tree.

## Entrega V4 — cierre solicitado

| # | Elemento | Estado |
|---|---|---|
| 1 | Estado | Implementado y certificado localmente |
| 2 | Fidelidad mockup | Referencia superior adaptada al Shell V1; inspección de capturas completada |
| 3 | Lista | Tabla desktop y cards responsive |
| 4 | Métricas | Reales, por página y rotuladas |
| 5 | Filtros | Search/estado/30-90/paginación O1 PASS |
| 6 | Drawer/detail | Drawer desktop, fullscreen phone, carga/error/cierre PASS |
| 7 | Timeline | Solo eventos persistidos y timestamps reales |
| 8 | Productos | Snapshots; no reconstrucción desde catálogo actual |
| 9 | Destinatario | recipientName, sin atribución Buyer |
| 10 | Entrega | HUB COMETA / Envío directo; tracking autorizado, sin ETA ficticia |
| 11 | Pago | Presentación O1 separada |
| 12 | nextAction | Una primaria autorizada; sin botón para NO_ACTION/WAITING_FOR_HUB |
| 13 | HUB | PASS visual y transición; sin duplicado ante respuesta perdida |
| 14 | DIRECT | PASS visual y retry; sin acciones HUB |
| 15 | Incidencias | Banner y datos autorizados PASS |
| 16 | Notification deep links | PASS tienda correcta y selected fuera de página/periodo |
| 17 | Desktop | PASS 1536×1024 |
| 18 | Tablet | PASS 834×1112 |
| 19 | Phone | PASS 390×844, sin overflow, bottom nav V1 |
| 20 | Screenshots | 6 solicitadas + tablet/empty y 6 regresiones V1/V2 |
| 21 | Tests | PASS según comandos y límites detallados arriba |
| 22 | Archivos | Inventario exacto arriba: 3 modificados, 7 creados, 14 PNG y results.json |
| 23 | git status --short | Snapshot completo abajo; índice vacío |
| 24 | Desviaciones/bloqueos | Métricas por página, no globales; visual aprobado; sin bloqueo funcional V4 |
| 25 | ¿Listo para aprobación visual manual? | YES |

Workspace: `D:\COMETA-AI\cometa-brand-ai`. Raíz Git: `D:\COMETA-AI`.
Rama: `feature/comu-v1`. Base del checkpoint V4: checkpoint N1.
Checkpoint local V4 autorizado tras aprobación manual. Sin push, deploy, cron remoto ni inicio de Buyer Tracking o Configuración Seller.

## Git status de la entrega previa al checkpoint (histórico)

Los cambios ajenos preexistentes permanecen sin incluir en el checkpoint N1 ni modificar por V4.
`git diff --cached --name-only`: vacío.

```text
 M scripts/test-comu-buyer-visual-local.mjs
 M scripts/test-comu-seller-orders-local.mjs
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
 M src/app/comu/seller/[brandSlug]/[view]/page.tsx
 M src/app/comu/seller/finance/page.tsx
 M src/app/comu/seller/orders-manager.tsx
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
?? docs/comu-orders-v4.md
?? docs/comu-product-editor-v3b-final-git-status.txt
?? docs/comu-product-editor-v3b-git-status.txt
?? docs/comu-seller-certification-final-local.md
?? docs/comu-seller-certification-git-status.txt
?? docs/comu-seller-certification-local.md
?? docs/comu-v3b-pos-roundtrip-git-status.txt
?? docs/visual-evidence/comu-seller-orders-v4/
?? docs/visual-references/
?? public/comu/
?? scripts/certify-comu-seller-final-local.mjs
?? scripts/certify-comu-sellers-http-local.mjs
?? scripts/pos-beta-download-preview.mjs
?? scripts/prepare-pos-beta-schema.mjs
?? scripts/test-comu-account-capabilities-http-local.mjs
?? scripts/test-comu-auth-local.mjs
?? scripts/test-comu-finance-lifecycle-local.mjs
?? scripts/test-comu-orders-v4-http-local.mjs
?? scripts/test-comu-orders-v4-local.mjs
?? scripts/test-comu-orders-v4-node.mjs
?? scripts/test-pos-mobile-m2-http-local.mjs
?? src/app/android/
?? src/app/api/comu/admin/finance/
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
?? src/app/comu/seller/orders-detail.tsx
?? src/app/comu/seller/orders-v4.css
?? src/app/comu/seller/orders-view.ts
?? src/app/dev/
?? src/app/mobile/
?? src/components/pos-mobile-download.tsx
?? src/lib/comu/account-access.ts
?? src/lib/comu/auth-navigation.ts
?? src/lib/pos/beta-policy.ts
?? src/lib/pos/beta-release.ts
?? src/lib/pos/client-transport.tsx
?? src/lib/pos/transport-server.ts
?? supabase/.branches/
?? ../cometa-hotfix-recovery/
```
