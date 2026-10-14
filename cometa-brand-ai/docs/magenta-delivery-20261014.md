# Magenta — preparación Windows, 14 octubre 2026

## Reanudación tras reinicio — 14 octubre 2026

Esta sección sustituye el estado de bloqueo Docker del checkpoint inferior. La instrucción vigente autoriza cambios, commits, push y Preview, pero exige confirmar antes del despliegue un backend accesible y exclusivo de pruebas, pagos test y migraciones. No autoriza merge ni producción. **La entrega completa sigue pendiente.**

### Docker y aislamiento verificados

- Engine 29.7.2 / Docker Desktop 4.88.1 responde por el named pipe local. El CLI no está en PATH; el sandbox denegó el pipe con EPERM y la consulta posterior con permiso elevado tuvo éxito.
- Inventario: 30 contenedores: 10 running, 19 exited y 1 restarting. Los 18 `food_cert_auth_*` / `food_cert_rest_*` están detenidos. En el conjunto `supabase_*_zhtagqrzyovsrmsicaot`, db, studio, pg_meta, storage, rest, realtime, inbucket, auth, kong y analytics están activos; edge_runtime detenido y vector reiniciándose. No se modificó su estado.
- Tres volúmenes existentes conservados: `supabase_db_zhtagqrzyovsrmsicaot`, `supabase_edge_runtime_zhtagqrzyovsrmsicaot`, `supabase_storage_zhtagqrzyovsrmsicaot`. Sin reset, prune, eliminación de contenedores ni reutilización de datos operativos.
- Aislamiento mediante bases nuevas dentro del PostgreSQL local existente; **no es otro cluster ni un backend para Vercel**. Solo se leyó el esquema public/auth/storage de `postgres`, sin copiar sus filas. Las migraciones y fixtures sintéticos se aplicaron exclusivamente a las bases temporales.
- Bases de esta ejecución, todas eliminadas por su runner con `dropdb` sin FORCE: `cometa_eleventa_1791990363126`, `cometa_eleventa_1791990449525`, `cometa_eleventa_1791990522769`, `cometa_m6_1791990565316`.

### Resultados nuevos y reproducibles

