# COMETA POS Mobile — M1

Estado: **COMPLETO en código y validación local**. Fecha: 2026-10-02.
No desplegado. No se instalaron paquetes, Capacitor ni proyectos nativos. Sin commit, push o migraciones remotas. M2 no iniciado.

## Alcance y decisiones

React/UI POS compartida y backend Next.js/Supabase común. La cuenta anfitriona conserva Supabase Auth y autorización de marca; el dispositivo limita la sesión a una marca/sucursal; el PIN identifica al operador físico. No hay auth paralelo ni credenciales de servicio en el contrato cliente.

Compatibilidad elegida: la web existente puede operar sin enrolamiento. Una sesión Supabase enrolada debe presentar credencial de dispositivo válida en todos los contextos POS; borrar esa cookie no la convierte en una sesión web libre. Food mantiene PIN obligatorio. Retail enrolado también exige PIN para las mutaciones protegidas; Retail web sin enrolar conserva RBAC de cuenta. Las RPC monetarias Retail y su atribución histórica se conservan; no se rediseñó su auditoría de operadores.

## Matriz de autorización

Todas las filas operativas requieren cuenta verificada, acceso a marca y acceso comercial activo, incluyendo `pos.access`. El servidor selecciona la operación; el cliente no puede elegir la política. Los permisos de cuenta salen de `user_brand_access`/RBAC. Se conserva la excepción canónica de administrador de plataforma, pero no omite el operador Food/enrolado. Los controles específicos más estrictos ya presentes se mantienen.

En esta tabla, **PIN** es obligatorio para Food y Retail enrolado. Los roles en mayúsculas son del operador local, no de la cuenta anfitriona. `ADMIN*` exige también modo administrativo vigente.

| Operación / endpoints bajo `/api/pos` | Entitlement adicional | Operador | Roles locales | Permiso de cuenta |
|---|---|---|---|---|
| Venta directa: `sales POST` | `pos.sales` | PIN | ADMIN, MANAGER, CASHIER | `pos.sale.create` |
| Abrir/cerrar caja y movimientos: `cash-sessions POST`, `cash-movements POST` | `pos.cash` | PIN | ADMIN, MANAGER, CASHIER | `pos.cash.operate` |
| Productos POST/PATCH, categorías POST, imágenes POST/DELETE, configuración de producto POST | `pos.products` | PIN | ADMIN* | `pos.products.write` |
| Inventario y recepción POST, incluidas presentaciones | `pos.inventory` | PIN | ADMIN* | `pos.inventory.write` |
| Crear cliente: `customers POST` | `pos.customers` | PIN | ADMIN, MANAGER, CASHIER, WAITER | `pos.customers.create` |
| Editar cliente: `customers PATCH` | `pos.customers` | PIN | ADMIN* | `pos.customers.write` |
| Loyalty `register_member` | `pos.loyalty` | PIN | ADMIN, MANAGER, CASHIER | `pos.loyalty.use` |
| Otras mutaciones Loyalty POST | `pos.loyalty` | PIN | ADMIN* | `pos.loyalty.manage` |
| Perfil, branding, personalización y logo | `pos.access` | PIN | ADMIN* | `pos.settings.manage` |
| Crear sucursal: `locations POST` | `pos.access` | PIN | ADMIN* | `pos.locations.manage` |
| Crear caja: `registers POST` | `pos.cash` | PIN | ADMIN* | `pos.registers.manage` |
| Invitaciones de equipo POST/DELETE y miembros PATCH/DELETE | `pos.access` | PIN | ADMIN* | `pos.team.manage`; restricciones owner existentes |
| Generar señales: `reports POST`, `reports/signals POST` | `intelligence.signals` | PIN | ADMIN* | `pos.intelligence.view` |
| Generar reporte: `reports/pulsar POST` | `intelligence.pulsar` | PIN | ADMIN* | `pos.intelligence.view` |

Fuente ejecutable: `src/lib/pos/mutation-policy.ts` y `mutation-access.ts`. La prueba M1 ejecuta todas las combinaciones de las 14 políticas y los cinco roles; verifica rechazo por entitlement, falta de PIN y modo administrativo.

Las siguientes operaciones ya tenían autorización local server-side y se conservaron. Ahora heredan además la validación de dispositivo desde `requirePosContext`:

