# COMETA POS Mobile — M2 local

Cliente React/TypeScript + Capacitor separado de Next.js, con importación directa de la UI Food existente. No es otro POS ni un monorepo nuevo. El backend sigue siendo Next.js/Supabase.

Estado M2.5: **APK DEBUG GENERADO**, pendiente de instalación autorizada y prueba física. Identidad estable: `com.cometaos.pos`, nombre `COMETA POS`; no cambiar sin autorización. Véase [entrega M2.5](../../docs/cometa-pos-mobile-m2-5.md). El [informe M2](../../docs/cometa-pos-mobile-m2.md) conserva el estado histórico previo al proyecto Android.

## Desarrollo local reproducible

La base certificada M1.5 es `food_integration_20261002183632530` dentro del Supabase Docker local. La base local predeterminada `postgres` no es equivalente y no tiene las migraciones M1. El siguiente harness exige una base de fixture explícita, crea datos sintéticos allí y usa imágenes Docker existentes, sin descargar imágenes, migrar ni contactar Production:

```powershell
# Desde la raíz del repositorio. Usa una contraseña exclusiva para este fixture.
$env:POS_M2_FIXTURE_PASSWORD = '<contraseña de prueba>'
node scripts/test-pos-mobile-m2-http-local.mjs --database=food_integration_20261002183632530 --serve
```

Ejecuta primero la prueba HTTP y después inicia Vite en `http://127.0.0.1:5173`. Imprime la cuenta sintética, negocio y PIN; la contraseña no se imprime. Pasa a Vite únicamente configuración pública local. Ctrl+C detiene los servicios de esta ejecución. Los fixtures permanecen en la base aislada. Requiere Docker Desktop y dependencias ya instaladas en raíz y app.

Sin `--serve` ejecuta solamente la certificación HTTP. El harness sirve un archivo aislado del commit M1 con una lista explícita de adaptadores M2; no levanta los cambios pendientes de COMU/Finance.

```powershell
cd apps/pos-mobile
npm.cmd run build
npm.cmd test
```

Para desarrollo manual, copia `.env.example` a `.env.local` y configura únicamente URL backend local, URL Supabase local y anon key del mismo fixture. Sin esta configuración, la compilación muestra el shell pero no puede autenticar. Nunca uses service-role en variables `VITE_*`. El backend exige `POS_MOBILE_ENABLED=true` y Supabase de loopback; la app rechaza destinos públicos.

## Android debug

Proyecto generado en `android/`. Java efectivo: JBR 25.0.3 de Android Studio. Wrapper fijado en Gradle 9.1.0 con checksum oficial para admitir Java 25; AGP 8.13.0. SDK/target 36, mínimo Android 7/API 24. Sin Gradle global ni otro JDK.

```powershell
cd apps/pos-mobile
node scripts/configure-local-debug.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android-debug.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/inspect-debug-apk.ps1
```

El configurador lee exclusivamente Docker local y guarda URLs loopback y una JWT pública `anon` en `.env.development.local` ignorado por Git. No guarda ni imprime la clave de firma. El fixture `--serve` usa la misma clave del proveedor local para que la configuración pública del APK sobreviva a reinicios; pruebas HTTP sin `--serve` siguen usando claves efímeras. Si se reemplaza la instalación Supabase local o vence la anon key, regenerar configuración y APK.

`npm run build` selecciona explícitamente el perfil development. Los perfiles beta y production están bloqueados. El script de build configura JAVA_HOME/ANDROID_HOME/ANDROID_SDK_ROOT solamente en el proceso y los restaura; no modifica PATH global. APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Firma exclusivamente Android Debug. Cleartext habilitado solo en debug; backup deshabilitado. Gradle instaló Build-Tools 35 para módulos del plugin usando las licencias ya aceptadas; la app usa Build-Tools 36.0.0.

La tablet usa USB y `adb reverse` para 3105 y 58130; loopback de la tablet se redirige a Windows. Mantener activo el fixture `--serve` de la sección anterior. No exponer servicios por LAN. Antes de instalar, ejecutar `adb devices -l`, verificar modelo/serial y obtener autorización explícita. No hay dispositivos conectados en la comprobación M2.5.

Tras autorización, con adb de `C:\Users\jesus\AppData\Local\Android\Sdk\platform-tools`:

```powershell
adb -s <serial-confirmado> reverse tcp:3105 tcp:3105
adb -s <serial-confirmado> reverse tcp:58130 tcp:58130
adb -s <serial-confirmado> install -r android/app/build/outputs/apk/debug/app-debug.apk
```

El APK no inicia servidores Windows: sin el fixture y el túnel USB no habrá login/operación. El icono y splash nativos copian `public/logo.png` sin modificarlo; assets provisionales que requieren composición/legibilidad final para Store Release. El splash React posterior muestra COMETA POS.

iOS requiere macOS/Xcode, resolución SPM, configuración de firma y verificación de Keychain/red local. M2.5 no genera ni compila iOS. Deep links y comprobación de pantalla completa permanecen pendientes.

## Sesión y límites

### Onboarding M2.6

Presentación compartida en `src/onboarding/`, con fotografías locales intactas y UI React/CSS. `src/responsive.ts` distingue phone (lado corto <600 CSS px), tablet portrait y tablet landscape según viewport y resize, sin user-agent. No cambia navegación operativa. Los detalles, inventario y evidencia visual están en `../../docs/cometa-pos-mobile-m2-6.md`.

Prueba dirigida sobre un emulador con el APK debug abierto: `node scripts/onboarding-android-proof.mjs emulator-5554 tablet-landscape` (usar el serial y orientación reales). Captura cuatro slides, comprueba overflow, controles, progreso, entrada Auth y persistencia tras reload. Reinicia únicamente el flag local de onboarding, sin tocar credenciales; las capturas y métricas quedan en `artifacts/m2-6/`, ignorado por Git.

- Host Supabase y credencial de terminal: vault nativo mediante `@capgo/capacitor-native-biometric` (API de datos, sin solicitar biometría). Keychain/Keystore; nunca refresh token en localStorage/IndexedDB. En navegador de desarrollo se usa memoria, por lo que un reload exige login.
- Operador: token exclusivamente en memoria; PIN nunca persistido. Suspensión, cambio de operador y arranque frío bloquean sesiones operativas del dispositivo en backend y vuelven al PIN. La cuenta anfitriona se conserva mientras sea válida.
- CapacitorHttp transporta Bearer y credenciales explícitas a la allowlist `/api/pos/mobile/*`. Las reglas de Food, dinero, permisos y atribución siguen en los handlers/RPC existentes.
- `PosFoodOperations`, modificadores, recibos y estilos POS se importan del repositorio. Solo se adapta fetch y la impresión de navegador se oculta en mobile. No hay impresión nativa M2.
- Online-first: sin outbox nuevo ni cobro optimista; 401/403 no se tratan como offline. La UI operativa queda inerte sin conexión y requiere respuesta del servidor.
- Crear negocio y recuperación móvil muestran un aviso. No hay alta/trial ni deep link de recuperación implementado. No se cambia recuperación web existente.

Referencias de dependencias: [entorno Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup), [CapacitorHttp](https://capacitorjs.com/docs/apis/http), [plugin Capgo](https://github.com/Cap-go/capacitor-native-biometric). El plugin se eligió por soporte Capacitor 8 y API de almacenamiento seguro Android/iOS mantenida; su integración nativa debe validarse en hardware, las pruebas locales usan un doble de esa API.
