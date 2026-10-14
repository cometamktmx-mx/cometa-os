# Magenta: procedimiento de lanzamiento pendiente de aprobación

Estado al 14 de octubre de 2026: **presentación no lista; operación live no lista**. No se hizo merge, migración, cambio de variables/dominios ni despliegue de producción. La preparación funcional avanza en pruebas. Diseño detenido a petición del usuario; ver [diferencias Atelier](magenta-atelier-reference-differences.md).

## Requisitos manuales indispensables

1. Indicar correcciones visuales por pantalla respecto al ZIP y aprobar después la comparación escritorio/móvil. Primero home/navegación; luego catálogo, producto y bolsa. No basta aprobar colores.
2. Completar **Stripe Connect test** en el enlace privado local `.next/magenta-functional/ephmrsjnpkcgddulvckj/CONECTAR-CUENTA-TEST.txt`. Es temporal; se renueva con `node scripts/prepare-magenta-connect-test.mjs`. No usar datos bancarios ni identidad reales en esta cuenta sintética. Después debe probarse un pago Connect test nuevo: el pago anterior fue a la plataforma. No se repetirá ese pago anterior.
3. Confirmar dominio definitivo/registrador y entregar contenido autorizado: imágenes reales por SKU/variante, textos, políticas, contacto, dirección/horarios, cobertura/tarifas y stock real por ubicación. No copiar fixtures ni usuarios de prueba. Confirmar el responsable que operará pedidos y atenderá devoluciones/disputas.
4. Para live, el titular de Magenta debe completar su identidad y cuenta bancaria **dentro de Stripe**, y aprobar el modelo Standard/direct charges y responsabilidades económicas. Credenciales live y secretos de webhook se suministran solo en Vercel, nunca en chat ni formularios de tienda. El país legal se confirma antes de crear la cuenta, no se infiere del país de pruebas.
5. Aprobar la ventana y el plan de recuperación después de verificar respaldo restaurable y todos los bloqueos técnicos siguientes. Esta aprobación será separada del trabajo de Preview.

## Destinos verificados y migraciones exactas

Auditoría del 14/10/2026 19:33 UTC: `scripts/audit-magenta-launch.mjs`, exclusivamente transacciones `READ ONLY`. Producción: `zhtagqrzyovsrmsicaot`, **Cometa BRAND IA**, ACTIVE_HEALTHY; 81 versiones registradas. Marca autorizada: `magenta-fitwear`, ID `70880b54-b6fe-4775-bb39-c9ff19c47c39`. La otra marca `magenta-fit-wear` es distinta y queda excluida. Pruebas: `ephmrsjnpkcgddulvckj`, `magenta-preview-test`.

Aplicar únicamente estos archivos, en este orden, después de repetir la auditoría y revisar cualquier deriva:

| Archivo en `supabase/migrations/` | SHA-256 |
|---|---|
| `20261014120000_pos_imports_v1.sql` | `d65d64a6242e879b03f94da62f9db83c5d83b08009bcb2fddf2346be08993c1e` |
| `20261014140000_pos_product_delivery_save.sql` | `c24559391cc82b69f148e39bc6225be10da4a9f94e3aaf942530bbd5568a9b53` |
| `20261014160000_store_operations_m7.sql` | `d429865609ae5db82380e66cf8521952a50c6c37dba2f2ff6022afd485176dbd` |
| `20261014180000_store_order_presentation_m8.sql` | `4e89f219cf835d73e37ac6215ed9ec34156d89c4ac7500f14517355d39f91101` |
| `20261014200000_store_payment_accounts_m9.sql` | `35d61b823cb171cc7d321c1bfa2b065ce0dda893032ffc1c36dafcd408336cbd` |

El ensayo local partió de base vacía: baseline y 86 migraciones, importación/POS/compra, webhook firmado localmente, presentación y Connect. M9 se aplicó **solo en pruebas**, comprobando que pedidos, artículos, stock y configuración existentes quedaron idénticos. No ejecutar el baseline sobre producción ni usar instaladores de fixtures. La auditoría compara el ledger, no demuestra igualdad byte a byte de funciones históricas: revisar schema drift antes de autorizar la ejecución.

## Respaldo y recuperación

No se creó ni restauró todavía un respaldo productivo; no se afirma disponer de PITR. Antes de la ventana: Supabase → proyecto confirmado → Database → Backups: verificar plan, último punto recuperable, retención y procedimiento disponible, sin contratar servicios. Si hace falta respaldo lógico, preparar una conexión privada de lectura y usar `pg_dump --format=custom --file=<archivo-cifrado-en-destino-privado>` con `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` en el entorno privado (no contraseña en argumentos). Guardar versión PostgreSQL, hora, SHA-256 y alcance de roles/esquemas. Validar `pg_restore --list` y ensayar la restauración con `pg_restore --exit-on-error --no-owner --dbname=<base-aislada-privada> <archivo>` en un entorno de recuperación compatible, sin salida de correos/webhooks y con las dependencias de Auth/Storage verificadas. Ese ensayo no se sustituye por el bootstrap sintético.

