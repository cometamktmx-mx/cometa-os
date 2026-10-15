# COMETA POS Mobile M2 — entrega local

Fecha: 2026-10-02. Base M1: `78a5998d33317e1e91f79b4952a481263eafca42`.

## Estado y alcance demostrado

**PARCIAL**: cliente React/Capacitor implementado, UI Food compartida compilada y flujo backend real certificado por HTTP local. No se ha instalado una app ni generado APK; no se afirma prueba visual/táctil ni prueba nativa de Keychain/Keystore. No se comenzó M3, ni se aplicaron migraciones remotas, ni se conectó Macca Production. Sin commit/push/deploy.

Faltan dos requisitos para generar/probar Android: confirmación del dominio controlado por COMETA para package/bundle ID, y JDK/Android SDK. Se solicitó el dominio durante el trabajo; no hubo respuesta. Configuración nativa falla explícitamente sin `COMETA_POS_APP_ID`. No se inventó identidad. Java/adb/gradle no están en PATH; JAVA_HOME/ANDROID_HOME/ANDROID_SDK_ROOT no configurados; no se encontraron SDK ni JDK en ubicaciones estándar. No se instaló tooling pesado. iOS dispone de dependencia/config/script SPM, pero aún no de proyecto generado ni compilación.

## Arquitectura

| Superficie | Ubicación y responsabilidad |
|---|---|
| Web/backend | Next.js existente, Supabase Auth, handlers POS y RPC canónicos |
| Mobile | `apps/pos-mobile/`, React/TypeScript/Vite, Capacitor, shell/auth/negocios/terminal/PIN/lifecycle |
| Shared | Componentes Food existentes, permisos/tipos, CSS POS y contexto de transporte `src/lib/pos/client-transport.tsx` |

Dependencias independientes y fijadas en lockfile mobile: core/Android/iOS 8.5.2, CLI 8.4.3, App 8.1.2, Network 8.0.1, SplashScreen 8.0.2, Capgo native-biometric 8.7.0, React 19.2.4, Supabase JS 2.107.0, Vite 7.3.6. CLI 8.4.3 evita vulnerabilidades transitivas del CLI inicialmente probado; último audit de instalación: 0 vulnerabilidades. No se modificaron package/lockfile raíz.

El shell contiene splash React COMETA/POS, cuatro slides solicitadas, entrada por email/contraseña, selector POS 0/1/múltiples negocios, enrolamiento por sucursal, PIN, bloqueo y logout. Onboarding-visto es solamente presentación. Crear negocio y recuperación móvil se señalan como pendientes, sin flujos ficticios. No hay Google/OAuth WebView.

## Seguridad y contratos

La nueva ruta `/api/pos/mobile/[...path]` tiene allowlist explícita; verifica Bearer con Supabase y reaprovecha handlers M1 sin copiar reglas. Host, marca, terminal y operador se autorizan en servidor. No hay fallback de cookies para autorizar mobile. AsyncLocalStorage aísla credenciales por petición; `posCookies()` conserva el comportamiento cookie existente para Web. Respuestas no-store con `Vary: Authorization`.

Headers de transporte: `Authorization: Bearer`, `x-cometa-pos-device`, `x-cometa-pos-staff-session`, `x-cometa-pos-admin-session`. El envelope `{payload, credentials}` comunica rotaciones al cliente; `payload` conserva el contrato de negocio. Credencial de terminal/host en vault nativo; operador/admin solo memoria. Vault serializa escrituras y propaga errores. Un contador de contexto descarta respuestas tardías tras cambio/bloqueo de operador.

Rutas adicionales: GET `brands` resuelve membresías activas/entitlements POS/sucursales; POST `session/lock` invalida sesiones operativas activas del mismo host+terminal+marca incluso sin token operador; DELETE `session` cierra la sesión anfitriona actual y limpia credenciales. Revocación usa la API M1. Reapertura revalida cuenta, terminal, negocio y exige PIN. El cliente no persiste PIN, rol ni permiso como autoridad.