| Operación | Entitlement | Operador / roles | Permiso local / condición |
|---|---|---|---|
| Food: crear mesa | `pos.access` | ADMIN | `STAFF_MANAGE` |
| Food: abrir cuenta | `pos.access` | ADMIN, MANAGER, WAITER | `ORDER_OPEN` |
| Food: agregar/editar ítems, servir, solicitar cobro, reanudar | `pos.access` | ADMIN, MANAGER, WAITER | `ORDER_EDIT`; estado/versión/propiedad SQL existentes |
| Food: enviar a cocina | `pos.access` | ADMIN, MANAGER, WAITER | `ORDER_SEND` |
| Food: preparar/listo KDS | `pos.access` | ADMIN, MANAGER, KITCHEN | `KDS_UPDATE` |
| Food: cobrar | `pos.access` + `pos.sales` + `pos.cash` | ADMIN, MANAGER, CASHIER | `SALE_CHARGE`; caja/sucursal y reintentos SQL |
| Food: anular ítem | `pos.access` | ADMIN, MANAGER | `RESTRICTED_AUTHORIZE` |
| Asociar cliente / memoria Food POST | `pos.access` | Operador activo; roles con `POS_ACCESS` | `POS_ACCESS`, marca/cliente verificados |
| Recetas, preparados, importación y controles de inventario Food | `pos.access` + `pos.products` + `pos.inventory` | ADMIN* | `STAFF_MANAGE`, sucursal verificada |
| Modificadores Food POST | `pos.access` | ADMIN* | `STAFF_MANAGE` |
| Previsualizar configuración POST | `pos.access` | Operador Food autorizado | Validación de configuración; no registra venta/movimiento |
| Staff POST/PATCH | `pos.access` | ADMIN; primer ADMIN exceptuado si equipo vacío | Anfitrión owner/admin o administrador de plataforma; PIN hasheado |
| Supervisor override POST | `pos.access` | Sesión actual + otro ADMIN/MANAGER con PIN válido | Acción permitida, sucursal, lockout; autorización corta de un uso |
| Operator-session login/admin/operation | `pos.access` | PIN validado; admin solo ADMIN | Sesión revocable; lock/switch/logout no requieren conservar entitlement |

Superficies de cuenta, no nuevas operaciones móviles: aceptar/rechazar invitación mantiene email autenticado y RPC canónica; billing web checkout/portal mantiene `pos.subscription.manage`; cambiar oferta/estado de suscripción mantiene administrador de plataforma. Inicialización de suscripción conserva su ruta de recuperación. No se agregó billing móvil ni se hicieron llamadas Stripe/IA/envíos reales.

## Gaps corregidos

- Mutaciones que solo comprobaban entitlement ahora exigen permiso de cuenta y, cuando corresponde, sesión/rol del operador y modo administrativo. No se confía en `staffId`, `role`, `permission` o `userId` enviados como autoridad por el cliente.
- Las RPC legacy de la baseline concedían ejecución a anon/authenticated, incluso `pos_adjust_inventory`. La migración de frontera retira ejecución de 13 familias mutantes y la conserva para service_role. Las variantes legacy de venta no quedan como vía alternativa para saltarse el endpoint.
- Veinte tablas POS tenían políticas de escritura basadas únicamente en acceso a marca. Se retiran privilegios directos de escritura de public/anon/authenticated, conservando SELECT, RLS y privilegios del backend. No se reescriben precios, cálculos ni políticas de lectura. No se encontraron consumidores browser de RPC/escritura directa en los componentes POS revisados.
- En caja se comprueba la sucursal real del register/cash-session, no solo la recibida en body. Inventario, recepción, productos y venta validan la sucursal aportada contra la terminal.
- Food valida dispositivo y acota al operador global a la sucursal de la terminal también dentro de `pos_food_actor_v1`. Revocación y uso comparten orden de locks; una sesión PIN nueva no puede insertarse después de la revocación.
- Se conserva `served_by` frente a `cashier_staff_id`: la regresión PostgreSQL verifica que quien entrega puede diferir de quien abre y cobra, y que los cobros conservan su caja y actor originales.

## Contrato de terminal

`pos_devices` contiene UUID generado por servidor, anfitrión, `auth_session_id` de Supabase, brand_id/slug, location_id, etiqueta, ACTIVE/REVOKED, creación, última actividad, expiración y revocación/actor. Es una identidad de enrolamiento; no un identificador de hardware ni fingerprint.