Guardar también inventario y copia versionada de objetos Storage y configuración de buckets/políticas; el respaldo de base no incluye los archivos de Storage. Exportar metadatos de despliegue, alias, variables (custodia privada) y ledger, sin secretos en Git. El ensayo con datos reales **no va al backend público de Preview**: requiere entorno de recuperación privado, acceso restringido y autorización de custodia; no crear un servicio de pago automáticamente. Si no existe ese entorno o respaldo restaurable, bloquear lanzamiento. [Alcance de backups Supabase](https://supabase.com/docs/guides/platform/backups).

Recuperación preferida: cerrar nuevas compras de esta marca, conservar webhook y expiración para conciliar pedidos en tránsito, volver al despliegue compatible anterior y mantener tablas/eventos nuevos. No borrar pedidos ni restaurar stock hacia atrás mientras Stripe tenga pagos posteriores. Una restauración completa del proyecto compartido afecta a otras marcas: solo tras incidente aprobado, ventana global, conciliación de pagos/inventario desde el punto de recuperación y restauración de objetos. No presentar un rollback destructivo de las cinco migraciones como seguro.

## Pagos, permisos, webhook y expiración

Backend preparado: relación marca/cuenta/modo con RLS y RPC service-role autorizada, creación idempotente de cuenta **Standard**, onboarding alojado, capacidades consultadas al proveedor, activación explícita. Direct charges crea la sesión con contexto `stripeAccount` de Magenta; sin `transfer_data`, comisión de aplicación ni fallback live a la plataforma. El ID de destino queda congelado en cada pedido. Las condiciones de comisiones, reembolsos y disputas se deben aceptar antes de live. [Direct charges](https://docs.stripe.com/connect/direct-charges), [onboarding alojado](https://docs.stripe.com/connect/hosted-onboarding).

API administrativa: `/api/pos/online-store/payments?brandSlug=magenta-fitwear`; GET estado y POST `create` (country), `onboard`, `sync`, `activate`. Mantiene autenticación POS, administrador web, modo Retail y `settings.manage`; no concede roles globales ni usa IDs recibidos del cliente para vincular cuentas. Retorno/refresco se construyen desde `STOREFRONT_ADMIN_ORIGIN`. **Pendiente técnico antes de lanzamiento:** conectar botones y retorno/refresco automáticos de la pantalla Pagos a esta API, sin rediseñar Atelier; sustituir mensajes estáticos de “integración pendiente” y etiquetas fijas “Stripe test” por modo real. Actualmente el enlace test se prepara por script privado. Retornar desde Stripe no significa estar habilitado.

Webhook de cuentas conectadas: storefront `/api/stripe/connect-webhook`, eventos `account.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Secretos separados por modo y endpoint; firma sobre cuerpo original, cuenta, marca, sesión, importe y moneda comprobados; ledger idempotente. `/api/stripe/webhook` conserva el flujo de plataforma test existente. No hace falta otro webhook en administración para estos pedidos; COMU conserva sus endpoints independientes. El endpoint live Connect debe escuchar eventos de **cuentas conectadas**, no solo los de la plataforma. Acceso público únicamente al receptor firmado; no desproteger el panel. No publicar el bypass de Vercel de pruebas como configuración live.

Producción todavía no tiene `pg_cron`. Después de aprobación: instalar `pg_cron` en Supabase y programar job **`magenta-store-expiry`** cada minuto con comando `set role service_role; select public.store_orders_expire_m6('magenta-fitwear');`. Su autenticación es la conexión PostgreSQL del scheduler, no una clave pública ni una variable sin ejecutor. Verificar marca/ID, función y rol antes de instalar; inspeccionar job y últimas ejecuciones `succeeded`. En pruebas ya se comprobó el ejecutor remoto y la liberación idempotente, excluyendo pedidos pagados. No añadir cron de Vercel que active tareas globales. Para retirar el job específico: `select cron.unschedule('magenta-store-expiry');`, únicamente cuando no queden reservas pendientes de conciliación o exista ejecutor sustituto.

Storage productivo auditado: bucket `pos-products` existe público, límite 5 MB, MIME JPEG/PNG/WebP. Mantener políticas autorizadas por marca, no abrir escrituras públicas. Verificar upload del propietario, denegación de otra marca y lectura pública de recursos publicados. No subir recursos ZIP como fotografías de productos reales.

## Configuración de lanzamiento: solo después de aprobación

Vercel: proyectos existentes `cometa-os` (root `cometa-brand-ai`) y `magenta-controlled-preview` (root `apps/magenta-storefront`). No usar `scripts/configure-magenta-release.mjs`: su alcance histórico de variables compartidas no es el procedimiento de esta entrega. Preview sigue con test y `STOREFRONT_LIVE_ENABLED=false`.

En ambos proyectos, **scope Production únicamente**: `STOREFRONT_PAYMENTS_MODE=live`, `STOREFRONT_LIVE_ENABLED=true`, `STOREFRONT_STRIPE_LIVE_SECRET_KEY`, `STOREFRONT_STRIPE_LIVE_CONNECT_WEBHOOK_SECRET`, `STOREFRONT_ADMIN_ORIGIN=https://app.cometaos.com`. La clave de plataforma se custodia en servidor, no se pide al cliente. `STOREFRONT_STRIPE_LIVE_WEBHOOK_SECRET` solo si se mantiene un receptor de eventos live de plataforma; no reutilizar whsec test. No modificar claves COMU/billing ni sobrescribir variables compartidas incidentalmente.

Administración conserva su backend productivo y `APP_ORIGIN`; ampliar `OWN_STOREFRONT_URLS` preservando las otras marcas, asignando solo `magenta-fitwear` al dominio confirmado. Storefront: `STOREFRONT_SUPABASE_URL`, `STOREFRONT_SUPABASE_ANON_KEY`, `STOREFRONT_SUPABASE_SERVICE_ROLE_KEY` del proyecto confirmado, `STOREFRONT_BRAND_SLUG=magenta-fitwear`, `STOREFRONT_ORIGIN=https://<dominio-aprobado>`. Ningún service-role llega al navegador. Configurar DNS/TLS/orígenes y redirecciones exactos después de aprobar el dominio; no cambiar el dominio de administración ni los de otras marcas.

## Secuencia exacta que se someterá a aprobación final

1. Cerrar pendientes visuales, pantalla de onboarding/mensajes de modo y prueba completa Connect test. Verificar importación → producto/variante → venta POS → web → pago test destinado a cuenta conectada → webhook → pedido/aviso → stock. Mantener evidencia de cantidades y un único efecto por evento. Ensayar capacidades revocadas/reintentos y expiración. No sustituirlo por firma local.
2. Congelar commit y artefactos, repetir TypeScript/build/checks; auditar ledger/schema/destinos y comparar hashes. Registrar ID de despliegue previo y estado de datos. No ejecutar un push de migraciones genérico con versiones no revisadas.
3. Obtener aprobación explícita del lanzamiento, ventana, cinco migraciones, modelo de pagos, dominio y respaldo restaurado. Hacer backup fresco y validar recuperación privada. Si cambia el alcance, detener y actualizar la aprobación.
4. Mantener tienda cerrada a nuevas compras; aplicar los cinco archivos secuencialmente con registro de versión y transacciones propias de cada migración, contra referencia productiva confirmada. Comprobar RPC/RLS/permisos y que otras marcas no cambien. Instalar job específico de expiración y verificar reloj.
5. Incorporar contenido real y configuración cerrada de Magenta, sin importar fixtures. Revisar archivo de importación en dry-run, duplicados, SKU/variantes, ubicación y stock canónico; aplicar solo cantidades aprobadas sin reinicializar inventario existente. Preparar personal con permisos mínimos de marca.
6. Configurar variables live, onboarding del titular, capacidades de cobros/depósitos, destino vinculado y receptor Connect. Desplegar builds aprobados con tienda cerrada; asociar dominio autorizado y verificar TLS, secretos de servidor, acceso y webhook. No activar por nombre de variable ni por simple retorno del onboarding.
7. Con autorización específica para importe y medio real, ejecutar una compra controlada live y conciliar cuenta Stripe, evento, pedido y stock. Si se autoriza reembolso, realizarlo y conciliarlo realmente; no simularlo. Antes de esa autorización solo se pueden acreditar pruebas test. Confirmar proceso humano de envíos, cancelaciones y devoluciones.
8. Abrir ventas de Magenta únicamente con aceptación visual y operativa, datos reales, destino/capacidades confirmados y todos los controles anteriores en verde. Monitorizar webhook/reintentos, cron, reservas, stock y pedido/aviso en POS. Ante fallo, cerrar nuevas compras y aplicar la recuperación descrita sin perder eventos en tránsito.

Este documento es un procedimiento para aprobar, **no autorización ni certificado de producción lista**.