La ruta mobile exige `POS_MOBILE_ENABLED=true` y Supabase loopback. La app permite únicamente endpoints locales/privados, sin userinfo ni rutas inyectadas. No habilita Production. Secure storage nativo usa la API de datos del plugin Capgo; navegador usa memoria. El bundle inspeccionado no contiene service-role, Stripe keys, módulos server-only ni variables privadas.

Offline: no transacciones offline nuevas; se distingue desconexión de HTTP 401/403, se limpia contexto M1 al salir/bloquear/denegar y no se usa snapshot como autorización. Network/lifecycle están conectados a Capacitor; su ejecución nativa permanece por verificar. La UI Food se deshabilita sin conexión; una operación exige confirmación backend.

## Food reutilizado y prueba real

Se importa `PosFoodOperations` directamente, junto con modificadores/configurador, memoria de cliente, recibos, modales y estilos existentes. Adaptaciones: contexto fetch inyectable con default Web; estilo print estándar compatible Vite; prop opcional de impresión (default true para Web, false en mobile). No se reconstruyó Food ni se alteraron reglas monetarias.

La prueba HTTP real usa cuenta/negocio/producto/operadores sintéticos en `food_integration_20261002183632530`, Supabase Auth/PostgREST locales y Next aislado de cambios ajenos. No usa cookies para las solicitudes mobile. Resultado: `M2_BEARER_FOOD_HTTP_PASS`.

Verificado: anónimo/Bearer inválido rechazados; 0/1/múltiples negocios; terminal requerida/enrolada; PIN; WAITER sin permiso administrativo; mesa/cuenta; modificador y agregado; envío; KITCHEN preparación/listo; WAITER entrega/solicitud de cobro; CASHIER cobro/reintento idempotente/cierre; `served_by` y `cashier_staff_id` canónicos; bloqueo frío y replay rechazado; PIN nuevo; revocación y replay rechazados; logout.

La prueba HTTP incluye abrir/cerrar turno de caja. La UI móvil reutilizada demuestra por compilación la superficie de cobro de Food; no se ha extraído UI para apertura/cierre de turno. El modo `--serve` deja un turno de fixture abierto para recorrido interactivo. No confundir cobertura HTTP con prueba de interacción instalada.

## Verificación

- TypeScript raíz sin emisión/incremental: PASS.
- Build mobile (TypeScript + Vite): PASS. Warnings de directivas `use client` ignoradas por Vite y chunk >500 kB; no impiden build, quedan para optimización posterior.
- Tests mobile: 9/9 PASS (onboarding, selector, destinos locales, offline/autorización, vault, transporte/restore/lock/logout, aislamiento server y secretos en bundle).
- Tests M1 + access-server: 21/21 PASS.
- Food operations/modifiers/configurator/pilot-hardening/multirole/self-service: 42/42 PASS tras adaptar loaders al nuevo contexto compartido y al alias offline M1. El guard self-service ejecuta 163 comprobaciones. Warnings preexistentes de keys en fixtures React.
- Harness HTTP local Bearer/Food: PASS, repetido incluyendo bloqueo frío y selector múltiple. `--serve` también arrancó frontend y backend correctamente.
- ESLint dirigido nuevo código: PASS.
- `git diff --check` dirigido: PASS; advertencias de normalización CRLF del repositorio.
- No comprobación visual: no hay navegador habilitado en las herramientas de esta sesión. No comprobación Android/iOS ni pantalla completa/orientaciones/targets en hardware.

Instrucciones reproducibles: [README mobile](../apps/pos-mobile/README.md).

## Inventario M2

Nuevos:

```text
apps/pos-mobile/.gitignore
apps/pos-mobile/.env.example
apps/pos-mobile/README.md
apps/pos-mobile/package.json
apps/pos-mobile/package-lock.json
apps/pos-mobile/index.html
apps/pos-mobile/tsconfig.json
apps/pos-mobile/vite.config.ts
apps/pos-mobile/capacitor.config.ts
apps/pos-mobile/scripts/prepare-native.mjs
apps/pos-mobile/src/App.tsx
apps/pos-mobile/src/main.tsx
apps/pos-mobile/src/policy.ts
apps/pos-mobile/src/styles.css
apps/pos-mobile/src/transport.ts
apps/pos-mobile/src/vault.ts
apps/pos-mobile/tests/foundation.test.mjs
src/lib/pos/client-transport.tsx
src/lib/pos/transport-server.ts
src/app/api/pos/mobile/[...path]/route.ts
scripts/test-pos-mobile-m2-http-local.mjs
docs/cometa-pos-mobile-m2.md
```