La credencial tiene 32 bytes aleatorios. Solo su SHA-256 queda en DB. El navegador recibe cookie HttpOnly, Secure en producción, SameSite=Lax, con vencimiento de 90 días. El JSON no contiene la credencial, hash, service key ni JWT. El `session_id` se extrae únicamente después de validar ese JWT exacto con `auth.getUser(token)`; tampoco se devuelve en bootstrap.

| Endpoint | Contrato |
|---|---|
| `POST /api/pos/devices` | `{brandSlug, locationId, label}`. Requiere anfitrión con settings.manage, marca y producto; enrolamiento inicial no necesita un PIN inexistente. Si ya hay contexto operador/dispositivo, exige ADMIN en modo administrativo. Devuelve `{device:{id,expiresAt}}` y Set-Cookie; elimina cookies PIN/admin para reautenticar al operador. |
| `GET /api/pos/devices?brandSlug=...` | Reconoce terminal de la sesión; devuelve solo metadatos seguros o null para web no enrolada. |
| `DELETE /api/pos/devices` | `{brandSlug,deviceId}`. Permite revocar la terminal propia incluso bloqueada; para otra exige privilegio administrativo y autoridad local aplicable. RPC atómica marca REVOKED y revoca sus sesiones PIN. Devuelve `clearLocalContext` para terminal propia. |
| `DELETE /api/pos/session` | Revoca sesión PIN del anfitrión, cierra Supabase local y elimina cookies de terminal/PIN/admin. Funciona como salida segura aun con acceso comercial perdido. |

Revocar no elimina la vinculación con la sesión Supabase: permanece como registro de revocación. Para enrolar de nuevo hay que cerrar sesión y autenticarse nuevamente. Quitar la cookie, cambiar brandSlug o enviar otro dispositivo no permite eludirlo. Un fallo de DB devuelve 503, no acceso de compatibilidad. Cambiar operador conserva la cuenta y dispositivo, revoca únicamente PIN/admin y limpia datos locales.

El módulo `device-client.ts` ofrece desenrolamiento con limpieza local. No se construyó un panel de flota, ni identificación de hardware ni UI completa de enrolamiento; esta entrega es el backend/contrato mínimo solicitado.

## Routing y estados

- Login, callback y entrada autenticada respetan `next` y después `returnTo` internos seguros, conservando query/hash. URLs externas no se aceptan.
- Sin destino: una marca POS-only disponible → `/brand/[brandSlug]/pos`; varias → `/pos`, selector exclusivo POS.
- Cuenta con acceso COMETA OS → `/workspace`. Canonical team conserva `/studio`; usuarios sin negocio conservan onboarding/invitación. No cambia la raíz `/brand/[brandSlug]` de OS ni su shell.
- La PWA entra por `/pos`; su scope `/` permite alcanzar las rutas canónicas por marca. No usa Workspace como inicio POS.
- 401 de cuenta lleva a login con retorno POS. 403 de marca, dispositivo o acceso muestra estado POS y salida segura. No redirige a Workspace. Fallos de resolución tampoco usan Workspace como fallback de login; pasan por `/entry`.

## Caché, offline y frontera cliente/servidor

IndexedDB v2 usa cuenta/dispositivo/marca/sucursal/operador en la clave. La actualización borra registros v1 sin esa identidad. No se persiste bootstrap ni autorización. Sin identidad verificada no hay lectura/escritura de snapshot. Food conserva snapshots solo bajo su sucursal canónica; sin sucursal resuelta no hay fallback.

Fallback de snapshot exige desconexión real (`TypeError` de red y navegador offline); 401/403/500 no lo habilitan. Cerrar sesión, desenrolar y cambiar operador limpian los seis stores y cachés POS; eventos/BroadcastChannel invalidan otras pestañas y las peticiones pendientes no restauran el contexto anterior. El callback de Supabase SIGNED_OUT activa también esta limpieza.

El service worker solo intercepta manifest y logo públicos, sin query. No intercepta HTML, RSC, APIs, auth ni imágenes autenticadas; elimina cachés POS antiguos al activarse. No se añadió offline transaccional. La outbox existente no tiene consumidores operativos y no se habilita: su scope antiguo sin identidad es rechazado por storage; necesita un contrato explícito de identidad antes de activarse en otro milestone.

