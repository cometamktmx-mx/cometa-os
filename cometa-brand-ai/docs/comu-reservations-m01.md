# M0.1 — reintentos HTTP de reserva y orden

Base: `feature/comu-v1`, HEAD `e11383a1864aee98736834a8ca8c4bb7c7cb7bca`.
Prerequisito: migración M0. No se crea otra migración ni se modifica/aplica
M0 sobre ninguna base existente. Los tres archivos M0 se conservan intactos.

## Reproducción

`node scripts/test-comu-reservations-m01-local.mjs --reproduce` levanta una
base nueva con el mismo aislamiento del runner M0, instala M0 únicamente
allí y usa el helper de reservas de HEAD anterior a M0.1.

Mediante HTTP local real, el comprador reserva las 20 piezas del fixture.
La segunda solicitud con la misma clave devuelve 409
COMU_INSUFFICIENT_STOCK, aunque la RPC ya puede reconocer la reserva.
El script completo reproduce primero el fallo y luego prueba el código
del working tree contra la misma base desechable.

## Identidad y payload

La lectura inicial usa requireComuBuyerRead: identidad autenticada, perfil
activo y Buyer existente, sin aprovisionarlo por reconocer una operación.
El carrito se consulta por buyer_id; conocer una clave ajena produce un
conflicto genérico sin devolver ID, contenido ni snapshots del otro Buyer.

El payload de reserva es la selección guardada en el carrito del servidor:
seller, listing, variant listing, cantidad, PIECES/RUN, run ID y run count.
Cambiar esa selección bajo una clave existente produce 409
COMU_IDEMPOTENCY_CONFLICT. La marca se conserva mediante seller/listing;
no se admite una marca ni una identidad suministradas por el navegador.
El contrato sigue siendo multivendedor COMU, no un carrito single-brand.

Para operaciones nuevas se mantienen el cálculo de precios del servidor,
las validaciones de variantes, disponibilidad y la RPC. Se añade solamente
`reservationRequestV1` al JSON pricing_snapshot existente, preservando sus
campos monetarios. Contiene la selección original; no precios del cliente.

Para replay se compara esa selección sin leer catálogo, disponibilidad ni
precios actuales. Después se envían a la RPC M0 los items persistidos, con
su sucursal, cantidades y snapshots originales. La RPC conserva la última
autoridad de propietario/payload y transacción. Tras un error o una carrera
se vuelve a buscar la operación ganadora y se repiten las validaciones.

Legacy PIECES sin metadata puede comprobarse por sus items persistidos.
Legacy RUN sin selección original se rechaza conservadoramente: no se
reconstruye la intención histórica desde una corrida que pudo cambiar.
Cambiar/vaciar el carrito constituye un payload distinto. Un replay de
checkout que proporciona explícitamente reservationId usa esa reserva como
selección inmutable y no depende de que el carrito siga igual.

## Órdenes y consumidor

Checkout compara Buyer, reserva, addressId y shippingMode. La dirección se
resuelve server-side al crear; reintentos usan el snapshot del pedido,
aunque la libreta haya cambiado. Para llamadas legacy sin addressId se
compara el snapshot completo. El modo solicitado se guarda en
`shipping_address_snapshot.checkoutRequestV1.shippingMode`, sin schema nuevo.

Las órdenes ya completas/terminales retornan por la RPC antes de recalcular
precios, preparar envío o exigir un provider disponible. Una operación nueva
sigue bloqueada en Production mientras no exista shipping certificado.
El gate de Production continúa antes de cualquier escritura de checkout;
ahora puede haber lecturas de identidad y replay antes de ese gate.

Dos preparaciones concurrentes no sobrescriben el snapshot de envío ganador:
la escritura comprueba buyer, PAYMENT_PENDING y shipping_quote_id NULL. La
cotización candidata que pierde esa comparación se elimina por su propio ID
y order_id; nunca se elimina una cotización histórica o la ganadora.

El consumidor checkout conserva la clave de intento en un ref mientras
permanecen addressId y shippingMode. Al perderse una respuesta después de
persistir, el segundo clic evita la comprobación de stock propia y repite
la clave. El servidor vuelve a validar el carrito. No inicia un nuevo pago
al recibir una orden cuyo estado ya no es PAYMENT_PENDING.

EXPIRED/CANCELLED/RELEASED retornan como operaciones terminales: no se
reactivan. Una reserva terminal sin orden no autoriza crear una orden nueva.

## Pruebas y partes simuladas

