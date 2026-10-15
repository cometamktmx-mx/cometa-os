# Cierre ejecutado de Magenta — 14 de octubre de 2026

Candidato de aplicación **`816883d`**. Continuación de `df05a0a`, rama `delivery/magenta-20261014`. Production intacto. Diseño Atelier y configuración aprobados conservados; sin merge, variables live, dominios ni migraciones productivas.

## Acceso y estado

- POS: https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos
- Importador: https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos/settings/import
- Pagos: https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos/online-store?section=payments
- Atelier: https://magenta-controlled-preview-test-delivery-cometa-os-s-projects.vercel.app

Despliegues inmutables verificados READY/Preview:

- Administración: https://cometa-l3tupi14z-cometa-os-s-projects.vercel.app
- Storefront: https://magenta-controlled-preview-hj3ywv2ib-cometa-os-s-projects.vercel.app

Navegación confirmada en Chrome: Sistema → Configuración → **Importar información → ¿Vienes de ELEVENTA?**. Cuatro CSV descargables, con productos/inventario/clientes válidos separados del archivo de errores. Productos primero; inventario después por código y sucursal. Máximo 500 filas/5 MB. No se anuncian ventas históricas, deudas ni apartados.

## Implementación y evidencia

| Área | Resultado real |
|---|---|
| Importador | Acceso por menú y controles visibles; CSV descargables; parser y API pasan ceros iniciales, mapeo, campos ausentes, duplicados, decisiones y permisos. Se conserva la evidencia anterior de persistencia, inventario absoluto, concurrencia y reversión. **Carga completa por navegador pendiente:** la extensión bloquea archivos locales. No se eludió. |
| Producto POS/web | Se encontró y corrigió el requisito inadvertido de publicar una ficha aparte. Elegir Tienda propia al crear publica una ficha inicial mediante la RPC existente; usa autorización de marca y revisión cero, preserva ediciones posteriores y devuelve pendiente explícito si falla. No recrea el producto. Portada/galería usan medios propios; fotos POS antiguas se congelan en el namespace web inmutable. No infiere colores/tallas de descripciones. |
| Alta por interfaz | `CAP-1511-UNICA`, código `00001511`, $80, siete unidades: un solo guardado; producto `212a75bd-248c-4d78-9932-a0d1bdfd0ca6` visible en POS, catálogo y ficha, con la misma variante. Galería implementada; carga real por interfaz pendiente del permiso de Chrome. |
| POS | Código `00001510` buscado por teclado; venta sintética `V-261015-0000002`, $75, una unidad; stock 6 → 5. Se corrigió el paso de cierre que exigía contar antes de mostrar el campo. Cierre por interfaz: esperado $275, contado $275, diferencia $0. Se abrió después otro turno sintético con fondo $100. Cámara/lector físico/impresora requieren prueba manual con el equipo real. |
| Tienda | Catálogo → ficha → bolsa lateral → checkout comprobados con el producto nuevo. Cotización de recolección: productos $80, descuento $0, envío $0, total $80, calculado en servidor. No se abrió otro pago Stripe. |
| Avisos | Aviso del pedido Connect `17D591A9`, folio y “Pago confirmado” visibles, enlace al pedido. Activación por clic cambia a “Desactivar sonido”. Marcar leído reduce contador 4 → 3 y persiste tras recargar. No se acredita sonido físico ni avisos con navegador cerrado. |
| Connect | Se conserva la aprobación del pago directo test anterior, sin repetirlo. Nueva tarjeta bloqueada si no existe cuenta activa de la marca/modo con cobros, depósitos, datos y webhook válidos. Sin fallback silencioso a plataforma. Activación explícita disponible tras onboarding. Estado público de Preview: `mode=test`, `ready=true`. |
| Atelier en live | Composición independiente de `VERCEL_ENV`; demos editoriales solo en Preview test. Live usa medios configurados de la marca y logo aprobado, sin sustituirlos por fotos demo. Contenido real pendiente del titular. Un footer; gigante MAGENTA eliminado. No se declara nueva aprobación visual por build. |
| Configuración | Las siete secciones y sus contratos permanecen. Se reutiliza la evidencia aprobada de guardado/recarga y pesos/centavos. Se ajustan estados/etiquetas de pagos al modo y capacidades reales. |