| Comprobación | Resultado real |
| --- | --- |
| `node scripts/test-pos-eleventa-local.mjs` | PASS PostgreSQL: persistencia, códigos con ceros, duplicados, mismo archivo con clave nueva rechazado, replay, dos solicitudes concurrentes con misma clave, payload alterado rechazado, aislamiento de marca, campos omitidos conservados, inventario absoluto, reservas, preview obsoleto, rollback, reversión y bloqueo tras actividad posterior, denegación de roles |
| Alta `20261014140000_pos_product_delivery_save.sql`, dentro del mismo runner ampliado | PASS: alta/reintentos concurrentes devuelven el mismo producto y una sola existencia inicial; cambio de payload/canales rechazado; actor/marca ajenos rechazados; alta inválida no deja recibo; intención de canales persistida |
| Dependencias A1/M1 reales en la última ejecución | PASS: tienda deshabilitada retorna pendiente con motivo correspondiente; tienda habilitada guarda ambos canales y repite el resultado sin duplicación. La prueba anterior sin dependencias solo comprobaba recuperación ante fallo; no se utiliza como prueba de habilitación |
| `node scripts/test-storefront-m6-local.mjs` | PASS SQL M4/M5/M6, A1/M1/M2 y M0 instalados: configuración/envío fail-closed, snapshots de precio, replay con stock cero, pagos duplicados, cancelación/expiración, pago tardío, carreras Retail/COMU/tienda por última unidad, permisos/RLS y suspensión. Cotizaciones/configuración son fixtures; no hubo proveedor Stripe real |
| `node scripts/test-pos-eleventa-api.mjs` | PASS handler con Auth/RPC simulados; distinto de la prueba PostgreSQL |
| `node scripts/test-pos-camera-scanner.mjs` | PASS imágenes sintéticas EAN-13/UPC-A. Cámara, Code 128 físico y permisos de móvil siguen pendientes |
| `node scripts/test-storefront-m{3,4,5,6}-contract.mjs` (cada archivo individualmente) | PASS; proveedores y transporte simulados según cada suite |
| `node scripts/test-comu-buyer-notifications-node.mjs`, `test-comu-orders-o1-presentation-local.mjs`, `test-comu-notifications-n1-node.mjs` | PASS lógica existente de pedidos/notificaciones COMU; cero correos reales. No certifica ni implementa la nueva bandeja/campanita POS para pedidos de tienda propia |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` | PASS, salida 0 |
| `node node_modules/eslint/bin/eslint.js scripts/test-pos-eleventa-local.mjs` | PASS, salida 0 |
| Build webpack de copia storefront sin `.env` | PASS compilación, TypeScript y rutas. Advertencia: 27 archivos de dependencias fuera de outputFileTracingRoot; empaquetado standalone no certificado |
| `git diff --check` | PASS; advertencias LF/CRLF de Git, sin errores de whitespace |

Build reproducido con `node scripts/prepare-magenta-preview.mjs` y `node node_modules/next/dist/bin/next build .next/magenta-preview-preparation/source-1791990675889/storefront/apps/magenta-storefront --webpack`. La copia ignorada contiene 676 archivos, sin secretos ni archivos de entorno; no se desplegó. No se instalaron dependencias.

### Atelier: referencia encontrada y adaptación inicial

Archivo disponible: `referencias-magenta/MAGENTA-Atelier-Shopify-v0.6.zip`, sin el sufijo `(1)`. SHA256: `8c62a787114fd2f86643c72adba56be7472c9514ee50ce9b50ddb64edecc5db7`. Se inspeccionaron su inventario, `assets/atelier-v4.css`, `sections/hero.liquid`, tokens y settings.

Se adaptaron a `packages/own-storefront/home.css` tipografía/espaciado de tarjetas, botones, encabezado, hero, proporción de look, beneficios, FAQ y footer, con reglas responsivas y movimiento reducido. Se mantienen variables de apariencia y overrides existentes del editor; no se copiaron textos comerciales, imágenes demo ni lógica Shopify. **Es una adaptación inicial, no equivalencia visual completa certificada.** No se abrió una vía alternativa de automatización del navegador bloqueado. Revisión desktop/móvil a cargo del usuario: home con/sin imagen, tarjetas vacías/con datos, editor y sus overrides, catálogo/producto/bolsa, footer y foco de teclado.

### Bloques abiertos y publicación

- Se solicitó el prompt original con los criterios de configuración persistente, tarifas/cobertura, WhatsApp, pedidos y campanita: el checkpoint solo conserva una enumeración, insuficiente para fijar las reglas comerciales o ampliar schema. No se inventaron tarifas, canales de notificación ni integración entre pedidos COMU y tienda propia.
- El checkout existente tiene reserva/lifecycle real probado localmente; aún no hay cotizador real ni Stripe test del proveedor certificado. Sigue pendiente el recorrido autenticado y visual.
- Falta nombre/referencia de backend Supabase exclusivo de pruebas accesible desde Vercel, sin datos operativos. No se leyeron claves ni se aplicaron migraciones remotas. Las variables Preview históricas compartidas con producción no sirven como evidencia de aislamiento.
- La autorización de push/Preview sigue vigente, pero no se hace push en esta reanudación: la configuración versionada solo deshabilita despliegues Git de otra rama de backup; no se ha confirmado que el push de delivery no dispare un Preview con el backend anterior. Resolver el gate de despliegue antes de publicar la rama.
- Sin nueva URL Preview, sin merge ni producción. Permanecen pendientes los bloques funcionales anteriores y el producto de captura única completo descrito en el checkpoint.

Archivos modificados en esta reanudación: `scripts/test-pos-eleventa-local.mjs`, `packages/own-storefront/home.css`, `docs/magenta-delivery-20261014.md`. SQL de aplicación, M1–M6 y escáner conservados. `../cometa-hotfix-recovery/` no se toca ni se incluye.

## Checkpoint antes de reiniciar Windows

Rama: `delivery/magenta-20261014`. Checkpoint local de trabajo en curso, **no entrega certificada**. Por instrucción del usuario, no hacer push ni desplegar. El hash se obtiene con `git log -1 --format=%H` después del commit; este informe queda dentro de ese commit.

Esta sección actualiza el estado histórico del importador descrito más abajo:

- Se conserva íntegro el importador ELEVENTA y las correcciones M3/footer. Las migraciones no se ejecutaron en bases remotas.
- Escáner añadido a Nueva venta: cámara trasera preferida, selección alternativa, lector nativo cuando soporta formatos requeridos y fallback ZXing, pausa después de cada lectura, rearmado explícito y liberación de cámara al cerrar. Se conserva entrada manual/lector físico. API busca códigos exactos de variante y, como alternativa, código de producto para elegir variante; escapa comodines de SKU y conserva el filtro de marca/canal.
- Nuevo producto permite seleccionar POS/tienda propia antes del primer guardado, consultando habilitación y permisos en servidor. Se preparó `20261014140000_pos_product_delivery_save.sql`: reutiliza creación canónica, conserva intención de canales, recibo de reintento por marca/actor/payload y resultado pendiente si falla la activación del canal. **Código en curso, SQL sin ejecutar ni certificar.** La creación desde este formulario requiere esa migración; sin ella responde 503. No confundir selección guardada con publicación efectiva.
- Se retiró el borrado físico de la imagen al quitar su asociación de una variante, para preservar fotos compartidas entre tallas. Queda por revisar el borrado de portada y demás referencias compartidas.
- Se corrigieron textos dañados y el mensaje “Product Engine” del editor.
- Se añadió `@zxing/browser` 0.2.1 (MIT), con `@zxing/library` 0.23.0 (Apache-2.0, requiere Node >=24). Se conservan manifest y lockfile para reproducibilidad; no se incluyen dependencias instaladas. La instalación reportó cinco vulnerabilidades altas del árbol total, pendientes de clasificación; no se ejecutó autofix.

### Verificaciones y entorno al pausar

- TypeScript sin emisión: PASS en el último ciclo de implementación. Los últimos cambios posteriores fueron mensajes de error y textos; no se repitió compilación para este checkpoint documental.
- ESLint dirigido: PASS en componente de cámara, opciones de canales, componente de canales y prueba del escáner. No equivale a lint global; el error histórico del script M3 indicado abajo permanece.
- `node scripts/test-pos-camera-scanner.mjs`: PASS con imágenes sintéticas EAN-13/UPC-A. ZXing puede representar EAN-13 que inicia en cero como UPC-A: verificar coincidencia con etiquetas reales y lector nativo. Pendientes Code 128, cámara, permisos, foco y teléfono/tablet.
- Pruebas previas del importador y contratos M3–M6: resultados históricos abajo; no sustituyen PostgreSQL ni comercio real.
- Docker: `docker desktop restart` falló por timeout al detener procesos. Se terminó únicamente la distribución `docker-desktop` y se intentó abrir Docker Desktop de nuevo, sin reset/prune ni borrado de volúmenes. El runner aislado volvió a terminar con `LOCAL PERSISTENCE NOT CERTIFIED: Docker timeout`, antes de crear base.
- Configuración efectiva de desarrollo observada: Supabase apunta a `127.0.0.1`. Las comprobaciones HTTP remotas históricas de abajo **no certifican esta configuración local actual**. Login autenticado pendiente.
- Vercel: proyecto `cometa-os`, raíz `cometa-brand-ai`, rama de producción `main`. Variables Supabase de Preview compartidas con Production según metadatos; no se confirmó backend aislado. Existen proyectos de preview controlada, pero su nombre no certifica aislamiento. No usar el script antiguo `deploy-appearance-release.mjs`, que contiene `--prod`.
- No se identificó un proyecto Supabase exclusivo de pruebas entre los accesibles. Se solicitó nombre/referencia y confirmación de ausencia de datos operativos; no hubo respuesta al pausar. No se solicitaron ni registraron claves.
- No se obtuvo nueva captura: el control de Windows se detuvo al no poder verificar con seguridad la URL del navegador. El intento de iniciar dev en `127.0.0.1:3000` falló con `EACCES`; reintentar con permisos adecuados al retomar. No cambiar credenciales.
- Build, pagos Stripe de test, venta POS real y persistencia siguen pendientes. No hay URL Preview nueva.

### Orden para retomar

1. Revisar rama/status y leer este informe; conservar cambios externos. Comprobar Docker tras reinicio. Ejecutar `node scripts/test-pos-eleventa-local.mjs` únicamente en su base temporal aislada; no resetear ni sembrar datos existentes.
2. Revisar y probar ambas migraciones con PostgreSQL real. El runner actual solo aplica la migración ELEVENTA: ampliar las pruebas para creación/reintento/canales antes de publicar la segunda. Probar aislamiento, concurrencia, rollback, repetición y bloqueo de reversión tras operaciones posteriores.
3. Completar producto de una sola captura: galería/portada ordenable, fotos por color, COMU con sus requisitos, edición y reintentos; canales en importación. El formulario y RPC actuales cubren solo parte del alcance, no COMU ni galería unificada. Revisar recuperación de reintentos cuando el formulario cambia después de una respuesta incierta y estado visible de canales pendientes al reabrir.
4. Obtener ubicación de `MAGENTA-Atelier-Shopify-v0.6(1).zip` (solicitada, pendiente). Adaptar Atelier preservando M1–M6; no sustituirlo por tema genérico.
5. Completar configuración online persistente y aplicada, tarifas/cobertura, checkout/WhatsApp/pagos/reservas, cuenta/pedidos, bandeja POS y avisos persistidos. Estos bloques **no se implementaron en esta iteración**; reutilizar motores existentes.
6. Verificar escáner real y flujos POS/web, TypeScript, lint pertinente, contratos M3–M6, build y capturas reales. ELEVENTA real queda pendiente hasta recibir archivos del cliente; usar solo sintéticos en pruebas.
7. Solo después de nueva instrucción para publicación y verificaciones: confirmar backend exclusivo de pruebas, respaldo y Stripe test; aplicar migraciones allí y preparar Preview. La instrucción actual es **checkpoint local, sin push ni despliegue**.

### Archivos adicionales de este checkpoint

Además de los archivos ELEVENTA/M3 enumerados al final:

- `package.json`, `package-lock.json` (declaración y resolución de ZXing, no dependencias instaladas).
- `src/components/pos-camera-scanner.tsx`.
- `scripts/test-pos-camera-scanner.mjs`.
- `src/app/api/pos/product-scan/route.ts`.
- `src/app/brand/[brandSlug]/pos/register/page.tsx`.
- `src/app/api/pos/products/route.ts`.
- `src/app/api/pos/product-channel-options/route.ts`.
- `src/app/brand/[brandSlug]/pos/products/page.tsx`.
- `src/app/brand/[brandSlug]/pos/products/product-channels.tsx`.
- `supabase/migrations/20261014140000_pos_product_delivery_save.sql`.

Fuera del checkpoint y sin descartar: `../cometa-hotfix-recovery/`; archivos locales ignorados como `.env*`, `node_modules/`, `.next/`, cachés y configuración local de Vercel. No se incorporan secretos ni diagnósticos privados. Los apartados siguientes documentan el primer bloque y sus resultados históricos.

Estado: código del importador preparado localmente; **persistencia y migración todavía no certificadas**. No publicar la migración hasta ejecutar las pruebas PostgreSQL y revisar sus resultados. No hubo despliegues, cambios de datos/esquema remotos, resets, ni uso de datos reales del cliente. Mac, Android e iOS fuera de alcance.

## Implementado

- Configuración → ¿Vienes de otro POS? → ELEVENTA → Productos / Inventario / Clientes.
- SheetJS **0.20.3**, ya instalado: `.xls`, `.xlsx`, CSV UTF-8 y Windows-1252. No se instalaron dependencias ni se cambiaron manifests/lockfiles.
- Selección de hoja y fila de encabezados; alias de encabezados y correspondencia manual por índice, sin plantilla obligatoria. Columnas no seleccionadas no se importan.
- Vista previa con valores, conteos, errores por fila y coincidencias de marca. Decisión explícita crear/actualizar/omitir. Límite: 500 filas, 100 columnas y archivo de 5 MB.
- Códigos textuales y formato numérico de Excel preservados. No se reconstruyen ceros ya perdidos en el origen. Fórmulas mapeadas rechazadas; deben exportarse como valores.
- Precios/costos/existencias no negativos, precisión controlada, contactos validados, duplicados dentro del archivo y coincidencias por código/SKU/barcode o código externo/teléfono/correo para clientes. Teléfonos se comparan sin puntuación, sin inferir país.
- Productos nuevos simples por código: base SKU canónica, unidad pieza explícita en la interfaz; requiere nombre, precio, costo e impuesto explícitos. No se infieren fotos, tallas, colores o mayoreo. Productos con variantes se excluyen de actualización masiva de Productos; Inventario puede localizar una variante inequívoca por SKU/barcode.
- Vacíos/ausentes no sobrescriben valores existentes. Inventario usa `pos_adjust_inventory(..., p_set_absolute=true)`, valida sucursal y reserva disponible. No suma por defecto.
- API reconstruye las filas desde el archivo en cada confirmación. Reutiliza permisos de configuración + dominio, acceso comercial, operador/dispositivo y resolución de marca. RPC adicional restringida a service role, perfil activo, marca activa y owner/admin (o admin global canónico); valida marca e identidad persistida.
- Migración local añade registro, códigos externos de clientes y RPC transaccional. Registro guarda actor, archivo/hash, filas, antes/después, idempotencia y estado/reversión. Reintento con misma clave/payload recupera el resultado; archivo ya aplicado se rechaza con otra clave. Todo el lote se confirma o revierte en una transacción.
- Reversión conserva el historial y añade movimientos compensatorios para inventario. Comprueba actividad posterior mediante snapshots y `xmin` de productos, variantes, inventario, clientes y sus dependencias FK directas. Revalida la sucursal original.
- Footer de Magenta corregido: reutiliza `renderPhoto` en vez de llamar a `photo` fuera de su ámbito. Se conserva el diseño y el trabajo M1–M6.
- Prueba M3 corregida para cargar `section-registry`; incluye regresión del footer con logo.

## Riesgos y límites concretos

- La barrera de reversión es **conservadora a nivel de marca**: puede rechazar una reversión aunque la actividad posterior no afecte directamente a una fila del lote. No intenta fusionar cambios.
- La RPC bloquea temporalmente las tablas involucradas y dependencias FK para evitar carreras con escritores POS existentes. Los locks son de tabla y pueden afectar a otras marcas durante el lote; timeout de espera de 5 s. Falta medir duración/contención en PostgreSQL real antes de publicación. El límite de 500 filas no certifica rendimiento.
- El fingerprint cubre FK directas, no certifica integraciones futuras que guarden referencias sin FK. Revaluar el alcance al añadir nuevas superficies de escritura.
- No hay compatibilidad final ELEVENTA hasta revisar archivos reales. Alias y pruebas actuales usan datos sintéticos. Campos como departamento, mayoreo, crédito y fotos no se deducen ni importan de descripciones.
- La reversión y la repetición del mismo archivo están implementadas y tienen casos preparados, pero **no se ejecutaron contra base de datos** porque Docker no respondió.
- Al faltar la migración, la API informa que el esquema está pendiente y no intenta escrituras alternativas.

## Verificación realizada

- `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: PASS tras corregir el footer; comprobación final repetida después de los cambios.
- `node scripts/test-pos-eleventa-import.mjs`: PASS. Archivos XLS/XLSX/CSV sintéticos, ceros textuales/formateados, alias/manual, campos desconocidos, vacíos, precisión, duplicados e inválidos. Segunda lectura determinista; **no es prueba de persistencia**.
- `node scripts/test-pos-eleventa-api.mjs`: PASS. Ejecuta el módulo real del handler con Auth/RPC simulados: guardas, rechazos, parseo, selección obligatoria, campos ausentes, CSV de Windows, migración ausente y conflictos. **No certifica RLS ni persistencia.**
- `test-storefront-m3-contract.mjs`, `m4`, `m5`, `m6`: PASS. Pruebas de contratos existentes; M5 usa transporte/storage simulados y M6 firmas Stripe sintéticas. No certifican checkout comercial.
- ESLint dirigido a los nuevos archivos TS/TSX y scripts ELEVENTA: PASS. El script M3 conserva un error preexistente `@next/next/no-assign-module-variable` en su variable `module`; no se hizo limpieza general.
- `git diff --check`: PASS; advertencias de conversión LF/CRLF, sin errores de whitespace.
- HTTP local real: `/api/pos/imports?...&kind=products` devuelve **401** sin sesión; la página de importación devuelve **307** al login. Esto no sustituye una prueba autenticada ni de datos.
- Entorno: Node 24.20.0, Next 16.4.0, TypeScript 5.9.3. Usar `npm.cmd` en Windows porque la política de PowerShell bloquea `npm.ps1`.
- Supabase configurado localmente respondió 200 en Auth health y REST, sin revelar secretos ni mutar datos. Login manual/acceso de marca pendiente: `http://localhost:3000/login`.

