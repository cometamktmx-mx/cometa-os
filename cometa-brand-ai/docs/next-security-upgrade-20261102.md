# Actualización de seguridad Next.js — 2 de noviembre de 2026

Rama: `security/next-security-20261102`.

Copia de trabajo aislada: `/Users/camiloguerrero/Downloads/supabase-recovery-20261014/cometa-security-next-20261102`.

Base: `3d80242`, sin los cambios pendientes del diagnóstico QZ. La copia principal y esos tres archivos permanecen en `/Users/camiloguerrero/Downloads/supabase-recovery-20261014/cometa-production-20261023`. No se cambia la carpeta principal de trabajo. El estado inicial de esta rama no incluía push ni despliegue. El 2 de noviembre el usuario autorizó push, PR, merge y publicación después de validar el recorrido efectivo; el resultado final de la publicación se informa con sus IDs de despliegue y commit de merge.

## Aviso oficial y versión elegida

La pantalla de desarrollo de la copia principal muestra “Next.js 16.4.0 is affected by a known security vulnerability” y recomienda `next upgrade --agent=security`. Se observó el aviso en Chrome.

El [aviso oficial del 14 de octubre](https://nextjs.org/blog/nextjs-security-update-october-14-2026) fija 16.4.1 como mínimo corregido en la línea 16.4:

- [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr): RCE crítica en funciones `use cache` que devuelven varios typed arrays. El proveedor recomienda actualizar incluso sin esas funciones.
- [GHSA-2464-fhr4-w9xw / CVE-2026-96889](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw): RCE crítica en optimización SVG sobre Linux/glibc; requiere `sharp` >=0.35.5.
- [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r): DoS alta en App Router con Server Actions. Esta aplicación contiene una Server Action en `src/app/comu/seller/connect-settings-actions.ts`.

Se comprobó primero `next upgrade --help` y el código del CLI instalado: `--agent [type]` está disponible en 16.4.0 y admite `security`. En ejecución no interactiva entrega instrucciones al agente existente; no hace por sí solo la instalación ni completa la verificación.

Se ejecutó `next upgrade --agent=security` en la copia aislada. El primer intento no tuvo red; el segundo descargó la herramienta actual desde npm y eligió **16.4.4**, parche de la misma línea 16.4. Se leyeron sus guías generadas `shared.md` y `same-major.md`. [Release oficial 16.4.4](https://github.com/vercel/next.js/releases/tag/v16.4.4). La política y guías oficiales también están descritas en [Upgrading](https://github.com/vercel/next.js/blob/canary/docs/01-app/01-getting-started/18-upgrading.mdx).

Antes de editar se revisaron ramas/commits y PRs abiertos de GitHub: no hubo trabajo equivalente ni PR abierto. El registro npm confirmó Node >=20.9.0 y compatibilidad con React 19; se utilizó Node 24.22.1. No se ejecutaron codemods, no se adoptaron Cache Components/Future Defaults y no se añadió una configuración redundante `agentUpgrade: 'security'`, que ya es la política predeterminada. La telemetría de Next se mantuvo deshabilitada.

| Aplicación / paquete | Antes | Después |
| --- | --- | --- |
| Principal: `next` | 16.4.0 | 16.4.4 |
| Principal: `eslint-config-next` | 16.4.0 | 16.4.4 |
| Magenta storefront: `next` | 16.4.0 | 16.4.4 |
| React / React DOM en ambas | 19.2.4 | 19.2.4 |
| `sharp` instalado en ambas | principal ya tenía 0.35.5 | 0.35.5 |

POS mobile usa Vite, no Next, y no fue modificado. El diff del lockfile principal cambia únicamente versiones de Next, `@next/env`, `@next/swc-*`, `@next/eslint-plugin-next` y `eslint-config-next`. El storefront no tenía lockfile propio: se agregó para reproducibilidad de esa aplicación independiente. Instalación con npm, `--ignore-scripts --no-audit --no-fund`; auditoría posterior separada. No se utilizó `npm audit fix`, ni `--force`.

## Validación aislada

Toda la configuración de ejecución se construyó en memoria a partir del entorno sintético existente. La rama no contiene `.env`, credenciales ni tokens. Un gateway loopback 55411 apunta exclusivamente a Auth 55439 y REST 55438 del entorno `cometa-cash-close-test-*`. La aplicación compilada usa 55410 y el storefront 55412. No se usaron producción ni la base restaurada; pagos, mensajería y OpenAI reales quedaron sin configurar. El login/logout genera y revoca sesiones Auth sintéticas, sin ventas ni movimientos de negocio.

Resultados:

- **PASS:** instalación y `next --version` = 16.4.4 en ambas aplicaciones.
- **PASS:** TypeScript sin emisión en principal y storefront.
- **PASS:** build de producción de ambas aplicaciones con `next build --webpack`. Principal: compilación, TypeScript y 112 páginas generadas; storefront: compilación, TypeScript y 4 páginas generadas.
- **No validado con Turbopack:** ambos `next build` predeterminados permanecieron en “Creating an optimized production build” sin progreso observable y con CPU inactiva durante la observación. Se interrumpieron esos dos procesos y se completó la compilación con webpack. La validación inicial no había cambiado el script `build`. En la continuación autorizada se hizo explícito `next build --webpack` en ambos manifiestos para que el comando efectivo de despliegue use el compilador validado. No se considera resuelto el bloqueo de Turbopack ni se afirmará que se compiló con ese motor.
- **PASS:** arranque del build principal; pantalla de login hidratada en Chrome y mensaje de credenciales sintéticas inválidas. `GET /login` en build entrega inicialmente el fallback de Suspense; Chrome confirma la hidratación del formulario.
- **PASS:** password login real con cuenta sintética existente, cookies SSR, redirección autenticada `/login` → `/entry` → `/workspace`, contexto autenticado HTTP 200 y logout. Rutas protegidas redirigen al login sin sesión.
- **PASS:** endpoint real `GET /api/pos/terminal-print` devuelve 401 / `POS_UNAUTHORIZED` sin cuenta y 401 / `POS_STAFF_SESSION_REQUIRED` con cuenta pero sin sesión PIN.
- **PASS:** contrato de persistencia de sesión; 9 pruebas Food de servidor para permisos, roles y PIN; simulación de terminal (ventas, reimpresiones, cierres y copias); 11 pruebas de cierres; `git diff --check`.
- **PASS:** matriz ampliada QZ pendiente, ejecutada mediante harness temporal ignorado por Git. Carga el cliente QZ de la copia principal y el resto de módulos/dependencias de esta rama; verifica las firmas RSA/SHA512 y 36 combinaciones de fallos de venta/copia/cierre/copia con la biblioteca QZ real y transporte simulado. Ese harness **no modifica ni incorpora** el arreglo QZ a esta rama y no equivale a un build desplegable que combine ambos cambios.
- **PASS:** páginas del storefront `/`, `/catalogo`, `/bolsa` y `/checkout` HTTP 200; no se inició ningún checkout ni pago. Para el smoke se usó `next start`; Next avisa que este storefront configura `output: standalone` y recomienda usar el servidor standalone para su alojamiento propio.

Prueba adicional con fallo **preexistente**: `test-pos-self-service-access-v1.mjs` lanza `Unexpected table: pos_business_profiles`. Se reprodujo exactamente con las dependencias originales 16.4.0. Es un fixture incompleto; no se corrigió fuera del alcance de la actualización.

Auditoría npm comparada: principal pasa de 18 paquetes con avisos (1 crítico) a 17 (0 críticos). Desaparece `next` y sus tres avisos; no aparecen paquetes vulnerables nuevos. Persisten 16 avisos moderados de la cadena ESLint y uno alto de `zod`, también presentes antes. Storefront: 0 avisos. No se aplicaron actualizaciones ajenas para silenciarlos.

## Comandos de comprobación

Desde `cometa-security-next-20261102/cometa-brand-ai`, con el Node local en PATH:

```sh
node node_modules/next/dist/bin/next --version
node apps/magenta-storefront/node_modules/next/dist/bin/next --version
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node apps/magenta-storefront/node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false -p apps/magenta-storefront/tsconfig.json
node scripts/test-auth-session-persistence-v1.mjs
node --test scripts/test-pos-food-access-server-v1.mjs
node scripts/test-pos-retail-terminal.mjs
node --test ../verification/cash-close/verify.cjs
git diff --check
```

Para builds usar `npm run build -- --webpack` desde cada aplicación, con configuración sintética local validada y sin `.env` de producción. Los logs de esta ejecución están en `cometa-brand-ai/build/security-validation/`, excluidos de Git. El runner/gateway de pruebas está en `/tmp/cometa-security-tools.cjs` y no es un nuevo lanzador permanente de esta rama.

## Alcance final

La actualización inicial versionó los dos manifiestos, sus dos lockfiles y este informe. La continuación agrega el ajuste explícito de los scripts de build y conserva el guard y las reglas de Vercel del storefront descritos abajo. No hay cambios en código QZ, APIs, permisos, PIN, bases de datos o migraciones. La impresión física, confianza de la raíz Windows y resolución del incidente real “Failed to sign request” siguen pendientes del diagnóstico QZ separado. La actualización de seguridad no cierra ese incidente.


## Recorrido efectivo de Vercel y continuación autorizada

Lectura de API y logs de los proyectos existentes:

| Proyecto | Root Directory | Build Command override | Recorrido observado antes del parche |
| --- | --- | --- | --- |
| `cometa-os` (`prj_ecEVtItINKExbKMjTCfterMj1tJy`) | `cometa-brand-ai` | ninguno | `vercel build` → instalación npm → `npm run build` → `next build` / Turbopack |
| `magenta-controlled-preview` (`prj_MOOHfmywnzMF83PxRtqpDk1fvAqE`) | `apps/magenta-storefront` dentro del snapshot de la aplicación | ninguno | `vercel build` → `npm ci --prefix ../..` → `npm run build` → guard de producción → `next build` / Turbopack |

Ambos proyectos usan Node 24.x y framework Next.js. El principal está conectado al repositorio y publica `main`; el storefront se publicaba mediante snapshot CLI, sin conexión Git equivalente. Los logs previos identifican Next 16.4.0 y builds completados en Vercel; el bloqueo observado es local y no se atribuye sin evidencia a la plataforma.

Se comprobaron los archivos del storefront desplegado mediante la API de solo lectura. El guard `verify-production.cjs` exigía `VERCEL_ENV=production`, el backend confirmado y `STOREFRONT_PAYMENTS_MODE=live`. Su `vercel.json` también mantenía `npm ci --prefix ../..`, redirección 307 de `/_next/image` a `/image-service-disabled` y `X-Robots-Tag: noindex, nofollow, noarchive`. No estaban en el manifiesto/configuración actuales del repositorio: publicar esos archivos sin conciliarlos eliminaría protecciones existentes.

Ajuste explícito y reproducible:

- Principal: `build = next build --webpack`.
- Storefront: `build = node verify-build-target.cjs && next build --webpack`.
- El guard versionado conserva exactamente las tres precondiciones del guard desplegado en Vercel; rechaza Preview o un backend/modo de producción incorrectos. Para compilación local, sin contexto Vercel, exige backend loopback y modo test. No se permite usar el backend remoto en la validación local ni cambiar el backend del lanzamiento por uno de prueba.
- `apps/magenta-storefront/vercel.json` conserva el install command y las reglas de imagen/noindex desplegadas, además de la regla Git ya existente. No se cambian variables ni ajustes remotos del proyecto.
- Se ejecuta el comando real `npm run build`, sin argumentos adicionales, en ambas aplicaciones con Node 24 y variables sintéticas locales. El distDir de la aplicación principal es ahora el predeterminado `.next`, igual que en Vercel. Las comprobaciones anteriores con `--webpack` eran explícitas de terminal; este ajuste las convierte en el recorrido efectivo del producto.

Vercel documenta la resolución del [Build Command](https://vercel.com/docs/builds/configure-a-build). Next soporta el [flag explícito webpack](https://nextjs.org/docs/app/getting-started/installation). No se desactivan controles de seguridad para hacer pasar el build.

Para subir mediante CLI se prepara un snapshot limpio desde el commit: únicamente archivos versionados, sin `.env`, `.git`, `node_modules`, artefactos locales ni el harness QZ pendiente. Se utiliza el proyecto existente y un candidato Production sin asignar dominios hasta verificar READY y logs Next 16.4.4 / webpack. El snapshot del storefront conserva su Root Directory existente; el principal mantiene la integración Git y el commit de merge.

No se ejecutan migraciones, seeds, cobros, ventas, cierres ni impresiones remotas durante publicación/verificación. Las regresiones operativas son locales y sintéticas. La sincronización final de la copia principal se hace por fast-forward conservando los archivos QZ modificados y su documento sin versionar.
