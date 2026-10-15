# M0 — ciclo transaccional de reservas POS / COMU

Fecha: 2026-10-10. Base del trabajo: `feature/comu-v1`, HEAD
`e11383a1864aee98736834a8ca8c4bb7c7cb7bca`.

## Alcance y destino

Se crea `20261010120000_comu_reservation_lifecycle_m0.sql`. No se modifican
migraciones históricas, TypeScript de producto, POS, Mobile, Food, Finance,
auth, HUB ni schema comercial de MAGENTA. No hay staging ni commit.

`node scripts/test-comu-reservations-m0.mjs` descubre un único contenedor
`supabase_db_*` mediante el named pipe local de Docker Desktop y comprueba
su publicación del puerto PostgreSQL 54322 antes de cada operación. Usa
`psql` dentro de ese contenedor, por socket local, contra una base nueva
`comu_m0_<timestamp>`, creada con template0. No es una conexión TCP directa
a 127.0.0.1:54322: ese puerto identifica el contenedor local autorizado.

De `postgres` se obtiene **solo un pg_dump de esquema**, sin datos, de
public/auth/storage. Se preparan extensiones en la base nueva y se restauran
funciones, triggers, constraints, políticas y grants actuales. Solo para
compatibilidad del restore se omiten la creación duplicada de public y
ALTER DEFAULT PRIVILEGES del dump. No se modifica SQL certificado de
migraciones anteriores. La migración M0 se transfiere literalmente en un
archivo temporal y se ejecuta con `psql -f`, ON_ERROR_STOP.

Los fixtures sintéticos se insertan en la base nueva, en una transacción
con triggers suspendidos para el setup. Las operaciones probadas corren
con triggers normales. Los vencimientos se simulan cambiando únicamente
el deadline del fixture; no se ajusta stock manualmente ni se simulan
devoluciones. Se elimina exclusivamente la nueva base al terminar, incluso
ante error. No se ejecutan Stripe, email, cron, HTTP externo o migraciones
en la base principal. No se comprueba aquí el ledger de migraciones de
otros entornos ni un despliegue desde cero de todas las migraciones.

## Fallos reproducidos antes del parche

Sobre las definiciones finales copiadas del PostgreSQL local:

1. Crear orden pone su reserva en COMMITTED. Cancelar la orden pendiente
   falla con COMU_RESERVATION_ALREADY_COMMITTED y revierte la cancelación.
2. Vencer el deadline y ejecutar el expirador deja la orden PAYMENT_PENDING
   y reserved_quantity=1: el expirador anterior ignora COMMITTED.
3. Reutilizar una clave de reserva con otro comprador devuelve la reserva
   original; cambiar cantidad con esa clave también devuelve el original.
4. Reutilizar una clave de orden con dirección distinta devuelve la orden
   original, sin conflicto.
5. El Buyer propietario puede hacer UPDATE directo de su reserva a
   CANCELLED sin decrementar reserved_quantity. Reproducido dentro de
   BEGIN/ROLLBACK usando role authenticated y auth.uid() del fixture.

Reproducción aislada: `node scripts/test-comu-reservations-m0.mjs --reproduce`.
El runner verifica estos fallos antes de aplicar M0; deliberadamente espera
un baseline anterior a M0 y fallará si la fuente ya contiene la corrección.

Huellas MD5 de pg_get_functiondef del baseline observado:

| Función | MD5 |
|---|---|
| comu_cancel_order | f812e66ec755e83d5de72434e1bd1891 |
| comu_create_order_from_reservation | dcc7599e102bd05971159e5c649a5e4e |
| comu_expire_inventory_reservations | b2e4e9d239e228949d5917cb0f3be96e |
| comu_mark_payment_succeeded | 0596873beab8624aeece679cc1176d3e |
| comu_release_inventory_reservation | 430cb56445b31bd4b53670849f36bae9 |
| comu_reserve_inventory | d2110492b72afb5e9822398e53da961e |
| pos_complete_sale_v4 | 633d2d6c0f067960ecf33e3371781d36 |

El runner imprime además el SHA256 del dump y la base exacta de cada ejecución.

## Corrección

- Reserva/orden: serializar claves, validar propietario y payload semántico
  antes del replay; conflicto explícito COMU_IDEMPOTENCY_CONFLICT. El nonce
  session_key no participa porque el consumidor actual lo regenera.
- Payload de reserva: seller/listing/variant listing/variante/sucursal,
  cantidad y pricing snapshot; orden de líneas normalizado. Orden:
  propietario, reserva, moneda y shipping_address_snapshot.
- Impedir crear una segunda orden para la misma reserva con otra clave.
- Cancelación/liberación, expiración y confirmación de pago comparten un
  advisory lock transaccional por reserva. Después: orden, pagos, reserva,
  inventario ordenado por sucursal/variante. El expirador usa try-lock y
  omite comandos en curso; una ejecución posterior los revisa.
- Revisar deadline con clock_timestamp después de esperar el lock.
- Liberar COMMITTED solo con orden pendiente/cancelada/vencida, sin pago
  confirmado y sin ledger de consumo. COMMITTED huérfana o con múltiples
  órdenes se rechaza; no se adivina una reparación de datos.
