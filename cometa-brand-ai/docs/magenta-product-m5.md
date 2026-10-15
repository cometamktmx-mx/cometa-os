# M5 — Ficha pública y base de bolsa

Implementación local sobre M2/M3/M4. No habilita una tienda en producción. Sin commits, despliegues, pagos ni migraciones sobre bases existentes.

## Contratos y comportamiento

- Ruta estable `/productos/{productId}` dentro de `apps/magenta-storefront`. Home y Catálogo enlazan a ella. Catálogo transmite el color y la talla; la ficha resuelve una variante real y conserva su UUID en `?variant=...`. Una referencia inválida no selecciona una variante ajena.
- Marca resuelta exclusivamente desde `STOREFRONT_BRAND_SLUG` en servidor, mediante el cliente público anon ya usado en M3. El body de bolsa no admite marca, precio, total ni identidad.
- `brand_storefront_product_m5` reutiliza `brand_storefront_home_m3` y `brand_storefront_cards_m3`: marca activa, A1 habilitado, M1 online, M2 publicado, producto Retail elegible, variantes activas y Apariencia publicada. Un producto agotado permanece legible.
- DTO explícito: identidad pública, moneda, contenido publicado M2, variantes activas, opciones escalares, precio y disponibilidad; relacionados nuevamente filtrados por elegibilidad y marca. Sin borrador, revisión editorial, actor, inventario por sucursal ni identificadores de proveedores.
- Reutiliza los tipos `WebContent` y `webPhotos` de M2. No interpreta nombres de archivos ni reconstruye asociaciones de color. Material compartido debe estar asignado explícitamente a cada grupo en M2. No hay fallback de fotos entre colores.
- Cambiar de color limpia la variante y pide selección, incluso si existía una talla anterior. Precio, disponibilidad, URL y ambos botones dependen de una sola variante. Las opciones adicionales se presentan como combinaciones reales del POS, no como combinaciones cartesianas inventadas.
- Galería con miniaturas, anterior/siguiente, ampliación; guía de tallas con `dialog`, Escape, ciclo de Tab y retorno de foco. Contenido editorial como texto React, sin HTML ejecutable.
- Bloques vacíos y beneficios desactivados se omiten. No se agregan reseñas, descuentos, pagos, envíos ni promesas comerciales de la plantilla.

## Apariencia

`Appearance.product` es opcional para preservar documentos M3/M4 anteriores. Configura orden/activación de nueve bloques, textos de bolsa/guía/relacionados, separación, galería compacta/cuadrícula, encuadre y barra fija móvil.

El panel Producto se incorpora al editor existente. Reutiliza autorización, borrador/publicación, revisión esperada y RPC M3. El nuevo trigger valida la configuración en PostgreSQL. Guardar no activa A1 ni altera Home/Catálogo. Datos específicos de la prenda continúan en M2.

La selección vive fuera de los bloques ordenables: ocultar o mover bloques no cambia la variante. Ocultar el bloque de bolsa oculta también la barra fija. Si se oculta selección, no se elige una variante por defecto: solo un enlace que ya tenga una variante válida puede habilitar el agregado. La vista previa general existente de Apariencia continúa mostrando Home; no se añadió un simulador administrativo de ficha distinto del renderer público.

## Bolsa mínima

