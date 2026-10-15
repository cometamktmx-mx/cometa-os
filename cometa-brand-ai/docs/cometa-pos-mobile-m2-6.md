# COMETA POS Mobile M2.6

Seguimiento M2.6.1: [diagnóstico ANR y certificación](cometa-pos-mobile-m2-6-1.md). **No certificado:** recorrido phone visual válido, pero timeouts de startup y fallos sistémicos; regresión tablet con wordmark intermitente en capturas GPU host. El informe siguiente conserva el historial y no acredita una solución definitiva.

## Alcance

Onboarding React/CSS y presentación de arranque Android. No cambia Food Operations, Retail, backend Auth, device enrollment, PIN, seguridad M1 ni schema. No hay llamadas Production ni Macca. Sin dependencias nuevas, commit, push o deploy.

## Composición y foundation responsive

`apps/pos-mobile/src/responsive.ts` publica `layoutForViewport` y `usePosLayout`. Usa dimensiones CSS del viewport y eventos resize, nunca user-agent. Solo se consume en onboarding en esta fase; no adapta todavía navegación operativa POS.

| Criterio | Layout |
| --- | --- |
| Lado corto menor que 600 CSS px | phone, incluida rotación |
| Lado corto >= 600 y ancho > alto | tablet-landscape |
| Lado corto >= 600 y ancho <= alto | tablet-portrait |

Landscape usa contenido al 46% y fotografía desde el 40%, con superposición oscura para legibilidad. Portrait coloca fotografía arriba (46dvh) y contenido a continuación. Phone usa fotografía 44dvh, cuatro features prioritarios y acciones inferiores; a alturas <=760 reduce fotografía a 39dvh y a <=650 muestra dos features. Phone landscape tiene composición lateral. No se bloquea orientación. Safe areas usan variables de Capacitor con fallback `env(safe-area-inset-*)`; controles >=44 CSS px. Se respeta reduced motion, hay foco de encabezado y progreso accesible. Tipografía del sistema, sin fonts remotas.

Cuatro narrativas: ecosistema COMETA POS, Food, Retail/moda y omnicanal. Headlines/copy/features aprobados viven en `slides.ts`; fotografías locales intactas en `public/onboarding`. Los overlays son elementos React ilustrativos, no APIs ni screenshots. COMU se declara opcional.

Saltar, Ya tengo una cuenta y CTA final usan la entrada Auth existente. La única persistencia de presentación es `cometa-pos-onboarding-v1=yes`; no otorga acceso. Splash navy con marca existente y texto POS, sin espera artificial. SystemBars usa iconos claros. El logo web es copia exacta de `public/logo.png`, sin inventar una marca nueva.

## Archivos M2.6

Modificados: `apps/pos-mobile/src/App.tsx`, `apps/pos-mobile/capacitor.config.ts`, `apps/pos-mobile/android/app/src/main/res/values/styles.xml`, `apps/pos-mobile/.gitignore`, `apps/pos-mobile/README.md`.

Nuevos:

- `apps/pos-mobile/src/responsive.ts`
- `apps/pos-mobile/src/onboarding/Onboarding.tsx`
- `apps/pos-mobile/src/onboarding/slides.ts`
- `apps/pos-mobile/src/onboarding/onboarding.css`
- `apps/pos-mobile/public/brand/cometa-logo.png`
- `apps/pos-mobile/android/app/src/main/res/drawable/cometa_splash.xml`
- `apps/pos-mobile/tests/onboarding.test.mjs`
- `apps/pos-mobile/scripts/onboarding-android-proof.mjs`
- Este documento.

Derivados ignorados: dist, assets Android sincronizados, build/APK, capturas y métricas en `apps/pos-mobile/artifacts/m2-6`. Logs y AVD de prueba aislado en `.next/m2-6`; no se modificó el AVD original del usuario. Las fotografías aprobadas no se editaron; sus cuatro SHA256 coinciden con el inventario anterior.

## Verificación