`src/lib/pos/server.ts`, device-server, mutation-access, entry-server y los módulos privilegiados existentes mantienen `server-only`. La prueba recorre imports emitidos de Client Components POS y rechaza accesos a server-only/variables privadas. Supabase service-role, validación PIN, Stripe y futuras claves push/Wallet permanecen en servidor.

Transporte M1: HTTPS mismo origen, cookies Supabase + terminal + operador, endpoints JSON y códigos `POS_*`; no se envían roles como autoridad. El contrato de metadatos/dispositivo es compartible. No se habilitó bearer auth, CORS amplio, PKCE nativo ni exportación de cookies a JS. Keychain/Keystore y el adaptador de transporte de Capacitor siguen siendo trabajo futuro; esta entrega no pretende ser una autenticación nativa terminada.

## Verificación realizada

- `tsc --noEmit --incremental false --pretty false`: 0 errores.
- Suite dirigida Node de 11 scripts: **72 pruebas, 72 pasan**, sin red. Incluye matriz completa, API directa denegada/permitida, routing, roles, PIN/lockout, sesiones, revocación, limpieza, snapshots, SW, import graph y regresiones UI/DOM de Food.
- `node scripts/test-pos-mobile-m1-postgres-local.mjs`: **18 comprobaciones M1 pasan** sobre PostgreSQL local real; ambas migraciones y fixtures en una transacción con ROLLBACK.
- `node scripts/test-pos-mobile-m1-postgres-local.mjs --food-regression`: pasan también las suites SQL existentes de Food Operations y multirol/caja. Preservan cobros, stock, served_by, cashier, aislamiento, concurrencia mediante locks y reintentos idempotentes.
- Harness `test-pos-food-access-server-v1.mjs`: reparado import `./staff-shared` y fixture de roles canónicos; no se debilitaron aserciones. Los otros harnesses cambiados se adaptaron a imports/contratos M1.
- ESLint dirigido: **33 errores preexistentes antes y después**, 0 regresiones por regla/mensaje; archivos nuevos sin problemas. Los tres endpoints de reportes y la matriz pasan lint. No se corrigió deuda ajena.
- `git diff --check`: pasa.

Comando de suite Node:

```text
node --test scripts/test-pos-mobile-m1.mjs scripts/test-pos-food-access-server-v1.mjs scripts/test-pos-staff-foundation-v1.mjs scripts/test-pos-self-service-access-v1.mjs scripts/test-pos-food-shell-v1.mjs scripts/test-auth-session-persistence-v1.mjs scripts/test-pos-offline-foundation-v1.mjs scripts/test-workspace-empty-routing-v1.mjs scripts/test-pos-food-operations-v1.mjs scripts/test-pos-food-inventory-recipes-v1.mjs scripts/test-pos-multirole-cash-v1.mjs
```

No se ejecutó build completo ni una beta/browser E2E con cuentas reales. No se hicieron llamadas Stripe, envíos de invitaciones, generación IA o mutaciones remotas. Se inició Docker Desktop local para las pruebas SQL; las migraciones M1 no quedaron aplicadas de forma persistente.

## Pendientes antes de Capacitor

1. Revisión/aprobación de rollout de ambas migraciones; el backend requiere ese schema y falla cerrado si falta. Aplicarlas antes del código en el entorno que se autorice; aquí no se hizo deploy.
2. Ensayo E2E de enrolar → PIN → operar → revocar → volver a autenticar, en navegador y hardware del piloto, con las migraciones instaladas en un entorno de pruebas autorizado.
3. Definir política de enrolamiento obligatorio para nuevas terminales frente a web legacy y UX de administración/enrolamiento. La compatibilidad legacy es explícita, no una política de bloqueo global de todos los navegadores.
4. Implementar más adelante el adaptador nativo de auth/transporte y almacenamiento Keychain/Keystore. No empaquetar Next server, admin clients o secretos en el proyecto móvil.
5. Sincronización/offline transaccional, persistencia de outbox, periféricos, push, deep links y stores quedan fuera de M1. Tampoco se certificaron rules de tiendas ni billing móvil.

## Archivos M1 y estado Git

