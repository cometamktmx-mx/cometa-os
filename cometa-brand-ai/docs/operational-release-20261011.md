# Entrega operativa — 11 octubre 2026

Esta entrega sustituye la preparación Preview anterior. El usuario autorizó actualizar la base compartida y desplegar Production, con respaldo y ensayo previo. No equivale a autorizar cobros, mensajes ni lanzamiento comercial de MAGENTA.

Despliegues finales READY: COMETA `cometa-qsu0wz6ou-cometa-os-s-projects.vercel.app`; storefront `magenta-controlled-preview-50w8yj3da-cometa-os-s-projects.vercel.app`. La comprobación HTTP final de Workspace, membresías separadas, inbox Seller, catálogo POS y cierre de compras pasó. El control de imágenes de plataforma permanece NOT_CERTIFIED, separado del PASS funcional.

## Acceso

| Superficie | URL / recorrido | Estado comprobado |
| --- | --- | --- |
| COMETA OS | https://app.cometaos.com/login → empresa | Publicado en el proyecto existente. Auth y resolución de permisos reales; no se ejecutaron agentes ni integraciones de comunicación. |
| Workspace global | https://app.cometaos.com/workspace | Administrador canónico `user_profiles.role=admin`, `status=active`. La cuenta existente del usuario cumple ambos. Sin excepciones por correo ni cambio de contraseña. |
| Accesos | https://app.cometaos.com/workspace/access | Cliente y anónimo rechazados por API. Asignación real de owner a una marca sintética mediante el mecanismo existente. |
| Solicitudes COMU | https://app.cometaos.com/brand/admin/comu | Solicitud → revisión → aprobación → acceso Seller real certificado con datos sintéticos. |
| POS | Empresa → `/brand/{brandSlug}/pos` | Retail publicado y probado con cuenta/empresa sintéticas. Food conserva sus contratos; regresión local con dependencias simuladas, no caja/hardware real. |
| COMU vendedores | https://app.cometaos.com/comu/sell y https://app.cometaos.com/comu/login | Accesibles sin cuenta Vercel. Producto, edición, recarga y Storage real certificados. |
| MAGENTA | https://magenta-controlled-preview.vercel.app | Aplicación independiente desplegada. **Sin marca enlazada y sin catálogo comercial**, pendiente de resolver las dos identidades existentes. No lista para vender. |
| Administrar tienda | Workspace → marca → Módulos; POS → Tienda online → Apariencia | A1 y M1–M3 reales probados sobre marca sintética. No se habilitó ninguna de las dos marcas MAGENTA. |

La ficha separa membresías OS/POS y COMU, acceso comercial y publicación de Apariencia. Las asignaciones operativas no se convierten en permisos. Se conserva la autoridad global sin crear membresía owner al administrador. Conexiones enlaza a la superficie WhatsApp existente; no se certificaron pagos, dominio ni envíos de ninguna marca por el simple hecho de guardar configuración.

## MAGENTA: decisión pendiente

- `magenta-fit-wear`: marca activa, propietario activo, cero productos y cero filas de inventario al inspeccionar.
- `magenta-fitwear`: marca activa, un producto y 27 filas de inventario, sin membresías en `user_brand_access` al inspeccionar.
- No se fusionaron marcas, copiaron existencias ni reasignaron propietarios. Se solicitó al usuario elegir la identidad canónica.
- Posteriormente: habilitar A1 únicamente en la marca elegida, preparar/publicar su contenido real M2/M3 y configurar el binding del storefront. Los diseños aprobados y el editor ya están desplegados; los fixtures visuales no son catálogo comercial.
- Para vender siguen pendientes: sucursal de cumplimiento, moneda/política comercial, reglas de mayoreo admitidas, logística y costo verificable, cuenta Stripe y recorrido de pago autorizado, dominio. No introducir secretos por chat: utilizar los paneles/configuración segura.

## Respaldo y recuperación

Destino confirmado: Supabase `zhtagqrzyovsrmsicaot`, base compartida de COMETA. Antes de migrar se respaldaron `public`, `auth`, `storage` y `supabase_migrations`, esquema y datos.

