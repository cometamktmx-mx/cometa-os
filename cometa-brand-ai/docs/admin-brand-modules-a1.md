# A1 — módulos administrativos y tienda propia

Fecha: 2026-10-10. Base: `feature/comu-v1`, HEAD
`e11383a1864aee98736834a8ca8c4bb7c7cb7bca`.

## Decisión y alcance

`brand_online_store_access` es la única autoridad comercial de tienda propia.
Referencia `brands.id`; no duplica marca, usuario, propietario ni membresía.
Ausencia = `disabled`, revisión 0. Una fila puede estar `enabled` o `suspended`.
No se guardan aquí publicación, dominio, catálogo, pedidos ni conexiones.

El resolver POS de entitlements depende de suscripción/acceso efectivo POS; usarlo
para este servicio haría que una suspensión POS afectara la tienda. La autoridad
aditiva evita ese acoplamiento sin reemplazar OS, POS ni COMU.

La ficha existente conserva navegación y marketing. Módulos consulta:

- OS: `getBrandOsAccess` / `brand_os_access`.
- POS: `getPassivePosProductAvailability`, RPC comerciales de lectura existentes.
- COMU: seller de la marca y estado de su storefront; no crea listings.
- Tienda: nueva autoridad; error de consulta = estado no verificable, sin botón.

GET/PATCH `/api/admin/brands/[brandSlug]/modules` usan `requireAdminWorkspace` y
`Cache-Control: private, no-store`. La página conserva `force-dynamic`.
No se consulta Stripe, WhatsApp ni envíos. No se utiliza `createAdminBrand`.

## Autorización y concurrencia

Solo `user_profiles.role=admin` y `status=active` cambia el servicio. El actor viene
de la sesión, nunca del body. SQL vuelve a comprobar el perfil activo y bloquea
la marca, incluyendo la primera activación. La revisión esperada debe coincidir;
un cambio concurrente devuelve 409 y obliga a refrescar. No hay actualización
optimista. Ante error de red/escritura se pide refrescar antes de otro cambio.

La RPC tiene EXECUTE solo para service_role; authenticated/anon no pueden nominar
actores. Tablas con RLS, sin lectura/escritura directa para esos roles. service_role
solo recibe SELECT sobre las tablas: escribe a través de la RPC SECURITY DEFINER.
La misma transacción actualiza estado/revisión y agrega actor, marca, estado
anterior/nuevo, fecha y revisión a `brand_online_store_access_events`. Un no-op
con revisión vigente no genera otro evento; una revisión obsoleta siempre falla.

`resolveOnlineStoreAccess` autentica y comprueba perfil/marca/membresía:

| Resultado | Regla |
|---|---|
| canChangeService | Administrador global activo |
| canAdminister | Administrador global activo o membresía activa owner/admin |
| canStartNewOperations | Permiso anterior + marca activa + servicio enabled |
| canResolveExistingOperations | Permiso anterior + registro previamente habilitado, incluso suspended |
| publication | not_implemented |

Los roles owner/admin reutilizan los nombres canónicos de `user_brand_access`;
manager/cashier/inventory/editor/viewer no obtienen administración de tienda.
No se crea owner para el administrador global. Ausencia de fila no concede
operación comercial. Errores de perfil/membresía/servicio lanzan error, no acceso.

**Límite:** `canResolveExistingOperations` es una precondición, no autorización de
un pedido o pago concreto. Los futuros consumidores deben verificar marca,
propiedad, estado e idempotencia del recurso. No hay consumidores de checkout,
reservas o devoluciones de tienda propia en A1. Suspender no borra datos.

## Migración y certificación

`supabase/migrations/20261010160000_brand_online_store_access_a1.sql` es aditiva.
SHA256: `12b075514065c7a6da3eb5eed84b2f4c4ec5df4ee08b1447a2cd66db15d063b2`.
No se aplicó a una base existente ni se registró en su ledger.

