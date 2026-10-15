# M4 — Catálogo público MAGENTA

Implementación local en `apps/magenta-storefront`, rama `feature/comu-v1`, HEAD `e11383a1864aee98736834a8ca8c4bb7c7cb7bca`. Sin staging, commit, deploy ni aplicación de migraciones a bases existentes.

## Ruta y presentación

`/catalogo` reutiliza el marco, navegación, paleta, tipografía y pie de M3. La home conserva su composición. Se inspeccionaron `templates/collection.json`, `sections/main-collection.liquid`, `snippets/product-card.liquid`, `snippets/swatch-visual.liquid`, estilos de colección/tarjetas y configuración del ZIP v0.6.

Incluye encabezado editorial con descripción/banner opcional; categorías reales; búsqueda por nombre y detalles públicos; filtros de categoría/color/talla/precio/disponibilidad; novedades/precio/nombre; contador; chips y limpieza individual/general; paginación; estados vacío/carga/error. Sidebar en escritorio y diálogo modal nativo con nombre accesible, cierre y Escape en teléfono. Diseño probado a 1440, 820 y 390 px.

La URL conserva `q`, `category`, `color`, `size`, `min`, `max`, `available`, `sort`, `page`. Formularios GET y enlaces nativos realizan navegación de documento con lectura server-side. No hay fetch cliente/debounce ni estado de resultados que permita que una respuesta antigua sobrescriba otra nueva. Se verificaron recarga y navegación atrás. Al cambiar filtros/búsqueda/orden se reinicia página; al paginar se conservan filtros. Un número de página fuera de rango produce estado vacío con acceso a limpiar filtros.

## Lectura pública y fuentes

Nueva RPC `brand_storefront_catalog_m4`, concedida a anon/authenticated/service_role. Usa `brand_storefront_home_m3` para habilitación/publicación de Apariencia y `brand_storefront_cards_m3` como autoridad de elegibilidad A1/M1/M2. La marca permanece fijada por la variable server-only `STOREFRONT_BRAND_SLUG`; parámetros de navegador no la reemplazan. Se mantiene cliente anon y `no-store`, sin service-role en la aplicación pública.

- Productos, fechas, precios, variantes y categorías: POS actual. Categorías activas de la misma marca con productos públicos; navegación plana, sin categorías duplicadas ni inventadas.
- Descripción buscable: títulos/contenido de desplegables **habilitados de M2 publicado**. No se consulta `pos_products.description`, borradores ni notas administrativas para buscar.
- Color: grupo publicado M2 y UUIDs explícitos de variantes. Talla: atributo existente `size`, o `talla` cuando `size` falta; no se adivina desde nombre/SKU. Atributos distintos no se presentan como talla.
- Color, talla, precio y disponibilidad se combinan dentro de un único `EXISTS` sobre **la misma variante activa**.
- Disponibilidad: mismo criterio booleano de M3, existencia de una fila de inventario de esa variante/marca con `quantity - reserved_quantity > 0`. **No se introdujo una suma entre sucursales** ni una reserva nueva. Es presentación, no promesa de checkout/sucursal.
- Stock cero permanece publicado. Solo disponibles excluye productos sin una variante que satisfaga simultáneamente los filtros y tenga disponibilidad.
- Novedades usa `pos_products.created_at`, sin inventar una etiqueta comercial. Orden estable con UUID como desempate. Precio ordena por mínimo del producto; una moneda no resuelta no se presenta como precio público.
- Resultados y total se filtran y paginan dentro de PostgreSQL. Opciones y sus conteos representan el **catálogo público completo de esa marca**, no conteos disyuntivos recalculados por cada combinación. Ninguna opción incluye productos privados o de otra marca.

El backend materializa la elegibilidad M3 dentro de SQL antes de filtrar; al navegador llega solo la página y las opciones públicas. No se certificó rendimiento con catálogos masivos ni planes de ejecución de producción.

## Tarjetas

Fotografías ordenadas del color M2 seleccionado, círculos de tono o tela, estado neutral cuando no existe tono y placeholder si ese color no tiene fotos. No hay fallback hacia otro color. La segunda imagen procede del mismo array de fotos; en touch no se activa hover. El contenedor de fotografía cambia de identidad con el color para no conservar la imagen anterior mientras carga otra.

El precio y Agotado se actualizan según el grupo seleccionado. Se muestra Desde si sus variantes activas tienen precios distintos; sin color configurado se usa el rango del producto. La selección de color explícita en el filtro inicializa la tarjeta. No hay descuentos, reseñas, popularidad, compra rápida, favoritos ni enlaces de ficha pública ficticios.

## Apariencia

Se añadió un panel Catálogo público al editor existente. Configura título, descripción, banner por infraestructura de medios M2, columnas 2–5, proporción 3:4/1:1/2:3, segunda imagen, círculos de color, filtros visibles, orden predeterminado y 8/12/16/24/32/48 productos por página.

La configuración vive en `catalog` dentro del documento existente de Apariencia. Documentos M3 sin esa propiedad conservan su forma y usan defaults de catálogo al leer; no hay backfill. El parser mantiene todas las secciones de home y valida el bloque nuevo. Se utiliza la misma RPC M3, permiso owner/admin/global activo, borrador/publicación y CAS. Guardar no habilita A1 ni cambia M1/M2.

Migración aditiva `supabase/migrations/20261011120000_storefront_catalog_m4.sql`: RPC pública y trigger de validación del bloque de Catálogo/banner sobre la tabla existente. No modifica SQL histórico ni crea catálogo, inventario o categorías alternativos. El banner debe ser un objeto de Storage del namespace web de la marca, incluso si alguien omite el frontend. Suspender A1 devuelve catálogo no disponible y conserva documentos.