Modificados:

```text
src/lib/pos/server.ts
src/lib/pos/device-server.ts
src/lib/pos/staff-server.ts
src/app/api/pos/devices/route.ts
src/app/brand/[brandSlug]/components/pos-food-operations.tsx
src/app/brand/[brandSlug]/components/pos-food-modifiers.tsx
src/app/brand/[brandSlug]/components/pos-food-receipt.tsx
tsconfig.json
scripts/test-pos-food-access-server-v1.mjs
scripts/test-pos-mobile-m1.mjs
scripts/test-pos-food-operations-v1.mjs
scripts/test-pos-food-modifiers-v1.mjs
scripts/test-pos-food-configurator-v1.mjs
scripts/test-pos-food-pilot-hardening-v1.mjs
scripts/test-pos-multirole-cash-v1.mjs
```

Artefactos ignorados: dependencias/dist mobile, workspaces/logs temporales bajo `.next`. Se preservan cambios previos COMU/Buyer/Finance/Stripe, proxy, assets, dev, supabase/.branches, documentación M1.5 y recovery externo. Ninguna migración creada/aplicada por M2.

## Pendientes antes de M3 Beta Macca

1. Confirmar dominio, fijar ID estable y generar Android/iOS; preparar icon/splash nativos COMETA y pantalla completa.
2. Disponer de JDK21/SDK36, compilar APK debug e instalar en tablet Android. Probar cold start/restore/refresh, vault real, revoke, suspensión, pantalla bloqueada, red y logout.
3. Ejecutar el recorrido Food desde UI instalada en portrait/landscape; comprobar controles táctiles, overflow, teclado/PIN y cada rol. El E2E HTTP no sustituye esta prueba.
4. Resolver recuperación con enlaces verificados y configuración Supabase apropiada; no hay deep link móvil todavía. Crear negocio sigue fuera del recorrido crítico de esta prueba.
5. Decidir acceso a apertura/cierre de turno de caja desde app o preparación administrada por Web para piloto; ahora se comparte la superficie Food de cobro.
6. Definir entorno HTTPS autorizado para beta y certificarlo antes de retirar las barreras local-only; aplicar M1 remoto solo con autorización explícita separada. No conectar Macca todavía.
7. Validar iOS después en macOS/Xcode y revisar requerimientos nativos del plugin seguro. No hay readiness de stores ni release signing en este milestone.

M3 no debe iniciarse como beta de clientes hasta completar la prueba instalada y resolver estos límites de seguridad/entorno. Esta entrega no declara M2 completo.

## git status --short al cierre

Staging vac?o; HEAD conserva el commit M1. La salida incluye cambios ajenos preservados; el inventario anterior delimita M2.

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
 M src/app/comu/components/commerce.tsx
 M src/app/comu/layout.tsx
 M src/app/comu/page.tsx
 M src/app/comu/products/[slug]/add-to-cart.tsx
 M src/app/comu/seller/finance/page.tsx
 M src/lib/comu/buyer-experience.ts
 M src/lib/comu/buyers.ts
 M src/lib/comu/public-routes.ts
 M src/lib/pos/device-server.ts
 M src/lib/pos/server.ts
 M src/lib/pos/staff-server.ts
 M src/proxy.ts
 M tsconfig.json
?? apps/
?? docs/cometa-pos-mobile-m1-5-certification.md
?? docs/cometa-pos-mobile-m2.md
?? docs/comu-buyer-auth-v1.md
?? public/comu/
?? scripts/test-comu-auth-local.mjs
?? scripts/test-comu-finance-lifecycle-local.mjs
?? scripts/test-pos-mobile-m2-http-local.mjs
?? src/app/api/comu/admin/finance/
?? src/app/api/pos/mobile/
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
?? src/lib/comu/auth-navigation.ts
?? src/lib/pos/client-transport.tsx
?? src/lib/pos/transport-server.ts
?? supabase/.branches/
?? ../cometa-hotfix-recovery/
```