## Persistencia pendiente y reproducción

Comando preparado: `node scripts/test-pos-eleventa-local.mjs`.

Se intentó ejecutar: **LOCAL PERSISTENCE NOT CERTIFIED: Docker timeout**. Se detuvo antes de crear la base. No se sustituyó esta prueba por HTTP.

El runner solo usa el named pipe local de Docker; exige un contenedor Supabase PostgreSQL publicado en 54322, crea `cometa_eleventa_<timestamp>`, copia **solo esquema** de la base local existente y aplica la migración únicamente a la base nueva. Prepara fixtures `SYNTHETIC` en ella y elimina únicamente esa base al terminar (sin FORCE). No carga `.env` ni credenciales remotas. Requiere el baseline local anterior a esta migración y las extensiones del entorno Supabase.

Casos preparados: persistencia, ceros, dos reintentos concurrentes con misma clave, payload alterado, mismo archivo con nueva clave, ausencia de duplicados, rollback atómico de lote inválido, aislamiento entre dos marcas, precios/costos ausentes preservados, inventario absoluto, reservas, preview obsoleto, reversión y rechazo tras actividad posterior, roles anon/authenticated denegados. **Todos estos casos PostgreSQL siguen pendientes de ejecución.**

También pendientes: prueba end-to-end autenticada y revisión visual página por página. La herramienta de navegador no tiene sesiones y no pudo crear un navegador (`Browser is not available: iab`); no se entregan capturas antiguas como evidencia nueva. No se ejecutó build completo conectado a servicios; sí compilador TypeScript y pruebas locales arriba.

