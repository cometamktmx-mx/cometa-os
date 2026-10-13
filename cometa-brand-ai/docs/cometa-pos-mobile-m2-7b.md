# M2.7B — preparación local de Beta

Production y M2.6 permanecen sin cambios operativos. No se creó infraestructura,
aplicó SQL remoto, generó clave privada, firmó release, publicó ni subió archivos.

## Alcance recuperado

La base M1 es `78a5998d33317e1e91f79b4952a481263eafca42`.
El inventario exhaustivo preexistente y sus hashes están en
`apps/pos-mobile/artifacts/m2-7b/before.json`; la clasificación por archivo está en
`docs/cometa-pos-mobile-m2-scope.json`. Los archivos compartidos pueden pertenecer
a varios hitos: no existe un commit por M2/M2.5/M2.6 que permita atribuir cada línea.
No se hizo staging, stash, reset ni movimiento de archivos. Una futura copia de
release debe incluir solo el alcance revisado y registrar digest del snapshot;
HEAD solo no identifica los cambios aún no committeados. No publicar este árbol completo.

## Perfiles y destinos

Desde `apps/pos-mobile`:

```
npm run build:development
npm run build:beta
```

`build` conserva development. `build:production` existe pero está bloqueado antes
de compilar. No se ejecutó una build Production. El comando selecciona
`VITE_POS_ENV`; si ya existe y contradice el modo se rechaza. URL backend, URL Auth
y clave pública son obligatorias incluso en development; se conserva el archivo
local existente. No hay fallback a un remoto.

Beta requiere las seis variables de `.env.example`, coincidencia exacta con
`config/pos-environments.json` y HTTPS. Los destinos están vacíos, intencionalmente.
No usar `.env.local` raíz ni copiar secretos de Production. La clave publishable
o anon es pública; service-role, passwords y claves de firma solo servidor/CI.
`config/download-origins.json` debe autorizar explícitamente el futuro storage.
El entorno Vercel `preview`/`production` no determina el destino COMETA.

## Backend y Partners

`config/pos-beta.backend.env.example` define una instalación Beta independiente.
`POS_MOBILE_ENABLED=true`, `POS_MOBILE_ENV=beta`, `COMETA_RUNTIME_ENV=beta` y
los destinos aprobados deben coincidir. La superficie Beta permite solo API
mobile, página Android, enlaces y metadata; bloquea las demás APIs y acciones web.
La configuración de Vercel Beta debe usar `config/vercel.pos-beta.json`, sin crons.

`POS_BETA_PARTNERS_JSON` es una lista server-side. Cada entrada requiere:
`userId` UUID, `brandSlug` canónico, `locationIds` UUID no vacíos y `expiresAt`.
La lista vacía no autoriza a nadie. No usar emails, comodines ni roles enviados
por el cliente. Cambiar la lista requiere redeploy/configuración del backend;
la expiración se comprueba en cada petición. No hay tabla nueva ni migración de Partners.

JWT se valida con Supabase; después se verifica Partner. `requirePosContext`
invoca un callback de autorización por petición sobre la marca canónica y la
sucursal del dispositivo. Enrolamiento y revocación comprueban también la sucursal
objetivo. El selector solo muestra sucursales autorizadas. No existe bypass de
Partner para administradores. Se conservan membership, entitlement comercial,
permisos, dispositivo y PIN. Logout sigue disponible al retirar acceso.

Beta debe contener solo cuentas/negocios piloto creados explícitamente. Configurar
operadores, permisos y sucursales mediante procedimiento administrativo autorizado;
las superficies web administrativas están cerradas en este despliegue mínimo.
No copiar usuarios ni datos Production. No habilitar signup público.

## Integraciones y límites

Sin Stripe, WhatsApp, Meta secrets, IA facturable, credenciales de envíos ni cron.
Las guardas rechazan esos secretos y exigen flags disabled. No se alteraron módulos
COMU/Finance ni handlers Food/Retail. La autoridad sigue siendo backend y SQL.
Las respuestas mobile son no-store; no se registran bearer/PIN/códigos de recovery.
El PIN existente usa intentos y `locked_until` (persistidos); su contador actual
no es un rate limiter global atómico. Antes de piloto público verificar límites
de Supabase Auth y configurar WAF/rate limits de login/PIN/enrolamiento en Beta.

## Schema reproducible, sin ejecutar

```
node scripts/prepare-pos-beta-schema.mjs
```

