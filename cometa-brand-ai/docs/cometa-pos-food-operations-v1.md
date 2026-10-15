# COMETA POS — Food Operations V1

Implementación local del recorrido Salón → mesa → pedidos → cocina → entrega → caja → cierre. No se aplicó la migración a una base remota. La demostración persistida y la suite SQL todavía requieren una base local desechable con las migraciones previas. No se encontró PostgreSQL/psql; Docker Desktop sí está instalado, pero su motor local no está en ejecución (no existe el pipe `dockerDesktopLinuxEngine`).

## Reutilización y límites

- Food Access V1 sigue resolviendo PIN, bloqueo, cambio de operador, fullscreen y administración. Su gate no se modificó.
- Catálogo: `pos_products`, `pos_product_variants`, `pos_categories`, `pos_inventory`. Se muestran variantes activas de productos vendibles, con inventario directo o sin inventario. Recetas/componentes siguen fuera de este bloque.
- Seguridad: `requirePosOperationalAccess`, `getPosMode`, `requireStaffSession`; cobro exige `pos.sales` y `pos.cash`. El host autenticado se distingue del operador físico. RPCs exclusivas de `service_role` revalidan sesión, host, marca, perfil, rol y sucursal dentro de la transacción.
- Cobro: `pos_complete_sale_with_staff_v1` → motor financiero V4 existente. La cuenta referencia `pos_sales`; partidas financieras y pagos permanecen en `pos_sale_items` y `pos_payments`. No se creó otro sistema de pagos.
- Rutas: la operación permanece dentro de `/brand/[brandSlug]/pos`; no cambia Brand OS ni Retail.

## Modelo

```text
pos_food_tables 1 ─── N pos_food_checks (una cuenta no cerrada por mesa)
pos_food_checks 1 ─── N pos_food_items
pos_food_checks 1 ─── N pos_food_tickets
pos_food_tickets 1 ── N pos_food_items (solo partidas del envío)
pos_food_checks 0..1 ── 1 pos_sales ── N pos_payments
pos_food_events: actor físico + host + acción + payload + resultado + timestamp
```

La mesa es un recurso estable de una sucursal. Sus estados son derivados: `AVAILABLE` si no tiene cuenta abierta; `PAYMENT_PENDING` si se pidió cobro; `READY` si algún ticket está listo y no entregado; `ORDER_SENT` si hay tickets sin entregar; `OCCUPIED` en los demás casos. Una partida en borrador tiene `ticket_id = null`. Enviar crea una secuencia nueva y asigna exclusivamente borradores no anulados. Los envíos anteriores conservan sus partidas, notas y cantidades.

Los tickets siguen `PENDING → PREPARING → READY`. La entrega agrega `served_at` y `served_by`, sin perder el estado ni los timestamps de cocina. Un mesero distinto puede entregar. La cuenta admite `table_id` opcional para futuros tipos COUNTER, TAKEAWAY y PICKUP; este V1 solamente abre DINE_IN. Las partidas guardan variante y configuración; los tickets reservan `station_code` sin implementar modificadores ni estaciones.

Las notas y cantidades pueden editarse antes del envío; quitar una partida la anula y conserva su registro. Cada transición tiene evento inmutable desde la API. No existe borrado de cuentas, envíos ni partidas históricas en el flujo.

## Concurrencia y dinero

- Bloqueo de fila de mesa + índice parcial único impiden dos cuentas abiertas en la misma mesa.
- Todas las mutaciones de una cuenta, incluidas cocina y caja, bloquean la misma cuenta primero.
- Versiones de cuenta/partida rechazan envíos y ediciones obsoletos. Enviar no puede absorber silenciosamente cambios hechos desde otra terminal.
- Clave UUID de operación + bloqueo transaccional + evento único por marca hacen idempotentes los reintentos. La clave queda ligada al actor, host, acción y payload. El cliente conserva la clave ante resultados de red ambiguos.
- Pedir cobro exige productos enviados y entregados. Congela la toma de pedidos. Salón puede devolverla a servicio mientras no se haya cobrado; una carrera con caja se resuelve por bloqueo y versión.
- Cobrar toma la sucursal desde la cuenta y resuelve caja/turno de esa sucursal. La clave financiera canónica es el ID de cuenta. Venta, pago, auditoría, cierre y liberación se confirman en una sola transacción; un fallo hace rollback de todo.
- Precios, moneda e impuestos proceden de catálogo/sucursal. Cálculos SQL usan la precisión y fórmulas canónicas por partida. El cliente no puede enviar totales ni precios.
- El motor V4 cobra a precio vigente: Food bloquea precios durante el cobro y rechaza discrepancias con las partidas. Un cambio administrativo de precio/impuesto/disponibilidad durante el servicio requiere revisión administrativa; V1 no implementa revalorización ni excepciones de precio.
- Inventario mantiene la política canónica: se descuenta al cobrar. No hay reservas Food al enviar a cocina. Una reducción de existencias durante el servicio puede impedir el cobro hasta corregir inventario. No hay doble descuento ni stock negativo por doble cobro.
- Métodos iniciales: `cash`, `card`, `other`. Efectivo exacto; tarjetas/otros registran un pago recibido, sin integración con adquirente. Sin propinas, división de cuenta, nuevos descuentos, devoluciones ni cancelación de cuenta en este V1.