Se permite `/catalogo` en los enlaces de Apariencia para añadirlo a la navegación sin código. No se agrega automáticamente a la home aprobada. La preview M3 de home permanece igual; este bloque añade controles de configuración del catálogo y su ruta pública.

## Pruebas

| Comprobación | Resultado / frontera |
|---|---|
| PostgreSQL M4 | PASS: filtros de misma variante, reservas, agotados, M2 publicado, precios, categorías, conteos públicos, orden estable/paginación, borrador/publicación, CAS/banner, aislamiento y suspensión |
| HTTP SSR M4 | PASS: página y renderer reales con SQL anónimo real; Supabase transport inyectado, sin PostgREST real. Marca configurada no reemplazable por query, filtros, vacío, paginación y ausencia de información privada |
| Contrato Node | PASS: URL round-trip, limpieza individual, valores inválidos, defaults, medios por marca y límites |
| Navegador | PASS: React real, fixtures/transporte simulados, cambio de foto/color/precio, placeholder, hover del mismo grupo, URL/recarga/atrás/paginación, diálogo/Escape y ausencia de overflow |
| Regresión M3 | PASS SQL + HTTP de Apariencia/home, permisos, CAS, publicación, retención y ausencia de cambios de inventario. Harness de contrato actualizado únicamente para cargar la nueva dependencia de configuración |
| TypeScript raíz | PASS `--noEmit --incremental false --pretty false` |
| Build independiente | PASS; rutas `/` y `/catalogo` dinámicas |
| ESLint dirigido | 0 errores; 5 warnings por imágenes estándar (1 ya existente en home) |
| Diff check | PASS; índice sin cambios |

Comandos:

```text
node scripts/test-storefront-m4-local.mjs
node scripts/test-storefront-m4-contract.mjs
node scripts/test-storefront-m4-ui.mjs
node scripts/test-storefront-m3-local.mjs
node scripts/test-storefront-m3-contract.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node node_modules/next/dist/bin/next build apps/magenta-storefront --webpack
```

El runner M4 crea exclusivamente `cometa_m4_<timestamp>` tras verificar Docker Supabase local/54322, copia solo esquema y aplica A1/M1/M2/M3/M4 literalmente como archivos en esa base. Fixtures y escrituras se realizan allí, luego se elimina la base. No aplica migraciones ni registra historial en `postgres` principal.

Certificación final SQL/HTTP M4: `cometa_m4_1791685967357`, eliminada. Regresión M3: `cometa_m3_1791685716634`, eliminada. Se comprobó adicionalmente que una variante privada activa con M2 publicado no aporta resultados, colores, tallas ni categorías mientras M1 no la publique, y que retirar M1 la elimina inmediatamente de todos esos conjuntos.

En pruebas preliminares se corrigieron dos problemas del harness: una aserción buscaba fotos en cualquier tarjeta en vez de la primera; y un fixture privado heredaba una autorreferencia de producto que M2 rechazó correctamente. No se relajaron reglas de producción para satisfacerlos.

## Evidencia

- `docs/evidence/m4/catalog-desktop.png`
- `docs/evidence/m4/catalog-desktop-color.png`
- `docs/evidence/m4/catalog-phone.png`
- `docs/evidence/m4/catalog-phone-filters.png`
- `docs/evidence/m4/catalog-phone-color.png`

Capturas reales del componente en Chrome headless, **con productos/datos/transporte simulados**, identificados en pantalla. Fotos del ZIP: `campaign-demo.png` copiada sin transformación a evidencia M4 y recurso look ya disponible en evidencia M2. No se publicaron como productos reales. No representan una sesión completa POS/Next autenticada ni conexiones comerciales. La fotografía de campaña es horizontal; su recorte vertical y la repetición responden a fixtures, no a datos del catálogo real.

## Archivos y preservación

Modificados únicamente para M4:

- `apps/magenta-storefront/app/layout.tsx`: CSS de catálogo.
- `packages/own-storefront/contract.ts`: bloque opcional Catálogo y enlace `/catalogo`.
- `packages/own-storefront/home.tsx`: contenido hijo opcional para reutilizar el marco sin cambiar la home.
- `src/app/brand/[brandSlug]/pos/online-store/appearance/appearance-editor.tsx`: panel Catálogo.
- `scripts/test-storefront-m3-contract.mjs`: carga real de dependencia nueva en VM.

Nuevos:

- `apps/magenta-storefront/app/catalogo/{page,loading,error}.tsx`
- `packages/own-storefront/{catalog-contract.ts,catalog.tsx,catalog.css}`
- `src/app/brand/[brandSlug]/pos/online-store/appearance/catalog-settings.tsx`
- `supabase/migrations/20261011120000_storefront_catalog_m4.sql`
- `scripts/test-storefront-m4-{contract,http,local,ui}.mjs`
- Este documento y los seis archivos de evidencia M4 indicados.

De los 244 archivos pendientes iniciales, solo los cinco listados recibieron cambios M4 autorizados; los otros 239 conservan SHA-256. Migraciones M0/A1/M1/M2/M3 y trabajo ajeno permanecen intactos. HEAD/rama/índice no cambiaron.

## Límites reales

M4 no está aplicado a la base principal. Falta autorización posterior para una sincronización dirigida y validación con PostgREST/sesión/Storage reales. No se declara tienda operativa ni despliegue. La validación de carga, conectividad y optimización de imágenes a escala sigue pendiente.

Ficha pública, bolsa, compra rápida, favoritos, checkout, cobros y pedidos WhatsApp permanecen fuera de M4. Catálogo no escribe precios, inventario, reservas ni reglas comerciales COMU.