El listado siguiente distingue la entrega de los cambios COMU y otros archivos ya presentes en el workspace. `src/proxy.ts` ya estaba modificado: M1 agrega rutas públicas SW/manifest y entrada por producto; conserva sus cambios COMU previos.

<!-- FILE_INVENTORY -->

Archivos modificados/creados por M1 (66):

```text
A docs/cometa-pos-mobile-m1.md
A scripts/test-pos-mobile-m1-postgres-local.mjs
A scripts/test-pos-mobile-m1.mjs
A src/app/api/pos/devices/route.ts
A src/app/api/pos/session/route.ts
A src/app/entry/page.tsx
A src/app/pos/page.tsx
A src/components/pos-exit.tsx
A src/lib/pos/device-client.ts
A src/lib/pos/device-contract.ts
A src/lib/pos/device-server.ts
A src/lib/pos/entry-server.ts
A src/lib/pos/mutation-access.ts
A src/lib/pos/mutation-policy.ts
A src/lib/pos/navigation.ts
A supabase/migrations/20261002120000_pos_device_foundation_v1.sql
A supabase/migrations/20261002121000_pos_mutation_api_boundary_v1.sql
A supabase/tests/pos_mobile_m1.sql
M public/manifest.json
M public/sw.js
M scripts/test-auth-session-persistence-v1.mjs
M scripts/test-pos-food-access-server-v1.mjs
M scripts/test-pos-food-operations-v1.mjs
M scripts/test-pos-food-shell-v1.mjs
M scripts/test-pos-offline-foundation-v1.mjs
M scripts/test-pos-self-service-access-v1.mjs
M scripts/test-workspace-empty-routing-v1.mjs
M src/app/api/pos/bootstrap/route.ts
M src/app/api/pos/branding/route.ts
M src/app/api/pos/business-personalization/logo/route.ts
M src/app/api/pos/business-personalization/route.ts
M src/app/api/pos/cash-movements/route.ts
M src/app/api/pos/cash-sessions/route.ts
M src/app/api/pos/categories/route.ts
M src/app/api/pos/customers/route.ts
M src/app/api/pos/inventory-receiving/route.ts
M src/app/api/pos/inventory/route.ts
M src/app/api/pos/locations/route.ts
M src/app/api/pos/loyalty/route.ts
M src/app/api/pos/operator-session/route.ts
M src/app/api/pos/product-config/route.ts
M src/app/api/pos/product-images/route.ts
M src/app/api/pos/products/route.ts
M src/app/api/pos/profile/route.ts
M src/app/api/pos/registers/route.ts
M src/app/api/pos/reports/pulsar/route.ts
M src/app/api/pos/reports/route.ts
M src/app/api/pos/reports/signals/route.ts
M src/app/api/pos/sales/route.ts
M src/app/api/pos/team/invitations/[invitationId]/route.ts
M src/app/api/pos/team/invitations/route.ts
M src/app/api/pos/team/members/[userId]/route.ts
M src/app/auth/callback/route.ts
M src/app/brand/[brandSlug]/components/pos-food-access.tsx
M src/app/brand/[brandSlug]/components/pos-food-operations.tsx
M src/app/brand/[brandSlug]/components/pos-operator-gate.tsx
M src/app/brand/[brandSlug]/components/pos-shell.tsx
M src/app/brand/[brandSlug]/pos/layout.tsx
M src/app/login/page.tsx
M src/lib/pos/offline-storage.ts
M src/lib/pos/server.ts
M src/lib/pos/staff-server.ts
M src/lib/supabase/client.ts
M src/lib/supabase/middleware.ts
M src/lib/workspace/context.ts
M src/proxy.ts
```

Salida completa de `git status --short` (incluye cambios preexistentes preservados):

