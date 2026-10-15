# COMETA POS M2.5 — primer APK debug

**COMPLETO para generación del APK. Instalación y prueba física pendientes.**
El bloqueo inicial de tooling fue resuelto por la instalación manual de Android Studio y aceptación de licencias por el usuario.

## Artefacto

- Identidad estable autorizada: `com.cometaos.pos`, nombre `COMETA POS`. No cambiar sin autorización.
- Proyecto: `apps/pos-mobile/android`.
- APK: `D:\COMETA-AI\cometa-brand-ai\apps\pos-mobile\android\app\build\outputs\apk\debug\app-debug.apk`.
- Tamaño: **7,523,223 bytes / 7.17 MiB**.
- SHA-256: `AFCA87CF7678732DBE62F30D22C2715F6E369CB53D35ABADBEC463F41A900D4C`.
- Version code 1, version name 1.0; min SDK 24, target/compile SDK 36.
- Firma Android Debug validada por apksigner, esquema v2. Sin release signing, AAB ni publicación.

## Toolchain efectivo

| Elemento | Resultado |
|---|---|
| JAVA_HOME | `C:\Program Files\Android\Android Studio\jbr` |
| Java | OpenJDK 25.0.3 |
| ANDROID_HOME / ANDROID_SDK_ROOT | `C:\Users\jesus\AppData\Local\Android\Sdk` |
| Gradle | Wrapper local 9.1.0 con checksum oficial |
| Android Gradle Plugin | 8.13.0, conservado del template |
| Build-Tools app | 36.0.0 |
| Build-Tools módulos | Gradle instaló 35.0.0 desde Google, licencia ya aceptada |

No se instaló otro JDK ni Gradle global ni se modificó PATH. Variables configuradas solo por proceso. El script reproducible restaura sus valores previos. Gradle usa su caché normal.

