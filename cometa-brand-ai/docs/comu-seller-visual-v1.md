# COMU Seller Visual V1

Fecha: 2026-10-03. Alcance: Seller Shell y Resumen. Sin cambios a C1/C2, autorización, inventario, Connect, fulfillment, APIs o schema. Sin commit ni deploy.

## Resultado y evidencia

Referencia: `visual-references/comu-seller-dashboard-approved.png`.

Se reprodujeron sidebar verde, fondo crema, topbar, jerarquía editorial, cuatro métricas, zona de gráfica, pedidos, panel derecho y banner COMETA. ACTIVE y PREPARING usan el mismo shell. Las páginas restantes conservan su contenido interno existente.

Capturas reales con Chromium, Auth y APIs locales, sin mocks:

- [ACTIVE desktop](visual-evidence/comu-seller-v1/active-desktop.png)
- [PREPARING desktop](visual-evidence/comu-seller-v1/preparing-desktop.png)
- [ACTIVE phone](visual-evidence/comu-seller-v1/active-phone.png)
- [PREPARING phone](visual-evidence/comu-seller-v1/preparing-phone.png)
- [ACTIVE tablet](visual-evidence/comu-seller-v1/active-tablet.png)
- [PREPARING tablet](visual-evidence/comu-seller-v1/preparing-tablet.png)
- [Resultados de viewport](visual-evidence/comu-seller-v1/results.json)

Desktop 1536x1024, tablet 834x1112, phone 390x844: sin overflow horizontal. Phone usa navegación inferior y menú Más. Buyer conserva header Marketplace; Seller lo reemplaza con su shell.

## Datos y estados

Los endpoints existentes suministran tiendas autorizadas, catálogo, pedidos y storefront. El estado Connect se lee mediante la acción existente; no se ejecutó Stripe. El progreso elegible proviene del contrato C2, sin duplicar la regla SQL. PREPARING muestra requisitos pendientes y revisión COMETA; no activa automáticamente.

Las métricas usan pedidos reales pagados y publicaciones elegibles. Ventas/ticket consideran mercancía sin envío, indicado en UI. No se agregan porcentajes. El fixture ACTIVE tiene un día con actividad: la gráfica conserva su espacio y muestra el mensaje de actividad insuficiente. La atención de productos usa únicamente stock registrado agotado, sin inventar umbrales.

## Diferencias y límites respecto al mockup

- Los nombres largos y cantidades del fixture producen distinta densidad; no se reemplazaron con datos ilustrativos.
- La gráfica está vacía por falta de serie suficiente. La rama con serie real está preparada, pero no fue certificada visualmente con un fixture de varios días.
- Se reutiliza la fotografía local existente `public/comu/auth/buyer-register.jpg` para Growth; no es la fotografía exacta del mockup. No se agregó la promoción fotográfica inferior de la sidebar.
- Inventario, Clientes y Envíos aparecen deshabilitados donde no existe ruta Seller habilitada. No hay sistema nuevo de búsqueda ni notificaciones.
- Soporte y Conocer COMETA permanecen deshabilitados hasta contar con destinos confirmados.
- Los fixtures no tienen POS. No se muestra ningún requisito ni mensaje de carencia POS. El indicador positivo de sincronización POS queda pendiente: no se infirió una integración a partir del inventario compartido ni se agregó un contrato funcional.
- Pedidos, Productos, Finanzas y Configuración conservan su diseño interno anterior dentro del shell; su rediseño no pertenece a este bloque.

## Validación

- `node scripts/test-comu-seller-approval-local.mjs`: PASS.
- `node scripts/test-comu-seller-catalog-local.mjs`: PASS.
- `node scripts/test-comu-auth-local.mjs`: PASS.
- `node scripts/test-comu-account-capabilities-http-local.mjs`: PASS para Buyer, Buyer+Seller, aislamiento, configuración, logout/login y multitienda temporal. Seller-only no certificado: el fixture B ya tiene perfil Buyer.
- `node scripts/test-comu-seller-visual-local.mjs`: PASS, seis combinaciones de estado/viewport y separación Buyer/Seller.
- TypeScript sin emisión: PASS.
- ESLint dirigido: PASS.
- `git diff --check`: PASS.

Las pruebas visuales requieren Next local y Supabase exactamente en `http://127.0.0.1:54321`, y leen el fixture privado ignorado existente. No incluyen credenciales en evidencia. No se ejecutaron migraciones ni se re-certificó PostgreSQL en este bloque visual.

## Archivos de este bloque

Modificados: `src/app/comu/components/auth-boundary.tsx`, `src/app/comu/seller/[brandSlug]/[view]/page.tsx`.

Nuevos bajo `src/app/comu/seller/`: `layout.tsx`, `seller-shell.tsx`, `seller-overview.tsx`, `seller-ui.tsx`, `seller.css`.

Prueba: `scripts/test-comu-seller-visual-local.mjs`. Documentación: este archivo y `comu-seller-visual-v1-git-status.txt`. Evidencias: `visual-evidence/comu-seller-v1/`.

Los cambios anteriores de `seller-dashboard.tsx`, Buyer, Home, POS/Mobile y demás working tree se preservaron. Ningún staging ni commit.