Produce manifest SHA-256 y `review-only.sql` en artifacts/m2-7b/schema. Cadena:
baseline 20260828233603; prefijo foundation hasta 20260919140000; POS recipe v2,
service modes, void items e inventory controls de 20260922; después:

1. 20261002120000_pos_device_foundation_v1.sql
2. 20261002121000_pos_mutation_api_boundary_v1.sql

Son 34 migraciones. Se excluyen todos los archivos `_comu_`, incluido el pendiente
20260928180000. El prefijo conservador incluye foundations compartidas anteriores
de acceso/OS para evitar eliminar dependencias transitivas por intuición. El
baseline ya contiene POS, brands, Auth references y grants; no incluye copia de
usuarios Production. Revisar semillas de catálogo y funciones antes de aprobación.

El SQL exige base de aplicación vacía, registra cada migración y conserva su
atomicidad individual. **No está certificado todavía contra una nueva instancia**.
No ejecutarlo en un proyecto con historial o schema existente ni reiniciarlo a
ciegas después de un fallo parcial. Comparar hashes/historial y preparar continuación
dirigida si hace falta. No existe rollback inverso certificado: bloquear mobile,
restaurar una copia Beta consistente o forward-fix; nunca reabrir los grants revocados.

Procedimiento futuro, únicamente después de aprobación explícita:

1. Crear Supabase Beta y verificar su referencia en consola, distinta de Production.
2. Probar esta cadena sobre un Supabase local vacío compatible; ejecutar suites SQL M1.
3. Revisar extensiones, funciones, triggers, RLS, grants y diff; aprobar manifest final.
4. Configurar un servicio libpq `cometa_pos_beta` fuera de Git, con host TLS verificado
   y credenciales Beta en archivo protegido/gestor; nunca contraseña en argumentos.
5. Comprobar que host y usuario pooler corresponden al ref Beta aprobado. El parámetro
   SQL de ref es una confirmación humana, **no prueba la identidad de la conexión**.
6. Solo entonces: `psql "service=cometa_pos_beta" -X -v ON_ERROR_STOP=1 -v approved_beta_ref=REF_APROBADA -f apps/pos-mobile/artifacts/m2-7b/schema/review-only.sql`.
7. Comparar historial y ejecutar validaciones dirigidas de terminal, revocación,
   aislamiento, RPC/direct writes denegados y flujo Food con fixtures Beta.

No usar `supabase db push` general ni el enlace local actual, que apunta a Production.

## Auth y deep links

Email/password existente; signup cerrado en Supabase Beta. Configurar SMTP Beta
autorizado, límites Auth y redirects exactos:
`https://pos-beta.cometaos.com/mobile/auth/callback` y `/mobile/auth/recovery`.
No Google Sign-In. PKCE inicia recovery desde esta instalación; un código intercambiable
de un uso es aceptado, nunca access_token/refresh_token en URL, fragmentos ni redirect arbitrario.
El listener maneja arranque frío y caliente; recovery permite establecer contraseña
y luego cerrar la sesión. Links POS solo reservan entrada, no ejecutan operaciones
ni dan acceso por slug. La selección/autorización real permanece dentro del POS.

La sesión Beta usa namespace de vault separado por canal/proyecto. App Links tiene
host placeholder desactivado en debug development y el host reservado en Beta.
Publicar `/.well-known/assetlinks.json` solo cuando se conozca el certificado real;
no existe asociación verificada ni DNS en este bloque. Nunca publicar el certificado debug.

## Versionado y signing

`release.json` centraliza identidad, SDK mínimo, development 1/1.0 y candidato Beta
2/0.1.0-beta.1. `distributionHistoryConfirmed=false` mantiene bloqueada la release
hasta confirmar que no hubo artefactos externos con código >=2. La evidencia local
es el APK debug código 1; el historial de Play/distribuciones privadas requiere dueño.

Gradle consume el canal `COMETA_POS_CHANNEL` y exige, para release Beta, confirmación
de versionado, stamp web Beta coincidente y los cuatro valores de firma externos:
`COMETA_POS_KEYSTORE_PATH`, `COMETA_POS_KEY_ALIAS`,
`COMETA_POS_KEYSTORE_PASSWORD`, `COMETA_POS_KEY_PASSWORD`.
No imprimirlos ni usar `-Ppassword=...`. El keystore debe quedar fuera del repo.
No existe fallback release a debug signing. Production permanece bloqueado.

Procedimiento futuro de custodia:

1. Crear app-signing key corporativa, no una clave Beta desechable; `keytool -genkeypair`
   en equipo controlado, RSA 4096 y vigencia larga, contraseñas interactivas o gestor.