- `POST /api/bolsa/validar` es una comprobación de lectura, `private, no-store`. Devuelve precio/moneda actuales del servidor, sin crear una operación comercial.
- SQL verifica que la cantidad acumulada de una variante sea posible en **una misma fila de inventario/sucursal**: `quantity - reserved_quantity >= quantitySolicitada`. No suma sucursales, no selecciona una sucursal de despacho y no garantiza existencias futuras. El booleano público usa ese mismo criterio para una unidad.
- Persistencia local versionada por UUID de marca: exclusivamente `productId`, `variantId`, `quantity`; sin precios guardados. Solo se fusionan líneas de la misma variante/producto. Límites defensivos: 100 líneas y 99 unidades por variante.
- JSON corrupto y líneas inválidas se descartan sin bloquear la ficha. Toda nueva adición valida la cantidad acumulada contra servidor. Una respuesta fallida no modifica la bolsa.
- Cola de peticiones dentro de la pestaña y Web Locks entre pestañas compatibles. Sin Web Locks, la serialización cubre la pestaña actual; la coordinación entre pestañas antiguas queda limitada. Si almacenamiento falla, se conserva memoria de pestaña y se avisa explícitamente que no persistirá al recargar.
- Contador y confirmación accesible dentro de la ficha. Sin panel lateral, edición completa de bolsa ni checkout. M6 debe revalidar todas las líneas locales, resolver sucursal/fulfillment y volver a calcular precios. Las líneas locales no son evidencia de elegibilidad ni de reserva.

## Migración

`supabase/migrations/20261011140000_storefront_product_m5.sql`

Añade dos RPC públicas **solo de lectura** y el trigger validador de Producto sobre la tabla Apariencia existente. No crea tablas comerciales, no modifica inventario, precios, reservas, COMU ni migraciones históricas. Requiere A1/M1/M2/M3/M4.

Probada únicamente en PostgreSQL desechable mediante Docker local, puerto 54322. La base principal se leyó solo para obtener el esquema; los scripts crearon bases nuevas y las eliminaron al finalizar:

- `cometa_m5_1791687077467`: primera certificación SQL/HTTP M5 y regresión M4.
- `cometa_m5_1791687466800`: añade prueba explícita de dos sucursales con una unidad; solicitar dos sigue rechazado.
- `cometa_m5_1791688760956`: certificación final, incluido enlace HTTP Catálogo → color/talla → variante real.
- `cometa_m3_1791687599554`: regresión SQL/HTTP M3.

## Verificación