```text
 M public/manifest.json
 M public/sw.js
 M scripts/test-auth-session-persistence-v1.mjs
 M scripts/test-comu-buyer-visual-local.mjs
 M scripts/test-comu-stripe-checkout-e2e-testmode.mjs
 M scripts/test-comu-stripe-dispute-testmode.mjs
 M scripts/test-pos-food-access-server-v1.mjs
 M scripts/test-pos-food-operations-v1.mjs
 M scripts/test-pos-food-shell-v1.mjs
 M scripts/test-pos-offline-foundation-v1.mjs
 M scripts/test-pos-self-service-access-v1.mjs
 M scripts/test-workspace-empty-routing-v1.mjs
 M src/app/api/comu/buyer/experience/route.ts
 M src/app/api/pos/bootstrap/route.ts
 M src/app/api/pos/branding/route.ts
 M src/app/api/pos/business-personalization/logo/route.ts
 M src/app/api/pos/business-personalization/route.ts
 M src/app/api/pos/cash-movements/route.ts
 M src/app/api/pos/cash-sessions/route.ts
 M src/app/api/pos/categories/route.ts
 M src/app/api/pos/customers/route.ts
 M src/app/api/pos/inventory-receiving/route.ts
 M src/app/api/pos/inventory/route.ts
 M src/app/api/pos/locations/route.ts
 M src/app/api/pos/loyalty/route.ts
 M src/app/api/pos/operator-session/route.ts
 M src/app/api/pos/product-config/route.ts
 M src/app/api/pos/product-images/route.ts
 M src/app/api/pos/products/route.ts
 M src/app/api/pos/profile/route.ts
 M src/app/api/pos/registers/route.ts
 M src/app/api/pos/reports/pulsar/route.ts
 M src/app/api/pos/reports/route.ts
 M src/app/api/pos/reports/signals/route.ts
 M src/app/api/pos/sales/route.ts
 M src/app/api/pos/team/invitations/[invitationId]/route.ts
 M src/app/api/pos/team/invitations/route.ts
 M src/app/api/pos/team/members/[userId]/route.ts
 M src/app/auth/callback/route.ts
 M src/app/brand/[brandSlug]/components/pos-food-access.tsx
 M src/app/brand/[brandSlug]/components/pos-food-operations.tsx
 M src/app/brand/[brandSlug]/components/pos-operator-gate.tsx
 M src/app/brand/[brandSlug]/components/pos-shell.tsx
 M src/app/brand/[brandSlug]/pos/layout.tsx
 M src/app/comu/account/buyer/buyer-account.tsx
 M src/app/comu/account/buyer/page.tsx
 M src/app/comu/account/page.tsx
 M src/app/comu/cart/page.tsx
 M src/app/comu/components/commerce.tsx
 M src/app/comu/layout.tsx
 M src/app/comu/page.tsx
 M src/app/comu/products/[slug]/add-to-cart.tsx
 M src/app/comu/seller/finance/page.tsx
 M src/app/login/page.tsx
 M src/lib/comu/buyer-experience.ts
 M src/lib/comu/buyers.ts
 M src/lib/comu/public-routes.ts
 M src/lib/pos/offline-storage.ts
 M src/lib/pos/server.ts
 M src/lib/pos/staff-server.ts
 M src/lib/supabase/client.ts
 M src/lib/supabase/middleware.ts
 M src/lib/workspace/context.ts
 M src/proxy.ts
?? docs/cometa-pos-mobile-m1.md
?? docs/comu-buyer-auth-v1.md
?? public/comu/
?? scripts/test-comu-auth-local.mjs
?? scripts/test-comu-finance-lifecycle-local.mjs
?? scripts/test-pos-mobile-m1-postgres-local.mjs
?? scripts/test-pos-mobile-m1.mjs
?? src/app/api/comu/admin/finance/
?? src/app/api/pos/devices/
?? src/app/api/pos/session/
?? src/app/brand/admin/comu/finance/
?? src/app/comu/account/buyer/account-icon.tsx
?? src/app/comu/account/buyer/buyer-account.css
?? src/app/comu/auth/
?? src/app/comu/components/auth-boundary.tsx
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
?? src/app/dev/
?? src/app/entry/
?? src/app/pos/
?? src/components/pos-exit.tsx
?? src/lib/comu/auth-navigation.ts
?? src/lib/pos/device-client.ts
?? src/lib/pos/device-contract.ts
?? src/lib/pos/device-server.ts
?? src/lib/pos/entry-server.ts
?? src/lib/pos/mutation-access.ts
?? src/lib/pos/mutation-policy.ts
?? src/lib/pos/navigation.ts
?? supabase/.branches/
?? supabase/migrations/20261002120000_pos_device_foundation_v1.sql
?? supabase/migrations/20261002121000_pos_mutation_api_boundary_v1.sql
?? supabase/tests/pos_mobile_m1.sql
?? ../cometa-hotfix-recovery/
```
