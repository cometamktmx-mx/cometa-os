# M2 — Ficha web Retail

Implementación local. Base: `feature/comu-v1`, HEAD `e11383a1864aee98736834a8ca8c4bb7c7cb7bca`. Sin staging, commit, deploy ni aplicación a bases existentes.

## Referencias revisadas

- `AGENTS.md`, `docs/admin-brand-modules-a1.md`, `docs/pos-product-channels-m1.md`.
- `referencias-magenta/mockup-ficha-web.png`.
- `assets/magenta-editor-v06.txt` leído directamente desde `referencias-magenta/MAGENTA-Atelier-Shopify-v0.6.zip`.

Se conserva la composición edición/vista previa, verde profundo, marfil, tarjetas, títulos editoriales, círculos de color y acento magenta. No se copian Liquid/metafields ni textos comerciales de ejemplo a productos. El contenido por producto no incluye disposición global, posiciones de botones, dominio, pagos o conexiones.

## Integración y autoridades

- Nueva pestaña **Ficha web** dentro del drawer Retail existente. Al abrirla se amplía el drawer; los formularios actuales conservan estado y lógica. Food no muestra la pestaña.
- **Canales de venta** reutiliza exactamente `ProductSalesChannels` M1 y su guardado independiente. Guardar/publicar contenido no modifica los canales.
- Catálogo, atributos, variantes, precios, inventario y moneda siguen en POS. La vista previa lee variantes por UUID, precio actual y disponible (`quantity - reserved_quantity`, sin escribir). La sucursal seleccionada acota la lectura; si no se envía sucursal, se informa el alcance agregado y no se inventa moneda cuando hay varias. Consultas de inventario paginadas y lotes de 50 variantes.
- COMU no se consulta ni modifica para guardar la ficha. No se crean listings.
- `ProductWebPreview` recibe contenido/catálogo/medios como props; no tiene cliente Supabase, checkout ni peticiones de compra. Podrá reutilizarse con un futuro DTO público autorizado. Actualmente es una vista previa administrativa.

## Persistencia y concurrencia

Migración aditiva: `supabase/migrations/20261010200000_pos_product_web_content_m2.sql`.

Tabla `pos_product_web_content`: producto y marca con FK, `draft`, `published`, revisión global, revisión publicada, actor y timestamps. Se conserva una versión publicada separada del borrador, no un historial ilimitado de versiones. El contenido usa un contrato JSON acotado; relaciones persistidas de fotos/colores se expresan con IDs de grupos y UUIDs reales de variantes, no nombres de archivo.

RPC service-only `pos_save_product_web_m2` bloquea perfil, marca, membresía y producto. Revalida pertenencia de variantes, productos relacionados y objetos de Storage dentro de la transacción. Revisión esperada obsoleta devuelve conflicto sin sobrescribir. Guardar borrador no cambia el publicado; publicar guarda y copia el documento en la misma transacción. La UI permite consultar la versión publicada en la vista previa.

No hay DML directo para authenticated/anon/service_role; service_role dispone de SELECT y EXECUTE de la RPC. API GET/PATCH privadas, no-store, sin actor recibido del cliente.

Administración web: administrador global activo o owner/admin canónico de la marca, conservando el contexto de transporte POS y sus permisos comerciales actuales. No se concede acceso por asignación operativa. Para el borrador se permite preparación incluso con servicio deshabilitado/suspendido; publicar exige marca activa y `brand_online_store_access.status = enabled`. Publicar contenido NO habilita servicio, canal ni tienda pública. La suspensión no elimina documentos ni medios.

Los consumidores públicos futuros deberán verificar nuevamente A1, M1, elegibilidad y versión publicada: no basta con que exista un JSON publicado. No se implementó ese storefront.

## Fotos y contenido

- Grupos de color definidos explícitamente. Puede elegirse un atributo real del POS para crear los grupos iniciales o asociar manualmente variantes existentes. Las tallas comparten las fotos del grupo por UUID.
- Selector visual de tono o imagen de tela; tono ausente = círculo neutral con ayuda. El nombre nunca sustituye al círculo.
- Fotos ordenables; primera = portada. Cambiar color muestra solo sus fotos. Un recurso compartido se asigna explícitamente desde otro grupo, sin fallback ni heurística de nombre.
- Reutiliza `/api/pos/product-images` y bucket `pos-products`, validación de firma/tipo/tamaño existente y autorización de marca. `purpose=web` exige autoridad de administración web y usa `brand/web/uuid/uuid.ext`.
- Namespace web inmutable: la eliminación histórica solo acepta la ruta de tres segmentos y no elimina estos objetos. Quitar una foto de un borrador desasocia la referencia, no borra la imagen de una versión publicada. Una carga abandonada puede quedar sin referencias; no se implementó limpieza de huérfanos ni eliminación de Storage.
- Beneficios: icono de catálogo cerrado, título, descripción, activación y orden. Desplegables: título, contenido, activación, orden y apertura inicial. Guía: texto, tabla tabulada o imagen. Complementos: búsqueda de productos reales de la marca, selección/orden; sin autorreferencias ni duplicados. Mayoreo: texto informativo, sin motor de descuentos.
- No se precargan beneficios, reseñas, promesas de envío ni descuentos. Texto tratado como texto React escapado con saltos de línea; no hay HTML ejecutable, Liquid ni SVG proporcionado por el usuario. No se ofrece un editor HTML enriquecido.
- Botones de compra deshabilitados. Cambiar variante solo actualiza la vista previa; no reserva ni vende.

## Pruebas y alcance real

`node scripts/test-product-web-m2-local.mjs` crea una base nueva, copia únicamente esquema de PostgreSQL local, aplica A1/M1/M2 como archivos originales y elimina solamente la base desechable al terminar. Comprueba destino Docker local 54322 antes de ejecutar operaciones. No registra migraciones en la principal.