Build mobile (TypeScript + Vite), Capacitor sync y Gradle assembleDebug PASS. Advertencias existentes de directivas use-client y tamaño de chunk, sin errores. APK debug actualizado en `apps/pos-mobile/android/app/build/outputs/apk/debug/app-debug.apk`, ID `com.cometaos.pos`, backend loopback local 3105/58130. Tests dirigidos: 11 PASS, incluyendo vault, transporte, aislamiento, errores 401/403, presentation flag, breakpoints y assets.

Inspección APK: 16,048,649 bytes (15.31 MiB), SHA256 `5A1ED67368B5BA55ACB3EA1E5CF7BBA86CFABD04FA70B0CE80ED55E77823E7D4`. Scan de secretos PASS; una JWT pública anon local, sin claves privadas ni material server-only detectado. `git diff --check` PASS; archivos M2.6 todavía untracked revisados además con `git diff --no-index --check`. Estado completo de Git: `apps/pos-mobile/artifacts/m2-6/git-status-short.txt`.

Prueba visual mediante ADB y CDP del WebView real, no navegador de escritorio. El helper Windows de computer-use no pudo inicializar su kernel; se utilizó el canal Android para capturas nativas. El harness no lee credenciales ni limpia cuentas/PIN; reinicia únicamente el indicador de onboarding para dejar la presentación abierta al finalizar.

Pixel Tablet API36: landscape 1280x744 CSS px y portrait 800x1224, DPR2. Cuatro slides por orientación: PASS sin overflow horizontal/vertical, textos y CTA visibles, targets >=44px, barras del sistema fuera del contenido. Progreso, Saltar, CTA final, entrada Auth y persistencia tras reload: PASS.

Capturas: `apps/pos-mobile/artifacts/m2-6/tablet-landscape-slide-{1,2,3,4}.png` y `tablet-portrait-slide-{1,2,3,4}.png`. Cada orientación incluye `*-metrics.json` y `*-auth-after-skip.png`.

Phone Android API36: perfil Medium Phone 1080x2400, densidad420, DPR2.625, ancho412 CSS px; viewport útil varía con las barras Android (867/891 CSS px observados). Las métricas guardadas reportan cuatro slides sin overflow y navegación/persistencia/entrada Auth PASS. **La certificación nativa phone está incompleta:** al recuperar la sesión se inspeccionó `phone-slide-4.png` y contiene el diálogo Android `COMETA POS isn't responding`. Esto contradice el PASS visual/nativo global del informe inicial; no debe atribuirse solamente al launcher. Las métricas DOM no descartan un ANR ni prueban que la pantalla nativa estuviera utilizable. Capturas conservadas sin modificar en `phone-slide-{1,2,3,4}.png`, `phone-metrics.json`, `phone-auth-after-skip.png`. Fotografía superior, cuatro features, CTA de52px. La causa del ANR requiere diagnóstico y nueva prueba autorizada; no se ha demostrado que proceda del onboarding.

## Límites antes del cierre M2

La revisión estética final corresponde al propietario; se entregan capturas reales. Validación física y diferencias entre fabricantes siguen pendientes. No se implementan recuperación por deep link, alta/trial, Google, impresión, escáner funcional ni otras capacidades M3. El icono de launcher sigue provisional M2.5; este milestone cambia splash y onboarding. iOS no fue compilado ni certificado visualmente. No se repite E2E Food porque su lógica no cambió.

## Recuperación de sesión — 2026-10-02

Se inspeccionó Git antes de escribir. HEAD sigue exactamente en `78a5998d33317e1e91f79b4952a481263eafca42`. M2.6 ya tenía implementación React/CSS, integración en App, responsive, assets, splash, tests, documentación y APK. No se rehízo código. La parte incompleta es la certificación nativa phone: el ANR visible en la captura existente impide sostener el PASS global anterior. La prueba física y aprobación estética siguen pendientes. No se abrió emulador ni Android Studio en esta recuperación.

M1/M2/M2.5 se conservan en código y configuración. Las migraciones M1 no tienen diff. Las certificaciones históricas M1.5/HTTP Food se recuperaron de sus informes; no se repitieron contra base de datos ni se hicieron mutaciones. El archivo APK de la ruta solicitada existía, pero ya correspondía a M2.6 (16,048,649 bytes), no al binario histórico M2.5 (7,523,223 bytes). No se encontró una copia de aquel binario M2.5 bajo `apps/pos-mobile`. Antes de compilar se copió el APK encontrado a `artifacts/m2-6/app-debug-before-recovery.apk`.