| Comprobación | Resultado y alcance |
|---|---|
| M5 PostgreSQL + HTTP | PASS: aislamiento, URL directa, M1/A1, publicación, borrador no visible, agotado/reservado, cantidad acumulada, sucursales no sumadas, cero mutaciones de catálogo/inventario, CAS, conservación Home/Catálogo, grants, suspensión |
| HTTP | Handlers/página reales y rol anon PostgreSQL real. Cliente Supabase/transporte y entorno de marca inyectados; no certifica PostgREST real ni cookies |
| M5 Node | PASS: configuración acotada, selección inválida, URL, corrupción local, fusión, solicitudes simultáneas en cola, aislamiento de bolsa, fallo sin pérdida, no persistir precios. Fetch y storage simulados |
| M5 Chrome | PASS: componentes reales, color/talla incompatible, fotos, miniaturas/ampliación, agotados, recarga URL, guía Tab/Escape/foco, repetir agregado, persistencia/corrupción, barra móvil y ocultación de bloques. Datos y endpoint de disponibilidad simulados |
| M3 | Contrato Node, SQL/HTTP PASS. Harness visual completó todas sus aserciones y emitió PASS; se interrumpió después porque su proceso no terminó al cerrar, sin nuevas acciones ni cambios de runtime |
| M4 | Contrato Node, regresión SQL/HTTP incluida en runner M5 y Chrome desktop/tablet/phone PASS |
| TypeScript raíz | `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: 0 errores |
| Build independiente | `node node_modules/next/dist/bin/next build apps/magenta-storefront --webpack`: PASS, Home/Catálogo/Producto/API bolsa |
| Lint dirigido | 0 errores, seis advertencias `no-img-element` (cinco ya presentes en Home/Catálogo; una nueva en renderer Producto compartido) |
| Diff/whitespace | `git diff --check`: PASS; comprobación adicional de whitespace en fuentes nuevas/compartidas: PASS |

Runners: `scripts/test-storefront-m5-{contract,http,local,ui}.mjs`. Los runners UI anteriores aceptan `STOREFRONT_EVIDENCE_DIR` para no sobrescribir evidencia aprobada. El harness de contrato M3 carga ahora la dependencia Producto de Apariencia.

## Evidencia visual

Capturas de React real en Chrome, con banner de simulación. Productos, importes, stock y medidas son fixtures; fotografías originales del ZIP usadas explícitamente como recursos de prueba. La segunda foto Rosa duplica el recurso de referencia solo para ejercitar galería, no representa una segunda fotografía comercial disponible.

- `docs/evidence/m5/product-desktop.png`
- `docs/evidence/m5/product-desktop-color.png`
- `docs/evidence/m5/product-size-guide.png`
- `docs/evidence/m5/product-added-desktop.png`
- `docs/evidence/m5/product-phone.png` (página completa)
- `docs/evidence/m5/product-phone-viewport.png` (pantalla real)
- `docs/evidence/m5/product-added-phone.png`
- `docs/evidence/m5/product-added-phone-viewport.png`
- `docs/evidence/m5/product-size-guide-phone.png`
- `docs/evidence/m5/product-size-guide-phone-viewport.png`
- Regresiones separadas en `docs/evidence/m5/regression-m3/` y `regression-m4/`.

Comparación con `templates/product.json`, `main-product`, `product-gallery` y `related-products`: conserva fondo marfil, vino MAGENTA, serif editorial, fotografía dominante, dos columnas desktop, selector circular, bloques ordenables y barra móvil. Omite deliberadamente ratings, pagos, favoritos, checkout dinámico, recomendaciones automáticas y contenido comercial de muestra. El selector de variantes usa combinaciones POS reales. La guía usa contenido M2, no metafields/Liquid.

## Archivos M5

Archivos previos modificados (solo integración M5):

1. `apps/magenta-storefront/app/layout.tsx` — CSS de ficha.
2. `packages/own-storefront/catalog.tsx` — enlaces con color/talla.
3. `packages/own-storefront/catalog.css` — anchor de fotografía conserva geometría de bloque.
4. `packages/own-storefront/home.tsx` — enlaces a productos.
5. `packages/own-storefront/contract.ts` — configuración Producto opcional.
6. `src/app/brand/[brandSlug]/pos/online-store/appearance/appearance-editor.tsx` — panel Producto.
7. `scripts/test-storefront-m3-contract.mjs` — dependencia de contrato nueva.
8. `scripts/test-storefront-m3-ui.mjs` — destino de evidencia configurable.
9. `scripts/test-storefront-m4-ui.mjs` — destino de evidencia configurable.

Archivos nuevos:

- `apps/magenta-storefront/app/productos/[productId]/{page,loading,error,not-found}.tsx`
- `apps/magenta-storefront/app/api/bolsa/validar/route.ts`
- `apps/magenta-storefront/lib/public-store.ts`
- `packages/own-storefront/{product-contract.ts,product.tsx,product.css,bag.ts}`
- `src/app/brand/[brandSlug]/pos/online-store/appearance/product-settings.tsx`
- Migración y cuatro runners M5 mencionados arriba.
- Este documento y la evidencia M5.

## Preservación y límites

Estado inicial: rama `feature/comu-v1`, HEAD `e11383a1864aee98736834a8ca8c4bb7c7cb7bca`, índice vacío. Se tomaron hashes SHA-256 de 263 archivos pendientes. Los nueve archivos previos listados cambiaron por M5; los otros 254 conservan su hash. No desapareció ningún archivo previo. M0/M0.1/A1/M1/M2 y migraciones históricas permanecen intactos; evidencia aprobada M3/M4 también.

Pendientes de integración real: aplicar las migraciones únicamente cuando se autorice una sincronización dirigida; comprobar RPC vía PostgREST del entorno objetivo, Storage real y sesión administrativa real. No hay certificación de producción ni nativa móvil. La carga a escala/optimización de imágenes continúa pendiente. La bolsa es una intención local, no una reserva; checkout, pagos, WhatsApp y resolución comercial siguen fuera de M5.
