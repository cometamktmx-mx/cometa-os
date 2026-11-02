# Desarrollo local en la Mac

Esta es la copia principal de trabajo. Los tres niveles tienen funciones distintas:

| Función | Carpeta absoluta |
| --- | --- |
| Carpeta que debes abrir en VS Code (raíz Git) | `/Users/camiloguerrero/Downloads/supabase-recovery-20261014/cometa-production-20261023` |
| Aplicación Next y comandos de pruebas | `/Users/camiloguerrero/Downloads/supabase-recovery-20261014/cometa-production-20261023/cometa-brand-ai` |
| Carpeta desde la que se ejecuta el comando de arranque de abajo | `/Users/camiloguerrero/Downloads/supabase-recovery-20261014` |

`backup-manifest.json` está en el contenedor de recuperación, un nivel por encima de la raíz Git. Abrir ese contenedor también permite ver los respaldos, pero para el trabajo habitual se recomienda abrir la raíz Git indicada arriba.

## Arranque

Abrir Docker Desktop y esperar a que el motor esté disponible. El lanzador usa los servicios sintéticos existentes `cometa-cash-close-test-db`, `cometa-cash-close-test-auth` y `cometa-cash-close-test-rest`; no los crea ni restaura. Si están detenidos, iniciarlos en Docker Desktop. No ejecutar los scripts de recuperación contra `cometa-recovery-*` para este flujo.

En Terminal, ejecutar exactamente:

```sh
cd /Users/camiloguerrero/Downloads/supabase-recovery-20261014
./recovery-local/node-v24.22.1-darwin-arm64/bin/node ./recovery-local/start-main.mjs
```

El lanzador resuelve sus rutas a partir de su propia ubicación; el `cd` anterior da una única base clara para copiar el comando. No es necesario cambiar de carpeta después. Mantener esa terminal abierta y visitar:

<http://127.0.0.1:55400/login>

`Ctrl+C` detiene Next y el gateway; los contenedores permanecen activos. No iniciar una segunda instancia si los puertos 55400 o 55431 ya están ocupados. Los servicios Auth y REST sintéticos usan respectivamente 55439 y 55438. Usar siempre `127.0.0.1` en este flujo.

El lanzador local `recovery-local/start-main.mjs` vive fuera de esta raíz Git y no forma parte del checkpoint. Debe conservarse junto al entorno de recuperación de esta Mac. Usa Node 24.22.1 y las dependencias ya instaladas, Next en desarrollo con webpack y salida aislada `.next-retail-check`. No instala dependencias ni despliega.

## Configuración privada y aislamiento

Los archivos `.env.cash-close-validation.local` y `.env.cash-close-state.json`, en la raíz Git, contienen configuración y credenciales sintéticas existentes. Están excluidos por `.gitignore`; nunca agregarlos con `git add -f`, copiarlos a documentación ni publicar sus valores. El segundo contiene la cuenta sintética para el login local. No usar credenciales de producción.

El lanzador valida que Supabase sea `http://127.0.0.1:55431`, rechaza archivos `.env*` dentro de la aplicación y transmite únicamente la configuración local necesaria. No carga claves de OpenAI, Stripe, WhatsApp ni firma QZ de producción. Genera JWT sintéticos en memoria usando el secreto local; duran 24 horas, por lo que hay que reiniciar el lanzador cuando caduquen. No cambia contraseñas, permisos ni schema. El login y logout sí generan y revocan sesiones en Auth local.

La base restaurada `cometa-recovery-*` queda fuera de las pruebas. No ejecutar migraciones, resets, seeds ni operaciones de despliegue como parte de este arranque. El gateway solo admite orígenes de navegador locales en el puerto 55400.

## Validaciones

Desde cualquier terminal:

```sh
cd /Users/camiloguerrero/Downloads/supabase-recovery-20261014/cometa-production-20261023/cometa-brand-ai
export PATH="/Users/camiloguerrero/Downloads/supabase-recovery-20261014/recovery-local/node-v24.22.1-darwin-arm64/bin:$PATH"
node scripts/test-pos-retail-terminal.mjs
node --test ../verification/cash-close/verify.cjs
node scripts/test-auth-session-persistence-v1.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
git diff --check
```

Comprobado el 2 de noviembre de 2026: arranque, pantalla de login en Chrome, login por contraseña con la cuenta sintética mediante HTTP, cookies SSR, redirección y HTTP 200 de `/workspace`, contexto autenticado y logout. La prueba de HTTP no automatiza la interacción del formulario en Chrome.

La simulación de terminal ejecuta `cash-close-server` y el renderizador real contra almacenamiento en memoria: original, copia, duplicado, permiso de reimpresión, rechazo de turno abierto y preservación del cierre. Pasaron esa simulación, las 11 pruebas de cierres, el contrato de sesión, TypeScript y whitespace. La impresión física y los diálogos QZ requieren la terminal real; no fueron probados aquí.

ESLint dirigido detecta un error previo `@next/next/no-assign-module-variable` en el helper `load` de `scripts/test-pos-retail-terminal.mjs`. No bloquea las pruebas anteriores y no fue corregido fuera del alcance.