Validación ejecutada en esta recuperación:

- `npm.cmd run build`: PASS (TypeScript + Vite development). Advertencias existentes de `use client`, sourcemaps y chunk mayor que 500 kB.
- `node node_modules/@capacitor/cli/bin/capacitor sync android`: PASS. Dentro del sandbox falló dos veces con `uv_os_get_passwd/ENOMEM`; fuera del sandbox pasó. No se atribuye ese error a la app.
- `gradlew.bat assembleDebug --offline --no-daemon --console=plain`: PASS, 1m18s, 213 tareas (24 ejecutadas, 189 up-to-date). El sandbox impidió crear el lock de caché; se ejecutó fuera de él. Advertencias de deprecación Gradle, sin instalar dependencias.
- TypeScript raíz: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: PASS, cero errores.
- `npm.cmd test` en mobile: 11/11 PASS.
- `node --test` sobre `test-pos-mobile-m1.mjs`, `test-pos-food-access-server-v1.mjs`, `test-pos-food-operations-v1.mjs`, `test-pos-food-modifiers-v1.mjs`, `test-pos-food-configurator-v1.mjs`, `test-pos-food-pilot-hardening-v1.mjs`, `test-pos-multirole-cash-v1.mjs`: 62/62 PASS; pruebas locales con dobles, no E2E de base de datos.
- `git diff --check`: PASS. No hubo cambios de código que requirieran lint adicional.
- Los cuatro SHA256 de `public/onboarding` coinciden con `.next/m2-6/assets-before.json` anterior al cierre. No se editaron fotografías.
- Las métricas recuperadas de los cuatro slides registran ausencia de overflow y CTA dentro del viewport: phone 412×867, tablet portrait 800×1224, tablet landscape 1280×744. Inspección de capturas tablet compatible con esas métricas. Esto no sustituye una ejecución nueva ni resuelve el ANR phone.
- Inspección del APK: ID `com.cometaos.pos`, configuración local, sin URL remota de WebView; escaneo de secretos PASS. Tras assembleDebug, los 12 assets web del APK coinciden por SHA256 con `dist`, incluidos los cuatro PNG aprobados.

APK resultante: `apps/pos-mobile/android/app/build/outputs/apk/debug/app-debug.apk`, 16,048,649 bytes / 15.31 MiB. SHA256 `5A1ED67368B5BA55ACB3EA1E5CF7BBA86CFABD04FA70B0CE80ED55E77823E7D4`: idéntico al recuperado porque el código válido ya estaba empaquetado; Gradle conserva los outputs sin cambios. Contiene el onboarding M2.6, no el provisional M2.5.

Único archivo fuente/documental modificado en esta recuperación: `docs/cometa-pos-mobile-m2-6.md`. Un inventario SHA256 de todos los archivos no ignorados antes/después confirmó que los demás, incluidos COMU y POS, no cambiaron. Los derivados del build, copia de APK y logs permanecen ignorados. Evidencia en `apps/pos-mobile/artifacts/m2-6/recovery-{before-hashes.json,before-status.txt,build.log,typescript.log,sync.log,gradle.log,mobile-tests.log,pos-tests.log,diff-warnings.log,apk-verification.json,final-status.txt}`.

Antes de cerrar la certificación: probar en hardware autorizado y diagnosticar cualquier ANR; revisar rotación, safe areas, navegación/CTA y arranque frío. Para login/Food, levantar el fixture local certificado y configurar USB/adb reverse de 3105 y 58130. El indicador `cometa-pos-onboarding-v1=yes` puede omitir onboarding en una instalación actualizada; repetirlo exige un reinicio controlado de ese indicador, sin borrar sesión ni datos. No se instaló el APK ni se modificó ese indicador durante esta recuperación. Sin M3, Production, Macca, migraciones, commit, push, deploy, reset o stash.
