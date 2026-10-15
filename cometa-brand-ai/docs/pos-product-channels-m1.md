# M1 — Catálogo POS y canales

Implementación local del 10 de octubre de 2026. No aplicada a la base principal ni remoto. No publica una tienda ni implementa checkout.

## Autoridades y compatibilidad

- `pos_products` / `pos_product_variants` siguen siendo el catálogo. Inventario, movimientos, precios, reservas y ventas no cambian.
- `pos_products.sellable` ya es elegibilidad GLOBAL usada por POS, Food y COMU. Convertirla en selección física alteraría COMU. Se conserva y se aclara su descripción en el editor.
- `pos_product_sales_channels` es la única selección persistida de canales Retail por producto. Sin fila: física solicitada = true, online = false. No hay backfill ni publicación automática.
- La capacidad comercial sigue exclusivamente en `brand_online_store_access` de A1. Se reutiliza `readOnlineStoreService`; no se agrega otro flag de servicio.
- Online efectiva exige selección, servicio enabled, marca active, producto active/sellable, tipo physical, inventario direct y una variante activa. No exige stock: cantidad cero no elimina la selección.
- COMU conserva listings y reglas independientes. Food no usa este control ni los filtros nuevos. Las asignaciones operativas no conceden permisos.

## Guardado y permisos

El editor Retail contiene dos casillas y un botón **Guardar canales** independiente del guardado de datos/variantes. Para un producto nuevo se guarda primero el producto y se vuelve a abrir para seleccionar canales. La interfaz lo explica; no se afirma atomicidad conjunta con la edición del producto.

La API conserva autenticación, acceso comercial POS y permiso `pos.products.write`. La RPC service-only vuelve a comprobar perfil activo, marca, membresía canónica y producto. Roles owner/admin/manager/inventory pueden modificar física; online requiere owner/admin o administrador global. No se crea membresía ni se habilita el servicio desde el editor.

La RPC bloquea marca/producto y usa revisión esperada. Un conflicto devuelve 409. Todas las validaciones preceden al único upsert: rechazar online no modifica física parcialmente. Un operador de inventario puede preservar la selección online sin cambiarla. Suspender A1 conserva la selección y vuelve falsa la elegibilidad online; un autorizado puede desmarcarla estando suspendida, pero no volver a activarla.

GET/PATCH usan respuestas privadas no-store y no llaman proveedores. Errores de consulta no conceden publicación. Un fallo de lectura A1 produce estado unknown.

## Consumidores

- Administración e inventario conservan el listado sin filtro de canal.
- Caja solicita `channel=physical`. El filtro se aplica antes del rango y count.
- Escáner y búsqueda exacta por SKU rechazan selección física desmarcada en Retail. El escáner del editor usa `surface=administration` y conserva acceso administrativo al producto.
- Food mantiene su comportamiento. No se cambian RPCs de venta/cancelación: una selección de canal no cancela operaciones existentes.
- El contrato anterior de productos permanece igual. Mobile Food conserva sus rutas; no se certificó una aplicación Android real en este bloque.

## Migración

Archivo: `supabase/migrations/20261010180000_pos_product_sales_channels_m1.sql`.

Depende del catálogo POS existente y de `20261010160000_brand_online_store_access_a1.sql`. SHA256 M1 certificado: `4335b7cc91ac7e7559d081cb8126bc5caffc93793ff03834183b3d9e17802e0d`.

El runner comprueba Docker local con puerto PostgreSQL 54322, crea una base distinta desde template0, restaura solamente schema, aplica archivos originales por psql -f y elimina exclusivamente su base. No aplica migraciones ni fixtures al postgres principal.

## Verificaciones ejecutadas

- `node scripts/test-product-channels-m1-local.mjs`: PASS SQL + HTTP sobre `cometa_m1_1791667146885`, eliminada al terminar. Combinaciones, defaults legacy, aislamiento, denegación atómica, concurrencia/revisión, grants, suspensión A1, stock cero, administración, paginación física, SKU/barcode y passthrough Food.
- Comparación SQL exacta antes/después de productos, variantes, inventario, movimientos y publicación COMU: sin cambios.
- `node scripts/test-product-channels-m1-ui.mjs --evidence`: PASS componentes/handlers reales con hooks y transporte simulados; guardado, error/conflicto, permisos, suspensión y estado nuevo/carga.
- `node scripts/test-product-variants-v3a.mjs`: PASS.
- `node scripts/test-comu-product-channel-local.mjs`: PASS.
- `node scripts/test-pos-mobile-m1.mjs`: 13/13 PASS.
- `tsc --noEmit --incremental false --pretty false`: PASS.
- Lint de helper, API, componente y tres pruebas nuevos: PASS.
- Lint de cuatro archivos históricos afectados: 21 errores y 6 warnings preexistentes. Comparación por regla contra HEAD mediante ESLint en memoria: mismos resultados. No se corrigió deuda ajena.

El primer intento SQL pasó y HTTP falló por resolución relativa de imports del harness. Se corrigió exclusivamente el harness y se repitió en otra base desechable.

La frontera HTTP ejecuta handlers reales por loopback y consultas/RPC reales en PostgreSQL. Sesión, contexto comercial POS, transporte Supabase y modo Food se inyectan. No certifica cookies, PostgREST, sesión de navegador ni dispositivo móvil reales.

## Archivos del bloque

Modificados:

- `src/app/api/pos/products/route.ts`
- `src/app/api/pos/product-scan/route.ts`
- `src/app/brand/[brandSlug]/pos/products/page.tsx`
- `src/app/brand/[brandSlug]/pos/register/page.tsx`

Nuevos:

- `src/lib/pos/product-channels.ts`
- `src/app/api/pos/products/[productId]/channels/route.ts`
- `src/app/brand/[brandSlug]/pos/products/product-channels.tsx`
- Migración M1 indicada arriba.
- `scripts/test-product-channels-m1-local.mjs`
- `scripts/test-product-channels-m1-http.mjs`
- `scripts/test-product-channels-m1-ui.mjs`
- Este documento.
- `docs/evidence/m1/product-channels-preview.html`
- `docs/evidence/m1/product-channels-desktop.png`

La captura muestra el componente real renderizado aisladamente con datos sintéticos, no una sesión completa del editor. Integración comprobada en código y harness.

## Límites y pendientes

- Antes de usar el runtime contra una base existente hace falta autorización y aplicación dirigida A1/M1. Sin tabla M1, las consultas de caja fallan de forma cerrada; no se añade fallback que ignore canales.
- El filtro de caja obtiene exclusiones paginadas y las transmite en una condición PostgREST. Catálogos con muchísimos productos excluidos pueden alcanzar límites de tamaño de URL; no hay prueba de carga/PostgREST de ese volumen. Cualquier error se rechaza, no publica productos por omisión.
- La ficha web visual, storefront, checkout y consumidores de nuevas ventas online siguen pendientes. Deben resolver A1 y publicación efectiva antes de aceptar nuevas operaciones; no basta con la selección guardada.
- No se modificaron A1, M0/M0.1, precios, stock ni reglas COMU. Sin staging, commit o deploy.
