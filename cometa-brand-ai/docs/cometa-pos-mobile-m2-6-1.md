# M2.6.1 — diagnóstico ANR y certificación Android

## Alcance y evidencia causal

Se conserva el APK M2.6 y todo el código de aplicación. No se cambian Food, Retail, M1, device foundation, backend, schema, COMU ni Finance. No hay login, escrituras de fixtures, endpoints remotos, Macca, producción, commit, push o deploy. Solo se limpia `com.cometaos.pos` del AVD phone autorizado. Los emuladores se ejecutan uno a la vez, sin Android Studio.

Evidencia local: `apps/pos-mobile/artifacts/m2-6-1/` (ignorada por Git).

El ANR original se recuperó del DropBox persistente del AVD `M26_API36` **antes de limpiar la app**: `historical-anr.txt`. Evento `d1ef57e9-ee7b-4e95-8b81-dfce1ae5a1f5`, PID 6143, 2026-10-03 02:15:33.377 UTC (02-oct, hora México). La aplicación llevaba 82,125 ms ejecutándose; no era simplemente una imagen de error sin diagnóstico.

- Motivo exacto: `Input dispatching timed out`, 5,001 ms esperando `FocusEvent(hasFocus=true)` para `com.cometaos.pos/.MainActivity`.
- Main thread: `pthread_cond_wait` → `future<void>::get` → `RenderProxy::setStopped` → `HardwareRenderer.setStopped` → `ViewRootImpl.performDraw`. Espera síncrona del framework al renderizador, no una llamada de negocio ni un bucle React.
- RenderThread: `pthread_cond_wait` dentro de Trichrome/WebView → `libwebviewchromium_plat_support.so::draw_gl` → `WebViewFunctor::drawGl` → `GLFunctorDrawable::onDraw`. Los frames internos de Trichrome no tienen símbolos; no permiten atribuir el bloqueo a una función interna concreta del driver/Chromium.
- Presión de CPU del guest: `some avg10=92.99`, CPU total 100%, 76% kernel; presión de memoria `some avg10=11.24`, IO `some avg10=20.75`. Main acumulaba 17.54 s esperando CPU frente a 5.41 s ejecutando; estos son contadores acumulados, no duración exclusiva del ANR.
- El mismo registro contiene ANR contemporáneos de GMS, teléfono, teclado y Play Store. En la reproducción nueva hubo ANR de System UI y Pixel Launcher antes del recorrido de COMETA. Están documentados en `repro-logcat.txt`, `repro-lastanr.txt`, `phone-host-failure.png` y sus jerarquías XML.