- Esquema SHA-256: `a821f95d2bd1bdb840190dac4e3ff5017b5afa80e940d12029f59d66c807269b`.
- Datos SHA-256: `54820ecd382daa971b04ee6f8352659950d9d9e40e82159801a73914bffb8fdf`.
- Restauración real, no solo lectura del dump: PostgreSQL desechable `cometa_m6_1791768126383`, posteriormente eliminado. Resultado: 24 usuarios, 23 marcas, 50 filas de inventario, cero órdenes COMU.
- Evidencia y originales privados: `.next/release-private-20261011/`, ACL restringida. No incluidos en fuentes desplegadas ni Git. El respaldo de Storage contiene metadatos; no es copia de sus blobs. No se eliminaron ni sobrescribieron objetos existentes.
- `scripts/verify-operational-backup-local.mjs` reproduce la restauración únicamente en una base nueva. Los triggers se deshabilitan dentro de la restauración desechable, nunca en remoto.
- Aplicación previa conservada en Vercel: `cometa-ln1hp09v9-cometa-os-s-projects.vercel.app`. Una reversión de aplicación debe revisar compatibilidad con el nuevo esquema; no restaurar ciegamente el dump sobre pedidos posteriores al respaldo. Recuperar primero en otra base, comparar y aplicar recuperación dirigida.

## Migraciones aplicadas

El ensayo contra el esquema remoto real detectó que la lista inicial de 16 omitía Buyer Foundation. Se añadió esa dependencia y una migración mínima para cerrar creación directa de compras COMU. No se reaplicaron migraciones Finance.

En este orden, archivos originales bajo `supabase/migrations/`:

1. `20260928180000_comu_buyer_experience_v1.sql`
2. `20261002120000_pos_device_foundation_v1.sql`
3. `20261002121000_pos_mutation_api_boundary_v1.sql`
4. `20261003130000_comu_seller_approval_v1.sql`
5. `20261003150000_comu_seller_catalog_v1.sql`
6. `20261003170000_comu_shared_variant_contract_v1.sql`
7. `20261005120000_comu_order_contract_state_safety_v1.sql`
8. `20261005150000_comu_notifications_v1.sql`
9. `20261005170000_comu_buyer_order_read_privacy_v1.sql`
10. `20261010120000_comu_reservation_lifecycle_m0.sql`
11. `20261010160000_brand_online_store_access_a1.sql`
12. `20261010180000_pos_product_sales_channels_m1.sql`
13. `20261010200000_pos_product_web_content_m2.sql`
14. `20261011100000_brand_storefront_appearance_m3.sql`
15. `20261011120000_storefront_catalog_m4.sql`
16. `20261011140000_storefront_product_m5.sql`
17. `20261011160000_storefront_checkout_m6.sql`
18. `20261011180000_comu_seller_release_purchase_boundary.sql`

`scripts/apply-operational-release.mjs` comprueba hashes del respaldo y ensayo, confirma destino/historial antes de cada archivo, usa `supabase db query --file` sin transformación SQL y registra el ledger separadamente después del éxito. El batch transaccional de Management API fue comprobado con una tabla y LOCK temporales. PostgREST recibió reload de esquema. Todas las entradas quedaron registradas.

## Compatibilidad y cierre COMU

- POS: las mutaciones actuales pasan por handlers autenticados y cliente servidor. Se preserva acceso `service_role`; no se conceden mutaciones directas de stock al navegador. La versión desplegada anterior usaba las RPC de venta mediante API.
- B1: token HUB, label/provider internals y datos administrativos dejan de ser lectura directa authenticated. Se verificó `hub_handoff_token` DENIED en remoto y contratos Seller vía API.
- M0: no libera COMMITTED indiscriminadamente. Se ensayó el esquema remoto con datos sintéticos y pruebas de última pieza, cancelación/expiración/pago concurrentes, reintentos y pago tardío en revisión.
- COMU: flags de compras false; UI cerrada, proxy y handlers de reserva/checkout/intento/cotización cerrados, SQL directo de creación revocado a public/anon/authenticated. La atención/cancelación de operaciones existentes y webhooks no se eliminaron. Abrir un flag posteriormente no basta para reabrir SQL.
- N1: almacenamiento/cutover instalado; correo false, sin nuevo scheduling ni worker ejecutado. Se conserva únicamente el cron previo de la aplicación.
- Flags habilitados para vendedores: `COMU_ENABLED`, `COMU_SELLER_ONBOARDING_ENABLED`, `COMU_CATALOG_ENABLED`, `COMU_BUYER_FOUNDATION_ENABLED`. `COMU_PUBLIC_PURCHASES_ENABLED`, `NEXT_PUBLIC_COMU_PURCHASES_ENABLED`, `COMU_NOTIFICATIONS_EMAIL_ENABLED`, `COMU_OUTBOUND_MONEY_ENABLED`: false en la entrega. Reutilizar estos valores al desplegar futuras copias.