El template traía Gradle 8.14.3; Java 25 requiere 9.1.0 o posterior según la [matriz oficial](https://docs.gradle.org/current/userguide/compatibility.html). Se actualizó solo el Wrapper. Checksum oficial: `a17ddd85a26b6a7f5ddb71ff8b05fc5104c0202c6e64782429790c933686c806`. La compilación real verificó esta combinación con los plugins existentes.

## Backend y perfiles

Bundle **development**: Next `http://127.0.0.1:3105`; Supabase fixture `http://127.0.0.1:58130`. La tablet usará USB + adb reverse para esos puertos. No se expusieron APIs por LAN ni se configuró IP productiva.

Base prevista: `food_integration_20261002183632530`, certificada M1.5. No usar la base local predeterminada sin M1. **El APK no inicia servidores Windows: hay que levantar el fixture antes de autenticar/operar.** No se repitió E2E completo ni se dejó el fixture ejecutándose en M2.5.

Se generó `.env.development.local` ignorado con URLs y una JWT pública `anon`, válida hasta 2027-10-03 UTC. El configurador lee la clave Docker local solo en memoria, sin escribirla ni imprimirla. El harness interactivo `--serve` reutiliza esa clave local para que el APK sobreviva a reinicios del fixture. Tests sin `--serve` conservan claves efímeras. Si se reemplaza Supabase local o vence la anon key, regenerar configuración/APK.

Vite comprueba destinos locales y rol anon. Perfiles beta y production bloqueados explícitamente. Capacitor empaqueta el bundle, sin server.url remoto. Sin Macca ni Production.

## Seguridad y assets

- Backup deshabilitado. Cleartext deshabilitado en manifest principal, habilitado solo en overlay debug.
- Vault M2 intacto. API de datos Capgo usa AES/GCM con AndroidKeyStore, verificado en código de dependencia. No refresh token en localStorage/IndexedDB. Falta prueba real en tablet.
- Permisos APK: INTERNET, ACCESS_NETWORK_STATE, USE_BIOMETRIC y USE_FINGERPRINT heredados del plugin seguro, más receiver AndroidX de nivel signature. No se invoca biometría en M2. Sin Bluetooth, NFC, cámara ni push.
- Escaneo APK: sin archivos .env/keystore/claves privadas ni patrones Stripe/webhook/secrets; una JWT anon, ninguna privilegiada. Siete assets web inspeccionados, sin módulos server-only/variables privadas. Firma debug verificada; clave privada no empaquetada. El escaneo estático no sustituye prueba dinámica.
- Icono/splash copian sin modificar `public/logo.png`; splash React posterior COMETA POS. No se inventó logo ni se modificó el original. Fondo nativo blanco para logo azul; shell posterior oscuro. Assets provisionales: revisar composición/legibilidad/densidades/adaptive icon antes de Store Release.

## Validaciones

- Build web TypeScript + Vite development: PASS.
- Capacitor sync Android: PASS, cuatro plugins.
- Gradle assembleDebug: PASS; primer build 8m37s. Revisión incremental posterior PASS, 213 tareas up-to-date, mismo APK/hash.
- aapt: ID/label/SDK/debuggable correctos. apksigner: firma válida.
- `scripts/inspect-debug-apk.ps1`: PASS para tamaño/hash/configuración/secretos.
- Pruebas mobile: 9/9 PASS; sin suites globales ni E2E Food repetido.
- Lint configuración TS y sintaxis harness: PASS.
- Builds beta/production rechazados: PASS.
- Whitespace / git diff --check del alcance: PASS. Staging vacío.

Warnings no bloqueantes: Vite use-client/chunk >500kB; Gradle flatDir/deprecaciones, parser SDK XML v3 frente v4, Java 8 de la dependencia Capgo bajo JDK25; apksigner native-access. No se ocultaron; build/firma concluyeron correctamente.

## Instalar y probar

`adb devices -l` ejecutado dos veces: **ningún dispositivo conectado**. No se instaló la app.

1. Conectar tablet USB, habilitar depuración y aceptar huella del equipo.
2. Consultar adb devices -l y reportar modelo/serial/estado. Obtener autorización explícita antes de instalar.
3. Levantar fixture según [README](../apps/pos-mobile/README.md), con contraseña sintética elegida por el usuario.
4. Tras autorización, desde apps/pos-mobile y usando adb del SDK:

```powershell
adb -s <serial-confirmado> reverse tcp:3105 tcp:3105
adb -s <serial-confirmado> reverse tcp:58130 tcp:58130
adb -s <serial-confirmado> install -r android/app/build/outputs/apk/debug/app-debug.apk
```

También puede transferirse el APK y abrirlo manualmente aceptando instalación desde esa fuente; el backend sigue requiriendo fixture y túnel USB. Sin ellos el shell abre, pero login/operación no funcionan.

Prueba física pendiente: splash/onboarding, login, enrolamiento/PIN/roles, Food completo, persistencia/refresh, suspensión, revocación, cambio de operador/logout, 401/403 frente offline, teclado y portrait/landscape. No es M3 ni beta Macca.

## Cambios respecto de M2

```text
apps/pos-mobile/capacitor.config.ts
apps/pos-mobile/scripts/prepare-native.mjs
apps/pos-mobile/vite.config.ts
apps/pos-mobile/package.json
apps/pos-mobile/.env.example
apps/pos-mobile/.gitignore
apps/pos-mobile/README.md
scripts/test-pos-mobile-m2-http-local.mjs
docs/cometa-pos-mobile-m2-5.md
```

Nuevos scripts:
```text
apps/pos-mobile/scripts/configure-local-debug.mjs
apps/pos-mobile/scripts/build-android-debug.ps1
apps/pos-mobile/scripts/inspect-debug-apk.ps1
```

Proyecto Android nuevo: inventario exacto a continuación. Ignorados: .env.development.local (solo público), dist/assets copiados, cachés/build/APK/dependencias. No se modificó lógica operativa Food, auth de aplicación ni vault. Cambios previos COMU/Finance/Buyer/Stripe/proxy/dev/supabase/.branches preservados. Sin commit/staging/push/deploy/migraciones remotas/M3.

## Inventario Android

```text
apps/pos-mobile/android/.gitignore
apps/pos-mobile/android/app/.gitignore
apps/pos-mobile/android/app/build.gradle
apps/pos-mobile/android/app/capacitor.build.gradle
apps/pos-mobile/android/app/proguard-rules.pro
apps/pos-mobile/android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java
apps/pos-mobile/android/app/src/debug/AndroidManifest.xml
apps/pos-mobile/android/app/src/main/AndroidManifest.xml
apps/pos-mobile/android/app/src/main/java/com/cometaos/pos/MainActivity.java
apps/pos-mobile/android/app/src/main/res/drawable-land-hdpi/splash.png
apps/pos-mobile/android/app/src/main/res/drawable-land-mdpi/splash.png
apps/pos-mobile/android/app/src/main/res/drawable-land-xhdpi/splash.png
apps/pos-mobile/android/app/src/main/res/drawable-land-xxhdpi/splash.png
apps/pos-mobile/android/app/src/main/res/drawable-land-xxxhdpi/splash.png
apps/pos-mobile/android/app/src/main/res/drawable-port-hdpi/splash.png
apps/pos-mobile/android/app/src/main/res/drawable-port-mdpi/splash.png
apps/pos-mobile/android/app/src/main/res/drawable-port-xhdpi/splash.png
apps/pos-mobile/android/app/src/main/res/drawable-port-xxhdpi/splash.png
apps/pos-mobile/android/app/src/main/res/drawable-port-xxxhdpi/splash.png
apps/pos-mobile/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml
apps/pos-mobile/android/app/src/main/res/drawable/ic_launcher_background.xml
apps/pos-mobile/android/app/src/main/res/drawable/splash.png
apps/pos-mobile/android/app/src/main/res/layout/activity_main.xml
apps/pos-mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
apps/pos-mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
apps/pos-mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png
apps/pos-mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png
apps/pos-mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
apps/pos-mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png
apps/pos-mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png
apps/pos-mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
apps/pos-mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
apps/pos-mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png
apps/pos-mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
apps/pos-mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
apps/pos-mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png
apps/pos-mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
apps/pos-mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
apps/pos-mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png
apps/pos-mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
apps/pos-mobile/android/app/src/main/res/values/ic_launcher_background.xml
apps/pos-mobile/android/app/src/main/res/values/strings.xml
apps/pos-mobile/android/app/src/main/res/values/styles.xml
apps/pos-mobile/android/app/src/main/res/xml/file_paths.xml
apps/pos-mobile/android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java
apps/pos-mobile/android/build.gradle
apps/pos-mobile/android/capacitor.settings.gradle
apps/pos-mobile/android/gradle.properties
apps/pos-mobile/android/gradle/wrapper/gradle-wrapper.jar
apps/pos-mobile/android/gradle/wrapper/gradle-wrapper.properties
apps/pos-mobile/android/gradlew
apps/pos-mobile/android/gradlew.bat
apps/pos-mobile/android/settings.gradle
apps/pos-mobile/android/variables.gradle
```

## git status --short

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
?? docs/cometa-pos-mobile-m2-5.md
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