**Causa inmediata demostrada:** el hilo UI nativo quedó esperando la cadena de renderizado WebView/RenderThread y agotó el plazo de entrada. **Factor ambiental fuertemente respaldado:** saturación global del AVD durante el arranque. No se ha aislado un defecto específico de GPU/driver, ni se afirma que cambiar GPU por sí solo resuelva el problema: hubo un diálogo System UI también al arrancar con GPU host. No hay evidencia para culpar a los PNG, secure storage o una llamada de red. Referencia de interpretación: [diagnóstico ANR oficial de Android](https://developer.android.com/topic/performance/anrs/diagnose-and-fix-anrs).

## Medidas aplicadas

Sin parche especulativo de producción. Se arranca un único AVD, con `-no-snapshot -no-boot-anim -no-window -gpu host`, se comprueba `sys.boot_completed`, se conserva el diagnóstico de los diálogos del sistema y se espera a que el sistema responda. La GPU efectiva queda registrada como AMD Radeon RX Vega 10; el intento inicial `auto` seleccionaba SwiftShader/llvmpipe. No se modifican los archivos de configuración permanentes de los AVD.

Se agrega `apps/pos-mobile/scripts/onboarding-certification.mjs`: entrada Android real mediante `adb shell input tap`, mediciones CDP, jerarquía nativa y screenshots. Rechaza diálogos ANR nativos, comprueba imágenes decodificadas, overflow, targets y progreso; verifica las tres entradas a Auth sin autenticarse. Compara el número de ANR COMETA antes/después y registra tres background/resume y cinco arranques con `force-stop` (no borra datos).

El primer recorrido sin diálogos pasó visualmente, pero tres de sus cinco `am start -W` devolvieron timeout aunque después se vio el onboarding. **Ese PASS del primer harness no certifica startup.** Se añadió un requisito explícito `Status: ok` y se repite startup por separado. Las capturas y resultados originales se conservan para no ocultar esos timeouts.

La primera repetición estricta falló en el cuarto arranque (`phone-startup-failure.txt`, 13,823 ms). CPU del AVD señaló `com.android.vending:background` al 97% (90% kernel); se detuvo temporalmente Play Store con `am force-stop`, sin borrar datos ni deshabilitarlo permanentemente. Esa intervención sola tampoco resolvió el timeout (`phone-isolated-failure.txt`, 13,156 ms). No se atribuye causalidad exclusiva a Play Store. El host tiene Ryzen 7 3700U, 4 cores/8 threads, unos 15 GiB utilizables; en esa medición quedaban 1.36 GiB físicos libres y el proceso emulador ocupaba 4.18 GiB. El guest todavía tenía aproximadamente 1 GiB disponible, por lo que tampoco se afirma un OOM del guest. Se repite con recursos runtime acotados: `-cores 2 -memory 2048 -camera-back none -camera-front none -no-audio`, conservando el viewport 1080×2400/densidad420 y sin alterar la app.

La prueba de recursos acotados (`phone-bounded`) también falló: timeout CDP durante resume y screenshot negro. Logcat registra pause/stop inesperados durante el intento; no se adjudica automáticamente a lógica React ni se presenta como un nuevo ANR COMETA. El DropBox final conserva únicamente el evento histórico de COMETA. Se crea además `M261_Phone_Clean` con avdmanager y la imagen instalada API36 para comprobar un estado completamente nuevo, sin borrar los AVD existentes.

Regresión tablet landscape con GPU host: los cuatro slides, taps/navegación, métricas y ausencia de nuevos ANR COMETA pasaron en `tablet-landscape-result.json`. **La inspección visual no permite un PASS completo:** en slide 2 falta la imagen COMETA del wordmark (POS permanece) y en slide 4 falta el wordmark; slide 1 y 3 sí lo muestran. Todos los assets aparecen cargados en las métricas DOM. Se conservan las capturas tal como salieron. La causa del defecto de composición no está aislada y no se atribuye sin pruebas al driver; no hubo cambios de código entre esas capturas. La tablet mostró también un diálogo System UI al inicio, documentado en `tablet-before.xml`, retirado mediante Wait antes del recorrido.

## Auditoría del startup

- MainActivity es `BridgeActivity` sin trabajo adicional.
- React monta una única raíz, sin StrictMode ni duplicación intencional de efectos.
- Primer arranque: lectura pequeña del flag de presentación y montaje de onboarding mediante `requestAnimationFrame`. No espera login/restauración para mostrar onboarding.
- Supabase se inicializa con el vault asíncrono. La lectura sin sesión responde `isSaved:false`; no hay refresh token de prueba ni login externo. La restauración usa promesas y `await`, no espera síncrona en Java UI.
- Capacitor 8.5.2 despacha plugins mediante `taskHandler.post` sobre `HandlerThread("CapacitorPlugins")`. `isDataSaved` consulta SharedPreferences en esa ruta y resuelve la promesa; no se solicita biometría.
- Network listener/getStatus asíncronos, con fallback. No hay transacción de backend durante onboarding.
- Splash: `launchAutoHide:false`; se llama `hide` al primer frame del estado distinto de splash. No se agregó temporizador, espera de imagen ni demora artificial. Logcat registra hide y las lecturas vault; no hay una excepción app previa que explique el ANR histórico en la evidencia disponible.
- Background bloquea estado operativo y resume revalida según el flag; las pruebas de este milestone son sin cuenta/terminal. No se extiende esa validación a una sesión Food autenticada.

## Assets y render

Originales intactos, sin derivados ni conversión:

| PNG | Dimensiones | Bytes | RGBA decodificado aproximado |
| --- | --- | ---: | ---: |
| 01-ecosystem.png | 1585×992 | 1,498,151 | 6.00 MiB |
| 02-food.png | 1584×993 | 1,903,458 | 6.00 MiB |
| 03-retail.png | 1584×993 | 2,023,342 | 6.00 MiB |
| 04-omnichannel.png | 1584×993 | 1,970,567 | 6.00 MiB |

Se renderiza un `<img>` principal por slide (`key` por imagen), `decoding="async"`, `object-fit:cover`, posiciones específicas y overlays React/CSS. No se usa una segunda copia de la foto como background CSS ni se montan cuatro slides simultáneamente. El navegador puede conservar cachés; 6 MiB es el buffer RGBA teórico de una foto, no toda la memoria del proceso. No hay OOM demostrado. Medición del primer recorrido: proceso app PSS 130,812 KiB / RSS 255,356 KiB, sin incluir automáticamente todo el proceso renderer separado. PerformanceObserver del WebView registró 20 long tasks, máximo 560 ms; no acredita fluidez perfecta, pero no demuestra bloqueo JS de cinco segundos ni atribuye esas tareas a decode.

## Reproducción de las comprobaciones

Desde `apps/pos-mobile`, solo con el emulador correspondiente activo y el APK abierto:

```text
node scripts/onboarding-certification.mjs emulator-5556 phone
node scripts/onboarding-certification.mjs emulator-5556 phone-startup --startup-only
node scripts/onboarding-certification.mjs emulator-5554 tablet-landscape --regression
```

`--startup-only` no vuelve a certificar los slides. `--regression` comprueba los cuatro slides y navegación, sin repetir arranques/resume. El script reinicia únicamente el indicador de onboarding en el WebView; no lee ni borra credenciales. Requiere dispositivo `emulator-*` y servidor CDP de WebView local `https://localhost`.

## Resultado final

**M2.6 NO está certificado para prueba física según el criterio de DONE solicitado. Diagnóstico parcial; sin fix definitivo demostrado.**

El AVD totalmente nuevo llegó a `boot_completed=1` tras un arranque lento (load average 31.51 con 2 vCPU, antes de instalar COMETA). La instalación limpia del mismo APK pasó; el primer lanzamiento devolvió timeout de 11,462 ms. Se desactivó Wi-Fi temporalmente; el intento de desactivar datos móviles devolvió servicio phone no disponible, por lo que no se afirma aislamiento de red total. Su prueba de resume falló por `System UI isn't responding`, demostrado en `phone-clean-resume-1.xml` y `phone-clean-failure.png`. `phone-clean-anr-final.txt` no contiene ANR de la aplicación. Los AVD se detuvieron y se conservan sus datos/evidencia; no quedaron procesos emulator/qemu ejecutándose en la comprobación final.

También se reforzó el harness para esperar el foreground nativo del launcher antes de volver a la app: una espera fija de 1.5 s podía competir con el launcher lento. Por eso el fallo CDP anterior no se considera prueba aislada de una regresión lifecycle de la aplicación. No se ocultan ni borran los resultados fallidos.

| Requisito | Resultado real |
| --- | --- |
| Reproducir un nuevo ANR COMETA | No; sí se recuperó la traza exacta del histórico y se reprodujeron ANR sistémicos |
| Causa raíz | Mecanismo inmediato confirmado (main esperando WebView/RenderThread); causa última de esa espera no aislada. Saturación sistémica demostrada, sin probar un bug concreto de driver/Chromium |
| Phone, cuatro slides portrait | PASS visual y funcional en 412×867, taps nativos, progreso, Saltar, cuenta, CTA final, imágenes, sin overflow |
| Phone, arranques repetidos fiables | FAIL: no se consiguió la secuencia estricta completa sin timeout Android |
| Background/resume | PASS en un recorrido de tres ciclos; FAIL para certificación global porque los intentos posteriores se interrumpieron por timeout/diálogo sistémico |
| Tablet landscape | Métricas y navegación PASS en 1280×744, cero nuevos ANR COMETA; FAIL de revisión visual completa por wordmark intermitente |
| Assets optimizados | No; cuatro originales byte por byte iguales, sin derivados |
| Build/sync/assembleDebug final | No ejecutados en M2.6.1: no se cumplió la condición previa solicitada de phone estable. Los PASS de M2.6 son históricos, no una nueva certificación |
| APK nuevo certificado | No generado; se conserva el APK M2.6 inspeccionado |

APK conservado: `apps/pos-mobile/android/app/build/outputs/apk/debug/app-debug.apk`, ID `com.cometaos.pos`, **16,048,649 bytes / 15.31 MiB**. SHA256 `5A1ED67368B5BA55ACB3EA1E5CF7BBA86CFABD04FA70B0CE80ED55E77823E7D4`. No se presenta ese APK como arreglado ni certificado por esta tarea.

Capturas del recorrido phone válido: `phone-settled-slide-{1,2,3,4}.png`, más las tres entradas a Auth y `phone-settled-resume-{1,2,3}.png`. Capturas tablet: `tablet-landscape-slide-{1,2,3,4}.png`; revisar especialmente wordmark en 2 y 4. Los JSON del harness son evidencia automática parcial; prevalecen las limitaciones descritas aquí y la inspección de screenshots.

Verificación local: `npm.cmd test` mobile **11/11 PASS**; `node --check scripts/onboarding-certification.mjs` PASS; `git -c core.safecrlf=false diff --check` PASS. No hubo cambios TypeScript ni lógica de app: no se repitió compilación raíz, E2E Food ni backend. El inventario SHA256 inicial/final preserva todos los archivos existentes salvo el aviso documental añadido a M2.6. No se modificaron los PNG ni código COMU/M1/POS. `status-final.txt` contiene `git status --short` completo.

Archivos de trabajo nuevos/modificados exclusivamente:

1. `apps/pos-mobile/scripts/onboarding-certification.mjs` — nuevo harness con input nativo, detección de ANR y timeouts.
2. `docs/cometa-pos-mobile-m2-6-1.md` — este informe.
3. `docs/cometa-pos-mobile-m2-6.md` — enlace al resultado de seguimiento, sin borrar el historial.

Para continuar de forma concluyente hace falta una ejecución Android sin ANR de System UI/launcher y una traza de sistema que permita aislar la espera interna de Chromium/renderizador. No se recomienda modificar negocio, quitar autorización, desactivar hardware acceleration de la app ni recomprimir fotos como supuesto arreglo sin ese contraste. Se detiene este milestone sin M2.7 ni cambios remotos.