## Pruebas y límites

PASS:

- Restauración real del respaldo.
- `test-operational-release-local.mjs`: esquema remoto original + migraciones completas en base desechable; M4/M5/M6 SQL, concurrencia Retail/COMU/tienda y cierre SQL. Los adapters HTTP de esa suite están simulados, PostgreSQL no.
- `certify-operational-release-http.mjs`: GoTrue real, cookies SSR, handlers de `app.cometaos.com`, PostgREST y Storage reales. Solicitud/aprobación, rechazo de autoaprobación y cross-seller, producto/edición/recarga, foto, membresías, Retail onboarding/catálogo, A1 independiente, canales M1, borrador/publicación/foto M2 y Apariencia M3.
- Retail owner y rechazo entre marcas; administrador global separado del owner. No se hicieron ventas ni movimientos de caja reales.
- C1 Node, B1 Node, multirole cash (3), Food access (8), Food operations (17), Food hardening (9): PASS. Food/autorización de estos scripts usa mocks; no equivale a certificación física de cocina, impresoras o caja.
- TypeScript sin emisión, lint dirigido y diff-check. Builds Vercel de OS y storefront independientes.
- Cierre de handlers verificado directamente sin invocar dependencias; no depende exclusivamente de proxy.

La certificación remota fue HTTP/SSR, no un recorrido manual completo en navegador desktop/teléfono. No certifica Stripe, envíos, DNS, impresoras, WhatsApp, SMTP ni todas las integraciones OS. No se ejecutaron proveedores para simular éxito.

Datos sintéticos identificados: prefijo `release-test-1791769410161`; tres cuentas y dos marcas nuevas. Tienda de prueba suspendida al terminar; contenido conservado. Los tres perfiles sintéticos se dejaron inactivos al finalizar, sin borrar sus auditorías ni modificar la cuenta administrativa real, verificada nuevamente admin/active. Productos COMU de prueba permanecen DRAFT/PREPARING, sin catálogo comercial. Conteos posteriores: 27 usuarios, 25 marcas, 51 filas de inventario (una nueva de prueba), cero órdenes COMU y cero órdenes de tienda. Ninguna tienda habilitada al cerrar la prueba.

## Dependencias de seguridad

El audit de dependencias existentes reporta vulnerabilidades, incluyendo Next 16.2.7 y librerías transitivas. No se ejecutó `npm audit fix` ni una actualización general. Se configuraron imágenes originales y se reforzó la autorización/cierre en handlers. **No se certificó el cierre del endpoint de imágenes de la plataforma:** `unoptimized` y el redirect de la copia no demostraron impedir su manejo por Vercel (OS devolvió 200; storefront 400 con un asset inexistente). El render de imágenes originales no prueba cierre del servicio. Se conserva este intento como evidencia, no como PASS. Actualización acotada de dependencias y regresión siguen pendientes antes de afirmar preparación comercial completa.

Referencias: https://github.com/advisories/GHSA-2xp9-vwfh-vxw4 y https://github.com/advisories/GHSA-6gpp-xcg3-4w24. La configuración actual no tiene `i18n.locales`; no se afirmó explotación del caso de proxy. Se sirven imágenes originales, manteniendo diseño y rutas.

## Dominio COMU

URL de vendedores disponible sin Vercel: `app.cometaos.com/comu/sell`. `comu.com.mx` no se compró ni se cambió DNS. Después de adquirirlo: verificar propiedad, añadirlo al proyecto existente, utilizar los registros exactos que indique Vercel, verificar TLS y configurar entrada raíz COMU/redirects Auth. No copiar DNS genérico ni redirigir toda la raíz corporativa por conveniencia.

## Preservación

HEAD `e11383a1864aee98736834a8ca8c4bb7c7cb7bca` e índice intactos. Ninguno de los 1,413 archivos previos desapareció. Sin staging, commits, push, reset ni limpieza de trabajo ajeno. No planes nuevos ni contratación de recursos.

Cambios de código limitados a cierre COMU, ficha/navegación Workspace, instalación de copia storefront y desactivación del optimizador. Los ajustes de harness solo reflejan imports/consultas nuevos. Migraciones históricas intactas, incluida M0; una nueva migración de cierre COMU. M6.3 previo no reemplazado. Fuentes desplegadas incluyen untracked runtime mediante manifiestos; excluyen `.env`, secretos, datos, ZIP/APK, backups y fixtures privados.