Comando completo: `node scripts/test-comu-reservations-m01-local.mjs`.

Resultado: PASS, exit 0, última base `comu_m0_1791664722088`, eliminada al
finalizar. SHA256 del dump de esquema fuente de esa ejecución:
`3d128a9b2a68900c261c4f89da5fc7d1a90b749467d0d7f3ddfda90f97600877`.
Pricing safety y B1 Node: PASS. TypeScript --noEmit --incremental false
--pretty false: PASS. ESLint dirigido y git diff --check: PASS.

El runner copia solo esquema desde postgres al nuevo `comu_m0_<timestamp>`
y verifica contenedor Supabase local y puerto publicado 54322 antes de cada
operación. No copia datos ni escribe en postgres. Ejecuta SQL por psql dentro
del contenedor y elimina exclusivamente la base nueva al finalizar.

Reales: HTTP loopback, Request/Response, route handlers y helpers compilados
desde el código actual, consultas persistidas, constraints/triggers y RPC M0,
dos solicitudes concurrentes y comprobaciones de filas/stock/snapshots.

Simulados explícitamente:

- Autenticación: header solo del servidor de pruebas identifica usuarios
  fixture; se consulta su Buyer/perfil en SQL. No es prueba de cookies/JWT.
- Transporte Supabase: builder de pruebas convierte las consultas en SQL;
  no prueba PostgREST ni su cache. Ejecuta como postgres en la base desechable,
  no certifica RLS adicional a M0.
- Hydration/precio del carrito: usa el precio persistido del fixture en vez
  de ejecutar todos los joins del carrito. La regresión de pricing separada
  ejecuta el cart helper real con mocks de datos, sin debilitar aserciones.
- Cotización de envío y PaymentIntent: mocks; ningún proveedor real.
- React/render: para la pérdida de respuesta se ejecuta la función real
  prepareOrder extraída del componente con estado UI simulado; sus llamadas
  de checkout sí atraviesan HTTP y PostgreSQL reales.

Matriz cubierta:

- Reserva idéntica con stock restante cero: mismo ID, sin nueva hydration.
- Reserva y orden concurrentes: un ID por clave; un snapshot de envío final.
- Payload distinto, otro Buyer y seller/marca cambiada: conflicto sin filtración.
- Anonymous: 401.
- Nueva clave sin stock: rechazo.
- Precio posterior y dirección editada: importes y dirección originales.
- Reserva vencida/cancelada y orden cancelada: sin resurrección ni nuevo envío.
- Respuesta perdida: mismo intento UI, una orden, precio original.
- Pricing retail/wholesale, moneda/cents y gate Production: harness corregido.
- B1 Node y frontera de cancelación: regresión dirigida.

El harness de pricing tenía el import ./buyer-orders ausente. Se agregaron
stubs que fallan si esas funciones se invocan, y el soporte mínimo a las
lecturas/CAS nuevos. Se conserva la prohibición de Stripe y de escrituras
en el escenario Production; se permite la lectura de identidad previa.

## Límites y pendientes antes de MAGENTA

- M0 debe estar instalado en el destino futuro antes de activar M0.1.
  Aquí no se aplicó a ninguna base existente.
- No se certifican Next dev con cookies reales, PostgREST ni Stripe/shipping
  de Production. No se modifica el protocolo SQL M0 ni su resolución manual
  de pagos tardíos.
- La clave UI vive durante el montaje del componente. Recuperación de un
  intento perdido tras cerrar/recargar la página requiere persistencia de
  la clave en el cliente o un contrato de recuperación adicional.
- Un crash entre insertar la cotización candidata y completar el CAS puede
  dejar una cotización no referenciada; el retry no duplica reserva/orden ni
  reemplaza un snapshot ya fijado. No se añadió un janitor ni SQL adicional.
- No reconstruir RUN legacy sin evidencia histórica. Definir su tratamiento
  antes de ofrecer recuperación universal de pedidos antiguos.

Siguiente bloque: definir el adapter MAGENTA por marca/sucursal/canal sobre
inventario POS y este contrato, con idempotency keys durables por pedido.
No se implementan sitio, checkout MAGENTA ni tablas comerciales aquí.

## Estado final del repositorio

HEAD e índice sin cambios. Comparación SHA256 de los 20 archivos que ya
estaban modificados y los tres archivos M0: los 23 permanecen idénticos.
M0.1 modifica cinco archivos previamente limpios y agrega este documento
y dos runners. Estado total: 25 M, 41 entradas ??, índice vacío.
