# Cortesías POS desde Workspace

## Autoridad y comportamiento

Se reutiliza `pos_commercial_grants` y `pos_get_effective_commercial_access`. No se crea una autoridad paralela, suscripción pagada ni cobro. El plan de la cortesía procede de `pos_plans` activos; MAGENTA conserva el plan que tenía configurado.

`ends_at = infinity` representa sin vencimiento automático. El resolver devuelve `grant.endsAt = null` para este caso, compatible con el contrato existente. La ventana finita conserva su semántica y el trigger existente sigue rechazando solapamientos.

`pos_manage_complimentary_v1` comprueba administrador global activo, bloquea marca/cortesías y exige el ID esperado. Modificar revoca el registro anterior y crea uno nuevo en la misma transacción; retirar solo revoca. `pos_commercial_grant_events` registra actor, fecha, motivo y snapshots anterior/nuevo. Los grants históricos siguen inmutables. Un error o conflicto revierte toda la operación.

Solo service_role puede ejecutar la RPC y la API obtiene el actor desde `requireAdminWorkspace()`, nunca del body ni del correo. GET es pasivo y privado/no-store. PATCH verifica origen, marca, plan, fecha y motivo. El propietario conserva lectura de su acceso por el contrato POS billing y no puede otorgarse cortesías.

Ni vencimiento ni retiro borran inventario, productos, contenido, pedidos o reservas. El acceso vuelve a evaluarse con la suscripción/prueba habitual. Las guardas operativas POS existentes no se relajan; este bloque no rediseña la resolución de operaciones pendientes tras perder todo acceso comercial.

## Ubicación

Workspace → Negocios → ficha de marca → Módulos → **POS · Acceso comercial y cortesías**.

MAGENTA: https://app.cometaos.com/workspace/brands/magenta-fitwear

El control muestra acceso efectivo/origen, estado de cortesía, plan, motivo, vencimiento opcional, otorgar/modificar/retirar e historial con responsables. La cuenta del cliente sigue siendo `client` con membresía `owner`; no recibe administración global.

## Migración y preservación

Nueva migración: `20261012180000_pos_complimentary_workspace_v1.sql`. No se editan/reaplican migraciones anteriores. Antes de aplicar se respalda privadamente el resolver y todos los grants/suscripciones; se exige igualdad del cuerpo del resolver previo y hash de la migración ensayada. Después se comprueba que grants/suscripciones no cambiaron por instalar schema.

Recuperación: si falla la UI, conservar las tablas y las cortesías; puede retirarse el beneficio mediante RPC autorizada. No eliminar historial ni hacer rollback destructivo después de registrar beneficios. El despliegue anterior está retenido. La normalización `endsAt=null` evita enviar una fecha no finita a consumidores anteriores.

## Pruebas

- PostgreSQL desechable, esquema real respaldado y fixtures sintéticos: otorgar sin vencimiento, resolver prueba vencida, modificar vigencia, CAS concurrente (uno acepta/otro conflicto), retirar, vencimiento real pasado, owner/inactivo/anon/authenticated denegados, aislamiento y conservación de registros. PASS.
- TypeScript sin emisión PASS. Lint del control/API nuevos PASS. La página de suscripción conserva un error anterior `react-hooks/set-state-in-effect` en `load()` y warning `isCancelled`; solo cambió la presentación del beneficio.
- Regresiones: cierre COMU PASS; Food access 8 PASS; multirole cash 3 PASS. Estas regresiones son unitarias/mocks, no pruebas de equipos físicos.
- La certificación HTTP remota y el guardado del propietario se registran al finalizar; las pruebas SQL por sí solas no los certifican.

## Archivos

Migración nueva; API `src/app/api/admin/brands/[brandSlug]/pos-courtesy/route.ts`; control `src/app/workspace/brands/[brandSlug]/pos-courtesy.tsx`; integración en `brand-modules.tsx`; presentación `src/app/brand/[brandSlug]/pos/subscription/page.tsx`; código genérico de cortesía en `src/app/api/pos/billing/route.ts`.

Scripts: `test-pos-courtesy-local.mjs`, `apply-pos-courtesy-release.mjs`, `certify-pos-courtesy-release.mjs`; ampliación de `activate-magenta-20261012.mjs` para guardar/recargar borradores sin publicación ni cambios de producto.

## Corrección comprobada de transporte

El primer código de conflicto SQL `40001` pasó PostgreSQL directo pero agotó el tiempo en PostgREST real (probe de 20 segundos). Se conservó esa migración aplicada y se agregó `20261012181000_pos_courtesy_domain_conflict_v1.sql`: conflicto de dominio `P0001 / GRANT_CONFLICT`, sin modificar bloqueos, CAS ni datos. Probe remoto posterior: 285 ms, error explícito. La API lo traduce a HTTP 409. Nueva ejecución de la matriz SQL aislada PASS. No se afirma que el primer timeout fuera una duplicación: no hubo doble grant por clave desactualizada.

Backups privados adicionales del cuerpo RPC previo a la corrección; ambas migraciones registradas individualmente. No se reaplicó ninguna migración O1/N1/B1/M0/MAGENTA anterior.

## Resultado publicado

Despliegue READY: `https://cometa-3dp9s0xa2-cometa-os-s-projects.vercel.app`, alias `https://app.cometaos.com`. Build y TypeScript PASS.

HTTP remoto real, sin mocks de Auth/PostgREST:

- Administrador activo: consultar, otorgar, modificar, retirar e historial PASS en marca sintética identificada. Clave anterior después del guardado: HTTP 409 PASS. La cortesía sintética terminó retirada.
- Anónimo HTTP 401 y propietario HTTP 403 tanto lectura administrativa como otorgamiento: PASS. Administrador inactivo y vencimiento se probaron en PostgreSQL aislado.
- MAGENTA: cortesía activa sin vencimiento automático, plan preexistente conservado, motivo exacto `Cliente de Agencia COMETA — cortesía comercial`. El acceso efectivo es `commercial_grant`; el ciclo de suscripción continúa `trial_expired`, sin pago simulado.
- Sesión temporal real de guiasmagenta@gmail.com: POS/productos/Apariencia SSR, lectura canales, guardado y recarga de Ficha web y Apariencia PASS. Mismos borradores, publicación anterior conservada; ninguna publicación automática de producto.
- Productos, variantes, precios, existencias, sucursales y membresías de MAGENTA y la otra marca: comparación antes/después PASS. Cross-brand y Workspace global denegados al propietario.
- Sesiones generadas por OTP administrativo, sin enviar enlaces ni cambiar contraseñas; cierre de esas sesiones al finalizar. No equivale a una prueba manual de contraseña o navegador.

Evidencia técnica privada: `courtesy-sql-pass.json`, `courtesy-fix-pass.json`, `courtesy-http-pass.json`, `magenta-activation-evidence.json`. No contiene credenciales en la documentación versionable. Sin staging/commits/push, sin cobros ni comunicaciones; storefront y cierre de compras COMU conservados. Pendientes de pagos/envío/WhatsApp de MAGENTA no cambian por esta cortesía.