## Demostración tras aplicar las migraciones en un entorno autorizado

1. Configurar una sucursal activa, caja y catálogo canónico con Cappuccino, Sandwich y Cheesecake, precios y existencias adecuados. Usar productos `direct` o `none`.
2. Disponer de operadores ADMIN, WAITER, KITCHEN y CASHIER con PIN. ADMIN/MANAGER también pueden operar cocina y caja según la política existente.
3. ADMIN entra con PIN. En Salón, seleccionar sucursal si hay varias y agregar `Mesa 4`.
4. Abrir Mesa 4 para dos personas. El operador actual queda como responsable.
5. Agregar Cappuccino, aumentar a dos, agregar Sandwich. Guardar notas antes de enviar.
6. Pulsar **Enviar a cocina**. Cambiar a KITCHEN en otra terminal o mediante el gate existente.
7. Cocina ve el envío y pulsa **Iniciar preparación**, luego **Marcar listo**.
8. Salón se actualiza cada cinco segundos. Un WAITER abre Mesa 4 y pulsa **Entregado**.
9. Agregar Cheesecake y enviar el segundo pedido. Verificar dos envíos independientes; preparar, marcar listo y entregar el segundo.
10. Salón pulsa **Solicitar cobro**. CASHIER ve la mesa en Caja. Si no hay turno abierto, usar **Abrir caja** para el flujo canónico existente.
11. Seleccionar turno y método. Pulsar **Cobrar y liberar mesa** después de recibir el pago.
12. La mesa queda libre. La venta aparece en el historial canónico; los registros Food conservan apertura, creación, envío, preparación, listo, entrega y cierre con sus operadores/timestamps.

Sin la migración, la operación muestra un error recuperable y no simula mesas ni ventas locales. Un fallo de sincronización oculta la superficie de datos hasta recuperar una lectura válida. No se agregaron datos demo a la aplicación.

## Archivos de este bloque

Existente modificado (ya estaba sin seguimiento antes de Food Operations V1):

- `src/app/brand/[brandSlug]/components/pos-food-access.tsx`: conecta el nuevo componente operacional y conserva el gate/topbar previo.

Archivos nuevos:

- `src/app/brand/[brandSlug]/components/pos-food-operations.tsx`
- `src/app/api/pos/food/route.ts`
- `src/lib/pos/food-shared.ts`
- `src/lib/pos/food-server.ts`
- `scripts/test-pos-food-operations-v1.mjs`
- `supabase/tests/pos_food_operations_v1.sql`
- `docs/cometa-pos-food-operations-v1.md`

Migración nueva, solamente local:

- `supabase/migrations/20260914120000_pos_food_operations_v1.sql`

El inventario inicial registró 44 archivos sucios/no rastreados. Se verificaron hashes SHA-256 contra ese inventario: los otros 43 permanecen idénticos. Incluyen shell/sidebar/topbar, layout, API de ventas/caja/bootstrap, staff, onboarding, workspace, proxy, scripts y migraciones previas. No hubo commit, push, reset, restore, checkout, limpieza ni migraciones remotas.

## Verificación

- `node --test scripts/test-pos-food-operations-v1.mjs`: 13 pruebas aprobadas. Incluye matriz completa de roles/acciones del endpoint real, aislamiento de contexto, sesión, perfiles, validación, errores seguros, reintentos UI, borradores/notas, estados de mesa y render KDS. Usa dobles de acceso/RPC; **no ejecuta PostgreSQL**.
- Seis suites existentes solicitadas: Food shell, Food Access server, staff foundation, Food onboarding, self-service access y catálogo canónico: aprobadas.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: aprobado.
- ESLint dirigido a todos los archivos TS/TSX y el script nuevos/modificados: aprobado sin advertencias.
- `git diff --check`: aprobado. Git emite avisos de conversión LF/CRLF sobre cambios preexistentes, no errores de whitespace.
- `npm.cmd run build`: aprobado. El primer intento no tuvo acceso a Google Fonts; el reintento autorizado compiló y generó las 52 páginas estáticas.
- `supabase/tests/pos_food_operations_v1.sql`: creada y revisada, **no ejecutada** por falta de PostgreSQL/psql y de un motor Docker local activo. Contiene fixtures sintéticos, aserciones y rollback para abrir/doble apertura, aislamiento de marcas/sucursales, borradores, dos envíos, roles KDS, tiempos/entrega por otro mesero, precios cambiados, pago canónico, doble cobro y mesa libre. Las carreras simultáneas entre conexiones siguen pendientes de prueba de integración.
- UI revisada mediante render y controladores de eventos con fixtures. No se ejecutó la demostración visual con datos persistidos reales ni una prueba táctil en navegador.

No se corrigió deuda global ajena al bloque. La migración y las pruebas SQL deben ejecutarse y revisarse en un entorno de prueba antes de usar Food Operations con cuentas reales.