## Archivos de esta tarea

Modificados:

- `packages/own-storefront/home.tsx` (corrección previa conservada).
- `scripts/test-storefront-m3-contract.mjs`.
- `src/app/brand/[brandSlug]/pos/settings/page.tsx`.

Añadidos:

- `src/lib/pos/eleventa-import.ts`.
- `src/app/api/pos/imports/route.ts`.
- `src/app/brand/[brandSlug]/pos/settings/import/page.tsx`.
- `supabase/migrations/20261014120000_pos_imports_v1.sql` (pendiente de publicación y certificación local).
- `scripts/test-pos-eleventa-import.mjs`.
- `scripts/test-pos-eleventa-api.mjs`.
- `scripts/test-pos-eleventa-local.mjs`.
- `docs/evidence/eleventa/SINTETICO-productos.xls`.
- `docs/evidence/eleventa/SINTETICO-productos.xlsx`.
- `docs/evidence/eleventa/SINTETICO-productos.csv`.
- `docs/evidence/eleventa/SINTETICO-clientes.csv`.
- `docs/evidence/eleventa/SINTETICO-invalidos.csv`.
- `docs/evidence/eleventa/SINTETICO-inventario.csv`.
- `docs/magenta-delivery-20261014.md`.

La carpeta externa `../cometa-hotfix-recovery/` se conservó. Sin staging, commits ni push. Los cambios adicionales de interfaz/canales quedan a la espera de la revisión consolidada del usuario.