- Estados terminales no vuelven a decrementar. Pagados y consumos ya
  registrados jamás se liberan por antigüedad. Inconsistencia de stock
  provoca rollback completo, sin clamp que oculte el error.
- Pago tardío conserva PAYMENT_RECEIVED_AFTER_EXPIRY / REQUIRES_REVIEW.
  No vuelve a consumir stock ni registra un refund ficticio. Su resolución
  operativa/proveedor queda fuera de M0.
- Buyer pierde INSERT/UPDATE/DELETE directo en reservas/items; su política
  de reserva pasa a SELECT. Conserva las RPC autorizadas y lectura por RLS.
- Los cuerpos anteriores de reserva, orden y pago se conservan renombrados
  como comu_m0_*_impl, para mantener precios, snapshots, contabilidad y los
  triggers O1/N1. No tienen EXECUTE para public/anon/authenticated/service_role.
  Solo el wrapper security definer puede llamarlos. No hay endpoint público
  alternativo para saltarse el protocolo. Confirmar pago es service_role;
  anon no puede invocar comandos.

## Certificación ejecutada

Última ejecución completa: `comu_m0_1791662126976`, exit 0, base eliminada
al finalizar. SHA256 del dump fuente de esa ejecución:
`68e2be9a5c0691ffcd5a80f3fc6a7606f582f7101c7295d3fb8a3e58170f6619`.

PostgreSQL real, sesiones independientes y RPC Retail real:

- Cancelar dos veces una orden pendiente libera una vez.
- Expirar COMMITTED pendiente libera stock y cambia orden a EXPIRED.
- Propietario y payload idénticos devuelven el mismo resultado.
- Cantidad/dirección distintas, otro propietario y otra clave para la
  misma reserva se rechazan sin devolver operaciones ajenas.
- Reintentos concurrentes de reserva generan una sola reserva.
- Buyer autorizado puede reservar/cancelar/liberar por RPC; otro comprador
  no puede crear orden, cancelar ni liberar la reserva ajena.
- Marca B no puede atribuirse un listing de A; sucursal de B no puede
  usarse para la variante de A. Liberar en una sucursal no modifica la
  reserva de la otra sucursal real del fixture.
- UPDATE directo authenticated y acceso a funciones internas DENIED.
- Confirmación repetida consume una sola vez y emite un ORDER_PAID.
- Orden pagada con deadline vencido permanece protegida frente a expiry
  repetido y cancelación.
- Pago/cancelación con ambos órdenes de adquisición del lock: pago ganador
  mantiene PAID; cancelación ganadora conserva cancelación y pago en revisión.
- Pago que espera hasta después del deadline no consume; expiry concurrente
  respeta el lock. Se prueba también expiry ganador y doble confirmación
  concurrente.
- Última unidad: reserva COMU frente a pos_complete_sale_v4. Exactamente
  uno gana; el perdedor debe fallar por falta de inventario, no por un error
  incidental del fixture.
- Pago tardío tras expiry y compra pagada de otro comprador: ningún consumo
  adicional, ninguna fila de refund y reservas restantes preservadas.

Regresiones Node ejecutadas (mocks solo para estas fronteras de aplicación,
no como sustituto de la certificación SQL):

- test-comu-orders-o1-presentation-local.mjs: PASS.
- test-comu-buyer-orders-b1-node.mjs: PASS, incluida frontera de cancelación.
- test-comu-pricing-safety-local.mjs: FAIL preexistente del harness:
  `Forbidden dependency: ./buyer-orders`. No se modifica para ocultarlo.
- TypeScript --noEmit --incremental false --pretty false: PASS.
- ESLint dirigido al runner M0: PASS.
- git diff --check: PASS (warnings de conversión CRLF preexistentes).

No se ejecuta test-comu-pos-shared-inventory-local.mjs: está fijado a
database=postgres y aplica SQL antes de su transacción de fixtures.

## Límites y siguiente bloque

La certificación es del contrato SQL sobre el esquema instalado observado,
con regresiones Node dirigidas. No equivale a certificar checkout HTTP,
Stripe real, despliegue limpio, toda la suite POS/Food/Mobile, Finance ni la
resolución operativa de pagos tardíos. El helper TS de reservas todavía
selecciona disponibilidad antes del RPC: un retry de la API cuando toda la
existencia está reservada puede fallar antes de llegar al replay SQL. No se
declara ese recorrido HTTP certificado en M0.

No aplicar esta migración automáticamente a bases existentes. Revisar antes
reservas históricas huérfanas/inconsistentes. No deshacer M0 reinstalando el
expirador defectuoso ni borrar órdenes/reservas para revertir una activación.

Siguiente bloque recomendado: adapter de reservas por canal, con contrato
de reintento HTTP y autorización marca/sucursal, pruebas contra este protocolo
y feature flag que cierre nuevas entradas mientras permite consultar,
confirmar o liberar operaciones existentes. MAGENTA debe reutilizar el
inventario POS; todavía no crear sitio, checkout ni tablas comerciales.

## Preservación

HEAD e índice sin cambios. Los 20 archivos previamente modificados y las
35 entradas untracked previas se conservan. M0 añade únicamente la migración,
el runner y este documento. No se modifica ningún archivo preexistente.