2. Guardar alias y contraseñas en gestor separado del keystore.
3. Dos respaldos cifrados, separados físicamente, custodios autorizados; probar recuperación.
4. Exportar certificado público y registrar SHA-256 con keytool/apksigner.
5. Firmar todas las actualizaciones directas con esta identidad y versionCode creciente.
6. Play App Signing futuro: aportar la misma app-signing key mediante proceso seguro
   de Google; crear una upload key distinta para AAB. La upload key no firma el APK final.

La transición debug a release exige desinstalar debug y reenrolar. La transición
Beta a Store compatible conserva package/firma, pero requiere nueva sesión y
separación de datos: no migrar tokens/terminales Beta a Production. Verificar claves
y códigos antes de elegir certificados Play. No se generó ninguna clave.

## Metadata, descarga y hosting

`updates.ts` valida identidad, canal, versión/código, mínimo compatible, URL HTTPS
inmutable, SHA-256, bytes y fecha UTC. Consulta Beta al montar/reanudar, con frecuencia
limitada; error/metadata corrupta no bloquea POS. El aviso abre el navegador para
confirmación de instalación; no hay permiso de auto-instalación. La versión mínima
se informa; cualquier bloqueo de APIs incompatibles deberá acordarse con backend.

`/android` contiene versión/fecha/tamaño/hash cuando hay metadata, Android mínimo,
instrucciones, aviso Beta, acceso limitado y soporte del piloto. Sin release válida
la descarga queda deshabilitada. `/mobile/releases/latest` devuelve 503/no-store
hasta publicar metadata autorizada. Estas rutas no se habilitan en Production.
QR: reservar URL de página estable; generación local pendiente de aprobación de
dependencia QR, sin proveedor remoto ni imagen QR inventada.

Storage propuesto: objeto público inmutable, subida autenticada solo por CI/operador.
Ruta exacta `/android/beta/{versionCode}/cometa-pos-{versionName}.apk`; Content-Type
application/vnd.android.package-archive, Content-Disposition attachment, caché
immutable del binario; metadata no-store. No servir el APK por función Next.
Configurar origen del storage en download-origins.json antes de aceptar metadata.
`scripts/release-record.mjs` prepara registro local (hash, tamaño, fecha build,
certificado verificado, snapshot fuente, compatibilidad backend); no sube ni firma.
Registrar fecha publicación real solo al aprobar distribución, no durante dry-run.

## Validaciones y límites

Ejecutar `npm test`, `npm run build:development`, `node scripts/beta-dry-run.mjs`
en mobile; TypeScript root y suite M1 desde raíz. Scanner automático en cada build;
incluye firmas de secretos, JWT no anon, DB URLs, nombres privados, secretos presentes
en entorno CI y endpoints Production prohibidos. Es un control de patrones, no una
demostración de ausencia de toda cadena secreta posible. Escanear también APK final,
manifest fusionado y firma antes de publicación. Ninguna build Production se ejecuta.

No se certifica conectividad Beta, correo/recovery remoto, App Links verificados,
instalación release, actualización real ni schema limpio mientras no existan los
recursos y autorizaciones externos. M2.6 físico aprobado no se reabre.

## External action checklist — detenerse aquí

- Confirmar historial versionCode y aprobar reserva de código 2.
- Aprobar dependencia QR o proporcionar recurso QR verificado.
- Crear Supabase Beta independiente: ref, región, plan, backup y presupuesto.
- Crear Vercel Beta independiente, sin secretos/integraciones Production ni crons.
- Aprobar y configurar DNS pos-beta.cometaos.com y TLS.
- Registrar destinos públicos exactos y storage permitido; configurar variables privadas solo servidor.
- Aprobar manifest SQL revisado, certificar cadena local y autorizar ejecución dirigida en Beta.
- Configurar Auth/SMTP/redirects/límites; autorizar cuentas, negocios, sucursales y operadores piloto.
- Generar/custodiar app-signing key, respaldar y probar recuperación; confirmar certificado.
- Desplegar backend Beta y verificar aislamiento, revocación, límites y endpoints desde Internet.
- Construir/sync/release Beta, escanear APK y probar instalación/actualización sobre hardware real.
- Crear storage y subir APK inmutable aprobado; verificar tamaño/hash al descargarlo.
- Publicar metadata real y assetlinks; validar certificado y enlaces.
- Habilitar página/QR y autorizar distribución a pilotos.

Ninguno de esos pasos externos se ejecutó.
