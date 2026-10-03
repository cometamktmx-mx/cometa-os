# COMU Seller Productos Visual V2

Referencia: `visual-references/comu-seller-products-approved.png`.

## Alcance

Productos usa el Shell V1 sin cambios. Se reemplaza únicamente su contenido negro por header editorial, CTA, métricas, filtros, buscador, categoría, tabla, paginación y cards. El editor C2 permanece intacto dentro de su contenedor anterior. No se modificaron APIs, SQL, autorización, publicación, stock, reservas, mayoreo, Storage ni activación.

Los cambios de este bloque son:

- `src/app/comu/seller/products-manager.tsx`
- `src/app/comu/seller/seller-dashboard.tsx`: únicamente rama Productos (estado seller, encabezado y color del mensaje).
- `src/app/comu/seller/[brandSlug]/[view]/page.tsx`: únicamente contenedor Productos.
- `src/app/comu/seller/seller-products.css` (nuevo, estilos aislados).
- `scripts/test-comu-seller-products-visual-local.mjs` (nuevo).
- `scripts/test-comu-seller-products-shell-regression-local.mjs` (nuevo; ejecuta la regresión V1 guardando evidencia separada).
- Este documento, registro Git y `visual-evidence/comu-seller-products-v2/`.

Los cambios anteriores en seller-dashboard y otros archivos permanecen; no pertenecen a V2. Sin staging, commit, push ni deploy.

## Datos

Se reutilizan las lecturas existentes del catálogo C2 y las imágenes/listings del manager. No hay datos ilustrativos.

- Publicados: listing PUBLISHED. Borradores: sin listing o DRAFT. HIDDEN sigue siendo Oculto, no se confunde con borrador.
- Atención: sin unidades disponibles o alguna variante con 1–3 unidades disponibles, siguiendo la convención visual existente en `comu/inventory.ts`.
- Stock mostrado: cantidad física menos reservas, sumada por variante/ubicación. No modifica reserved_quantity.
- Precios: valores reales de variantes; rango cuando difieren.
- Categorías: nombres reales, no UUIDs. Búsqueda por nombre, SKU de variantes, código y categoría.
- PREPARING: progreso desde `catalog.progress`, la fuente C1/C2. ACTIVE sin mensaje de preparación.
- Catálogo listo es neutral. No se infiere POS de tablas compartidas. No se certificó un seller con integración POS explícita; ese indicador positivo no se implementa sin un contrato confirmado.
- Fechas: updated_at real, sin inventar fecha para registros ausentes.

## Acciones

Editar/Agregar abren el ProductEditor existente. Publicar/Ocultar/Subir imagen conservan callbacks originales. Ver en tienda usa public_slug real. Selección es local; no crea operaciones masivas. No se añaden eliminación, duplicación ni archivado.

Paginación real de 8/16/32 productos, después de búsqueda/filtros. El fixture ACTIVE tiene 10 productos: dos páginas con tamaño 8. Los filtros no generan páginas falsas.

## Evidencia

- [ACTIVE desktop](visual-evidence/comu-seller-products-v2/products-active-desktop.png)
- [PREPARING desktop](visual-evidence/comu-seller-products-v2/products-preparing-desktop.png)
- [ACTIVE phone](visual-evidence/comu-seller-products-v2/products-active-phone.png)
- [ACTIVE phone viewport](visual-evidence/comu-seller-products-v2/products-active-phone-viewport.png)
- [ACTIVE tablet](visual-evidence/comu-seller-products-v2/products-active-tablet.png)
- [PREPARING phone](visual-evidence/comu-seller-products-v2/products-preparing-phone.png)
- [Resultados](visual-evidence/comu-seller-products-v2/results.json)

Auth real local y APIs reales, sin mocks de red. Desktop 1536x1024, tablet 834x1112, phone 390x844; ambos estados sin overflow horizontal. Tablet usa cards de dos columnas; phone una columna y navegación móvil V1.

## Validación y límites

- TypeScript sin emisión: PASS.
- Lint dirigido: PASS.
- C2 Node regression: PASS.
- Productos visual: PASS en seis combinaciones. Búsqueda con coincidencia y sin coincidencia, categoría real, cinco filtros y counts, paginación, apertura de acciones y editor, imágenes cargadas, PREPARING y ausencia de onboarding en ACTIVE.
- Seller Visual V1 regression: PASS en seis combinaciones, incluyendo separación Buyer/Seller. Evidencia en `visual-evidence/comu-seller-products-v2/dashboard-regression/`.
- `git diff --check`: PASS.

No se ejecutaron mutaciones de publicación/upload/stock para las capturas; la regresión C2 comprueba sus contratos existentes. No se repitió certificación PostgreSQL ni hubo Stripe.

El fixture A tiene 10 publicaciones con stock y una sola categoría. B tiene un producto de prueba en borrador, stock cero y 0/10 elegibles: su fila y el filtro Sin stock sí quedaron certificados. El badge prioriza Borrador sobre disponibilidad cuando aún no está publicado. Oculto y Stock bajo están implementados pero no cuentan con filas representativas en estos fixtures. No se cambiaron datos para simular estados.

## Comparación con mockup

Se conserva composición desktop, jerarquía editorial, cuatro métricas, barra de filtros, tabla, paginación y cards mobile. Se mantiene el Shell V1 aprobado, incluyendo diferencias previas frente a la referencia (sin banner de sidebar ni notificaciones ficticias).

Las fotografías del mockup no se copian. El fixture contiene una imagen Storage mínima de prueba (se ve blanca) y el resto usa placeholder COMU. No se inventan swatches de color ni porcentajes semanales. Las filas muestran nombres/SKU reales extensos. Los badges derivan del estado real.

En phone se omite la fila de métricas como en la referencia móvil, se conservan counts en filtros y se permite que estos se distribuyan en dos líneas para evitar overflow. El selector de categoría es explícito, en vez de un icono ambiguo. Agregar, menú y paginación tienen targets de al menos 44 px.

Pendiente únicamente de revisión visual del usuario y certificación ampliada con productos/fotografías representativas y los estados indicados. No se inicia Visual V3.