Los productos de esta tabla son exclusivamente sintéticos en `ephmrsjnpkcgddulvckj`; no se deben copiar a producción. El producto `CAP-1510` creado antes de corregir la publicación conserva su ficha sin publicar; no se alteró retroactivamente.

## Respaldo y recuperación ejecutados

`scripts/rehearse-magenta-recovery.mjs --run` obtiene una conexión temporal oficial mediante `supabase db dump --dry-run`, consulta metadatos en transacciones READ ONLY y guarda privadamente esquema, datos, buckets, manifest y binarios. La conexión directa IPv6 y la contraseña antigua no sirvieron; el mecanismo temporal por pooler resolvió ese acceso sin modificar credenciales productivas.

Ensayo final: **PASS**, 2026-10-15T04:11:32.750Z. Base y Storage v1.73.1 restaurados en contenedores nuevos, red interna exclusiva, sin puertos publicados ni salida externa. Se restauraron propietarios y membresías de roles. Los 26 archivos se colocaron siguiendo el formato oficial FileBackend, con versiones originales y sin reescribir propietarios/metadatos de objetos. **26 descargas HTTP verificadas por SHA-256**. Cinco migraciones pendientes aplicadas a la copia; conteos de marcas/usuarios/inventario/objetos conservados. Contenedores y red temporales retirados por nombre/etiqueta verificados; ninguna instancia o volumen existente reinicializado.

