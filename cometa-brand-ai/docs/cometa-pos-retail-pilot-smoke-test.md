# Cometa POS — Retail/Moda Pilot Smoke Test

Duración objetivo: 30–45 minutos. Ejecutar con una marca de prueba aislada y conservar los folios generados como evidencia.

| # | Acción | Resultado esperado |
|---:|---|---|
| 1 | Crear una marca nueva y elegir el perfil `fashion`. | El onboarding termina en `/pos`; bootstrap devuelve familia retail y capabilities de fashion. |
| 2 | Revisar el estado de suscripción. | Trial vigente visible, 15 días y acceso operacional habilitado. |
| 3 | Crear una categoría “Playeras”. | La categoría aparece disponible al crear productos y en el filtro de caja. |
| 4 | Crear un producto simple con SKU, barcode, precio y costo. | Guarda sin duplicados y aparece vendible. |
| 5 | Crear un producto con 2 colores × 3 tallas. | Existen seis variantes inequívocas, cada una con SKU/barcode propio. |
| 6 | Subir/reemplazar una imagen y probar una URL rota en un dato de prueba. | Preview correcto; una URL rota muestra placeholder, nunca el icono roto del navegador. |
| 7 | Recibir inventario para el producto simple y las seis variantes. | Stock y movimientos aumentan por la cantidad recibida. |
| 8 | Simular timeout/retry de la misma recepción conservando su key. | Misma recepción/folio; stock, partidas y movimientos no se duplican. Una key nueva sí crea otra recepción. |
| 9 | Abrir caja con fondo inicial conocido. | Un solo turno abierto; se muestra caja, sucursal y fondo. |
| 10 | Escanear el producto simple. | Se agrega directamente una unidad y el foco vuelve al scanner. |
| 11 | Escanear dos variantes distintas y repetir una de forma rápida. | Se agrega la variante exacta; la repetición controlada incrementa cantidad. Registrar comportamiento del scanner USB usado en piloto. |
| 12 | Cobrar una venta sin cliente en efectivo. | Venta completada, cambio correcto, inventario disminuye una vez y caja conserva consistencia. |
| 13 | Pulsar “Imprimir ticket”. | Abre la venta exacta, renderiza `ThermalReceipt` y muestra el diálogo de impresión. |
| 14 | Iniciar otra venta, abrir selector de cliente y crear uno con nombre/teléfono. | Se crea una sola vez, queda seleccionado y el checkout no se abandona. |
| 15 | Completar una venta con ese cliente. | `customerId` correcto; la venta aparece en su historial. |
| 16 | Revisar resultado postventa. | Muestra puntos ganados, saldo y tier cuando aplican. |
| 17 | En otra venta, seleccionar un reward elegible. | Descuento correcto, un solo redemption y feedback visible. |
| 18 | Comparar inventario antes/después. | Cada variante vendida disminuye exactamente una vez; ninguna variante distinta cambia. |
| 19 | Abrir Clientes → detalle del cliente. | Muestra compras completadas, folio, fecha, partidas, total mostrado, última compra, loyalty, tier, visitas y unlocks. |
| 20 | Editar nombre/teléfono/email/notas. | Guarda tenant-scoped; duplicados muestran mensaje humano y no alteran ownership/loyalty. |
| 21 | Cerrar caja ingresando efectivo contado. | Se muestran esperado, contado y diferencia; el turno queda cerrado una sola vez. |
| 22 | Revisar Reportes. | Ventas, productos y totales del smoke aparecen sin gráficas rotas. |
| 23 | Revisar Signals. | La superficie carga; si aún no existen señales muestra un empty state válido. |
| 24 | Cambiar la suscripción de la marca de prueba a suspended y probar URL/API directa. | PosShell muestra bloqueo; APIs operacionales devuelven 403 y subscription permanece accesible. Restaurar mediante el flujo administrativo aprobado. |
| 25 | Cambiar a otra marca autorizada. | Se limpian cliente, lifecycle, entitlements, capabilities, carrito y datos de la marca anterior. |

## Evidencia mínima

- Capturas de producto simple y matriz 2×3.
- Receipt IDs/folios de primera llamada, replay y nueva key.
- Folios de venta sin cliente y con cliente.
- Ticket impreso/PDF.
- Stock antes/después y cierre de caja.
- Resultado de `audit-pos-commercial-access`, `audit-pos-inventory-idempotency` y `audit-pos-retail-readiness`.

## Decisiones post-pilot

- Movimientos manuales de caja requieren diseño DB/RPC auditado; no son P0 para este piloto si se adopta la regla operativa de no registrar retiros/gastos en POS.
- El sale engine acepta un arreglo de pagos, pero la UI V2C mantiene un solo método por venta. Split payment queda post-pilot.
- Scans concurrentes dependen del comportamiento del scanner USB real; V2C preserva autofocus, búsqueda exacta y recuperación de foco sin introducir una cola especulativa.