Certificación final: `cometa_m2_1791682379849`, eliminada. SHA256 de migración M2: `ae329d2dfa16b645bb02f460d52a708ecfb204aa8218d656d5793ab7ea6cdd33`.

| Verificación | Resultado y frontera |
|---|---|
| PostgreSQL M2 | PASS: borrador/publicado, recarga, CAS concurrente, permisos, referencias producto/variante/media de otra marca, duplicados, suspensión, grants |
| Invariancia | PASS: snapshots exactos de catálogo, variantes, precios, stock, movimientos, canales y listings COMU antes/después |
| HTTP M2 | PASS: handlers reales por loopback y SQL real. Sesión, contexto comercial y transporte Supabase/PostgREST inyectados |
| Medios | PASS: handler real, firmas, owner frente a inventory, namespace y bloqueo de DELETE. Storage upload/remove simulados; no se subieron archivos a un servicio |
| Contrato Node | PASS: forma/límites, UUIDs, fotos compartidas explícitas, ausencia de fallback por color, exclusión de precios y URLs inseguras |
| Navegador M2 | PASS: React real en Chrome headless; color/galería/tallas, precio y stock de fixtures, guía, desplegables, contenido escapado, edición sin guardar, draft/publish, conflicto y responsive |
| M1 SQL/HTTP | PASS en `cometa_m1_1791682391601`, eliminada: canales, SKU/escáner, administración, Food passthrough e invariancia |
| M1 UI | PASS |
| Variantes V3A / COMU product channel | PASS |
| POS Mobile M1 | 13/13 PASS; no dispositivo nativo |
| TypeScript | PASS: `tsc --noEmit --incremental false --pretty false` |
| Lint | Nuevos archivos y API de medios limpios. La página POS conserva 1 error de hooks y 3 warnings previos, sin limpieza incidental |

Comandos adicionales:

```text
node scripts/test-product-web-m2-contract.mjs
node scripts/test-product-web-m2-ui.mjs
node scripts/test-product-channels-m1-local.mjs
node scripts/test-product-channels-m1-ui.mjs
node scripts/test-product-variants-v3a.mjs
node scripts/test-comu-product-channel-local.mjs
node scripts/test-pos-mobile-m1.mjs
```

El harness UI compila componentes reales con webpack ya instalado, abre servidor loopback y Chrome headless con perfil temporal. Sus fixtures/sesiones/transporte y guardado en memoria están identificados en pantalla. La persistencia se certifica separadamente mediante HTTP + PostgreSQL real. No certifica sesión Next autenticada, cookies, PostgREST, almacenamiento remoto, app Android ni producción.

## Evidencia visual y diferencias

- `docs/evidence/m2/product-web-desktop.png` — 1440 px.
- `docs/evidence/m2/product-web-phone-edit.png` — 390 px, edición completa.
- `docs/evidence/m2/product-web-phone-preview.png` — 390 px, vista previa completa.
- Tablet 820 px: navegación e inexistencia de overflow comprobadas en navegador.

Las capturas son de los componentes implementados, en harness aislado; no de una sesión completa del workspace. `hero-demo.jpg` y `look-demo-v4.png` son copias exactas de recursos ilustrativos del ZIP, solo para evidencia. No se añadieron a `public` ni se asignaron a productos reales.

Respecto al mockup: se mantienen columnas, jerarquía, tarjetas, fotos por color y previa magenta. Se conserva el shell POS actual en lugar de implementar el sidebar ilustrativo. Canales M1 conserva su bloque y botón propios, por lo que ocupa más espacio. Los controles de asociaciones/tono son explícitos, no menús decorativos. Se omiten reseñas, promesas de envío, enlaces de tienda y botones operativos ficticios. Las fotos de evidencia son horizontales y se muestran completas; las proporciones difieren de las fotografías verticales del mockup.

## Archivos del bloque

Modificados:

- `src/app/brand/[brandSlug]/pos/products/page.tsx` — entrada Ficha web y protección de borrador local al cerrar/cambiar pestaña; conserva hunks M1.
- `src/app/api/pos/product-images/route.ts` — propósito web autorizado y namespace inmutable; carga histórica sin ese propósito conserva ruta.

Nuevos:

- `src/lib/pos/product-web-contract.ts`
- `src/lib/pos/product-web.ts`
- `src/app/api/pos/products/[productId]/web/route.ts`
- `src/app/brand/[brandSlug]/pos/products/product-web-editor.tsx`
- `src/app/brand/[brandSlug]/pos/products/product-web-preview.tsx`
- `src/app/brand/[brandSlug]/pos/products/product-web.css`
- `supabase/migrations/20261010200000_pos_product_web_content_m2.sql`
- `scripts/test-product-web-m2-local.mjs`
- `scripts/test-product-web-m2-http.mjs`
- `scripts/test-product-web-m2-contract.mjs`
- `scripts/test-product-web-m2-ui.mjs`
- Este documento y los cinco archivos de evidencia indicados.

Pendiente antes de uso real: autorización de migración dirigida en el entorno elegido, validación con sesión/Storage reales y aprobación visual del usuario. No se declara tienda operativa ni compatibilidad nativa certificada. M0/M0.1/A1/M1, Finance y Food permanecen preservados.

Estado final: HEAD y rama sin cambios, índice vacío, `git diff --check` PASS. De los 201 archivos pendientes registrados al inicio, 200 conservan hash idéntico; únicamente `products/page.tsx` recibió la integración M2 prevista, manteniendo los cambios M1. La API de imágenes estaba limpia inicialmente. Estado resumido: 31 modificados y 73 entradas untracked, incluyendo trabajo anterior y referencias del usuario.