La recuperación conserva los objetos existentes; no usa upsert como sustituto. El intento inicial de reimportación por API encontró incompatibilidad de ON CONFLICT con los índices versionados. No se alteraron índices para forzarlo. La restauración física local y lectura HTTP sí pasaron. Referencia de formato: [FileBackend oficial v1.73.1](https://github.com/supabase/storage/blob/v1.73.1/src/storage/backend/file.ts). Esto acredita recuperación DB/archivos, no una prueba nueva de toda la aplicación contra datos reales ni restauración remota administrada.

Ejecutor: `node scripts/rehearse-magenta-recovery.mjs --run --storage-api`; `--resume` reutiliza el respaldo privado del ensayo, no toma un punto nuevo. Custodia: `.next/release-private-20261011/recovery-1792031701555/`. Resumen sin secretos: `.next/magenta-launch-audit/recovery-result.json`. El respaldo es ensayo, no punto congelado de lanzamiento ni confirmación de PITR. Repetir copia coherente en la ventana aprobada y conservar eventos posteriores para conciliación. Rollback de código no deshace datos/migraciones.

## Producción inspeccionada, no modificada

- Supabase `zhtagqrzyovsrmsicaot`, Cometa BRAND IA, saludable. Marca `magenta-fitwear`, ID `70880b54-b6fe-4775-bb39-c9ff19c47c39`; no confundir con `magenta-fit-wear`.
- Un miembro activo con rol owner; sucursal **Principal**, MXN, una caja, un producto. Confirmar que el correo del titular/Pau corresponda a ese acceso antes de capacitar. No se exportaron identidades al informe.
- Ledger: 81 versiones. Las cinco migraciones del procedimiento conservan exactamente sus hashes. Ninguna nueva migración requerida por estas correcciones. Ensayadas sobre respaldo restaurado; aún no aplicadas a producción.
- `pos-products`: lectura pública, 5 MB, JPEG/PNG/WebP. Escrituras de producto siguen pasando por autorización POS/marca; publicación por administrador. Sin cambios RLS incidentales.
- `pg_cron` ausente en producción. Preparado `supabase/release/install-magenta-expiry.sql`: guard de proyecto/marca/rol, job único `magenta-store-expiry`, cada minuto, ejecuta como service_role la RPC existente. Instalador **no ejecutado** en producción. Evidencia de expiración/idempotencia/no liberación de pagados reutilizada de pruebas aprobadas; verificar dos ejecuciones tras instalación autorizada.
- Administración `cometa-os`, Production en `main`, dominio verificado `app.cometaos.com`. Storefront `magenta-controlled-preview`, URL alojada `magenta-controlled-preview.vercel.app`; dominio Magenta por confirmar. No se cambiaron destinos ni dominios.

## Variables y acciones live pendientes

Auditoría de nombres/alcance, sin descifrar valores: `.next/magenta-launch-audit/release-config.json`. Tener una variable no acredita que su valor sea correcto.

| Aplicación / Production | Presencia observada | Pendiente autorizado solo para lanzamiento |
|---|---|---|
| Administración | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` presentes | Conservar backend confirmado; configurar `OWN_STOREFRONT_URLS` para la marca sin reemplazar otras. |
| Storefront | `STOREFRONT_SUPABASE_URL`, `STOREFRONT_SUPABASE_ANON_KEY`, `STOREFRONT_SUPABASE_SERVICE_ROLE_KEY`, `STOREFRONT_BRAND_SLUG`, `STOREFRONT_ORIGIN` presentes, compartidas Production/Preview | Verificar valores privadamente y separar ámbitos antes de cualquier cambio aprobado. No reutilizar entorno sintético. |
| Ambas, tienda propia | Variables live específicas ausentes en configuración persistida | `STOREFRONT_PAYMENTS_MODE=live`, `STOREFRONT_LIVE_ENABLED=true`, `STOREFRONT_STRIPE_LIVE_SECRET_KEY`, `STOREFRONT_STRIPE_LIVE_CONNECT_WEBHOOK_SECRET`, `STOREFRONT_ADMIN_ORIGIN=https://app.cometaos.com`. No usar claves COMU como sustitución implícita. |

El webhook Connect live debe apuntar al storefront autorizado, `/api/stripe/connect-webhook`, eventos de cuentas conectadas `account.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Confirmar alcance/eventos con el contrato existente al instalar. El receptor administrativo de onboarding no necesita un endpoint nuevo por cada marca; el backend resuelve la cuenta vinculada y el modo. No crear eventos de plataforma como sustitución de Connect.

El titular completará su alta live dentro de Stripe desde Pagos de `magenta-fitwear`; nunca copiar la cuenta test. La tarjeta permanece bloqueada hasta habilitación real. POS, importación y efectivo presencial no dependen de Connect.

## Checks y pendientes para autorización

- TypeScript sin emisión: pasa. Builds de ambas aplicaciones: READY/Preview; targets Production sin cambios. No advertencia standalone en estos logs de Vercel.
- Pruebas dirigidas: parser/API importador; estados Connect/API/onboarding; publicación inicial, protección de revisión y medios propios; navegación de cierre de caja; aislamiento demo/live: pasan. Transporte simulado donde lo indica cada prueba, separado de los recorridos reales anteriores.
- ESLint dirigido: 13 errores preexistentes tanto antes como después (11 en API productos, uno en carga de productos, uno en configuración). Sin errores nuevos; advertencias de imágenes existentes y una de miniaturas de galería. No se hizo limpieza fuera de alcance.
- `git diff --check`: pasa. Archivos ajenos y PNG aprobado sin incluir.

Para cerrar evidencia por interfaz: Chrome → Extensiones → ChatGPT → Detalles → **Permitir acceso a URLs de archivo**, o que el titular ejecute manualmente importación y carga de fotos. Importar productos → inventario → clientes, elegir crear/actualizar, confirmar, recargar, repetir inventario y comprobar cantidad absoluta, revisar historial y reversión. Probar fotos/galería, edición y reintento del alta. No declarar esas comprobaciones completas por HTTP 200.

Para mañana: exportaciones originales ELEVENTA, conteo por sucursal, códigos/variantes explícitos, precios/impuestos, fotos reales, correo/rol de Pau, caja/fondo y dispositivos; datos reales de contacto, entrega, políticas y destinatarios. Titular legal/país y cuenta bancaria se capturan únicamente en Stripe. Confirmar URL alojada o dominio autorizado.

**Aún no se declara LISTO PARA AUTORIZAR PRODUCCIÓN:** quedan las pruebas por interfaz de CSV/fotos bloqueadas por el permiso de Chrome. La recuperación DB/Storage ya pasó. Catálogo real/onboarding del titular son pendientes de negocio distintos. Tampoco se declara tienda lista para aceptar pagos reales.

## Prompt propuesto para la autorización posterior

No ejecutar este texto hasta cerrar las pruebas manuales y recibir aprobación explícita:

> Acepto la prueba de POS/importador y las comprobaciones pendientes de archivos/fotos. Confirma el commit final de delivery/magenta-20261014, cuyo código de aplicación candidato es 816883d, y muestra cualquier diferencia antes de actuar. Tras confirmar ese candidato y la ventana, autorizo su merge y publicación; detente si hay diferencias no revisadas. Ejecuta el procedimiento docs/magenta-production-launch.md únicamente contra zhtagqrzyovsrmsicaot y magenta-fitwear: respaldo coherente DB/Storage con recuperación comprobada, cinco migraciones con hashes registrados, permisos y expiración de esa marca, configuración Production separada de Preview y despliegues al destino confirmado. Conserva otras marcas y dominios. Publica primero POS/importador; mantén la tienda cerrada hasta cargar contenido real y comprobar configuración. Tarjeta bloqueada hasta cuenta Connect live del titular habilitada y webhook confirmado; sin fallback a plataforma ni copia de datos test. Confirma URL, ventana, custodia y destinatario de pagos antes de ejecutar. Ningún cobro real sin autorización adicional de importe y medio.

## Archivos modificados

- `apps/magenta-storefront/app/api/store-settings/route.ts`
- `apps/magenta-storefront/lib/atelier-content.ts`
- `apps/magenta-storefront/lib/atelier-store.tsx`
- `apps/magenta-storefront/lib/checkout-server.ts`
- `apps/magenta-storefront/lib/payment-availability.ts`
- `packages/own-storefront/catalog.tsx`
- `packages/own-storefront/checkout.tsx`
- `packages/own-storefront/operations-contract.ts`
- `packages/own-storefront/product.tsx`
- `public/examples/eleventa/SINTETICO-clientes.csv`
- `public/examples/eleventa/SINTETICO-invalidos.csv`
- `public/examples/eleventa/SINTETICO-inventario.csv`
- `public/examples/eleventa/SINTETICO-productos.csv`
- `scripts/audit-magenta-release-config.mjs`
- `scripts/prepare-magenta-preview.mjs`
- `scripts/rehearse-magenta-recovery.mjs`
- `scripts/test-magenta-release-gates.mjs`
- `scripts/test-pos-cash-close-navigation.mjs`
- `scripts/test-product-initial-web.mjs`
- `scripts/test-store-payment-onboarding.mjs`
- `src/app/api/pos/online-store/operations/route.ts`
- `src/app/api/pos/products/route.ts`
- `src/app/brand/[brandSlug]/pos/cash/page.tsx`
- `src/app/brand/[brandSlug]/pos/online-store/operations.tsx`
- `src/app/brand/[brandSlug]/pos/online-store/payment-onboarding.tsx`
- `src/app/brand/[brandSlug]/pos/products/page.tsx`
- `src/app/brand/[brandSlug]/pos/settings/import/page.tsx`
- `src/app/brand/[brandSlug]/pos/settings/page.tsx`
- `src/lib/pos/product-initial-web.ts`
- `supabase/release/install-magenta-expiry.sql`
- `docs/magenta-closure-20261014.md`
- `docs/magenta-production-launch.md`