`node scripts/test-brand-modules-a1-local.mjs` verifica Docker local y su puerto
54322 antes de cada ejecución. Crea una base `cometa_a1_<timestamp>` con template0,
copia solo el esquema public/auth/storage de postgres y aplica el archivo A1
literal mediante `psql -f`. Restaura extensiones como M0 y adapta exclusivamente
el dump para evitar la creación duplicada de public/default privileges. No
transforma el contenido de la migración. Fixtures sintéticos; triggers normales
en operaciones probadas. Elimina exclusivamente la base desechable al terminar.

Ejecución aprobada: `cometa_a1_1791665865471`, eliminada al terminar.

- PostgreSQL real: PASS autorización, denegación owner/inactivo/anon, grants/RLS,
  aislamiento de marcas, independencia OS/POS/COMU/membresías, suspensión POS,
  concurrencia CAS, no-op y auditoría persistida protegida de escritura directa.
- HTTP loopback con handlers reales y SQL real: PASS admin/owner/viewer/inactivo/
  anónimo, rechazo cross-brand en resolver, revocación, ausencia/error de lectura,
  no-store en éxitos/errores, origin ajeno, actor inyectado, revisión concurrente,
  no creación de membresía admin, acceso de resolución tras suspensión.
- Abrir ficha: consultas de lectura, sin proveedor ni cambios en snapshots de
  capability/auditoría/OS/POS/membresías verificados antes/después de GET.
- Identidad de sesión y transporte Supabase/PostgREST se inyectan en el harness;
  las consultas y las RPC se ejecutan con service_role sobre PostgreSQL real.
  El contexto POS del adaptador también se inyecta. No certifica cookies,
  PostgREST ni una sesión Next.js integral.
- Primer intento: SQL PASS; fixture de revocación rechazado correctamente por
  POS_LAST_OWNER_REQUIRED. Se agregó otro owner sintético y se repitió con éxito;
  no se cambió esa protección de producto.
- `node scripts/test-brand-modules-a1-ui.mjs --evidence`: PASS SSR real del
  componente, estados disabled/enabled/suspended/unknown/inactive y navegación.
- `node scripts/test-admin-workspace-visual-v2.mjs`: PASS.
- `node scripts/test-access-center-v2.mjs`: FAIL preexistente. La aserción global
  contra `deleteUser` detecta el rollback de creación de equipo. Reproducido
  leyendo todos sus archivos desde HEAD en memoria; no se modificó el test ni
  Access Center.
- TypeScript sin emisión, lint dirigido y diff-check: verificados en esta entrega.

## Evidencia y límites visuales

`docs/evidence/a1/brand-modules-desktop.png` muestra el componente real renderizado
con datos sintéticos y CSS Tailwind generado. Es un preview aislado, **no** captura
de workspace con sesión real. El HTML reproducible se conserva junto a la imagen.
Se comparó con `comu-seller-dashboard-approved.png`: crema/verde, tarjetas claras,
jerarquía y espaciado; se conserva el workspace existente. No se certificó una
interacción de navegador ni el responsive en dispositivos reales.

## Pendientes separados

- Aplicación de A1 en cualquier base existente requiere autorización posterior.
  Mientras falte la migración, la ficha muestra tienda no verificable y sin control.
- Sitio público, publicación por canal, dominio, pagos y checkout no implementados.
- Cookies/PostgREST, recuperación durable de claves y RUN legacy siguen como
  requisitos previos al checkout MAGENTA. M0/M0.1 no se modificaron.
- El riesgo de suspensión POS que impide cerrar caja sigue en su bloque propio;
  A1 no cambia sus guardas ni añade controles de suspensión POS.
- El alta histórica que convierte al admin en owner queda fuera de A1: se trabaja
  exclusivamente con marcas existentes.
- No hay habilitación de producción, correos, cobros, staging, commit ni deploy.
