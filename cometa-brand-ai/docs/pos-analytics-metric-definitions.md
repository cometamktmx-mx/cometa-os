# COMETA POS Analytics — `reports_v1`

## Contrato común

- Fuente comercial: `pos_sales` con `status = 'completed'` y `sold_at >= date_from AND sold_at < date_to`.
- Tenant: todas las consultas filtran `brand_slug`; `location_id` es opcional y se valida contra la marca.
- Tiempo: se usa `pos_locations.timezone`. Sin ubicación, todas las sucursales deben compartir timezone; de lo contrario la RPC rechaza la consulta.
- Dinero: `numeric`; no se convierte a punto flotante. Divisiones usan cero seguro y retornan `null` cuando una razón no está definida.
- Comparación: periodo anterior de idéntica duración, inmediatamente anterior. `deltaPercent` es `null` si el valor anterior es cero.
- `pos_get_analytics_periods` resuelve, en timezone local, today, yesterday, últimos/anteriores 7 y 30 días, month-to-date y el mismo tiempo transcurrido del mes anterior. Las RPC aceptan además cualquier rango custom semiabierto.

## Ventas

| Métrica | Definición y fórmula | Fuente / casos límite |
|---|---|---|
| `grossSales` | Suma de `pos_sales.subtotal`. | Ventas completed. Es importe antes de descuentos. |
| `discountTotal` | `discount_total + loyalty_discount_total`. | Incluye descuento manual y loyalty. |
| `netSales` | Suma de `pos_sales.total`. | Total final cobrado, impuestos incluidos según política de la sucursal. |
| `taxTotal` | Suma de `tax_total`. | Snapshot fiscal de venta. |
| `ordersCount` / `completedSalesCount` | Número de ventas completed. | Otros estados se excluyen. |
| `itemsSold` | Suma de `pos_sale_items.quantity`. | Admite cantidades decimales. |
| `averageTicket` | `netSales / ordersCount`. | Cero cuando no hay órdenes. |
| `averageItemsPerTicket` | `itemsSold / ordersCount`. | Cero cuando no hay órdenes. |
| `minTicket`, `maxTicket` | Mínimo/máximo `sale.total`. | Cero sin ventas. |
| `cogs` | Suma `sale_item.unit_cost * quantity`. | Confiable porque el costo está congelado en el item. |
| `grossProfit` | `netSales - taxTotal - cogs`. | Beneficio bruto antes de gastos operativos. |
| `grossMarginPercent` | `grossProfit / (netSales-taxTotal) * 100`. | `null` si venta neta sin impuesto es cero. |

Refund analytics queda pendiente: el esquema versionado no contiene un ledger de refunds/returns que permita restarlos con trazabilidad.

## Clientes

- `uniqueCustomers`: clientes distintos identificados en ventas del periodo.
- `identifiedSales` / `anonymousSales`: ventas con/sin `customer_id`.
- `customerIdentificationRate`: `identifiedSales / completedSales * 100`; `null` sin ventas.
- `newCustomers`: cliente cuya primera compra histórica cae dentro del periodo.
- `returningCustomers`: cliente que compra en el periodo y tiene una compra anterior a `date_from`.
- `repeatCustomerRate`: clientes con al menos dos compras dentro del periodo / clientes únicos del periodo.
- `customerSalesTotal`: venta neta atribuida a clientes.
- `averageCustomerSpend`: `customerSalesTotal / uniqueCustomers`.
- Ranking: órdenes, gasto, ticket medio, primera/última/anterior compra, días desde última compra, lifetime orders/spend y loyalty actual.
- Intervalos de recompra: promedio y mediana de días entre compras históricas; `null` con menos de dos compras.

## Productos y categorías

- Agrupación por producto y variante usando snapshots de `pos_sale_items`.
- `unitsSold`, `salesTotal`, `discountTotal`, `ticketCount`, `averageUnitPrice` y porcentaje de ventas.
- Orden permitido: `sales_total`, `units_sold`, `ticket_count`.
- `currentStock` es estado actual, no snapshot del periodo.
- Categorías usan `pos_products.category_id` y `pos_categories`; categoría nula se conserva como dato de calidad.

## Inventario

- `availableQuantity = quantity - reserved_quantity`.
- `inventoryCostValue = availableQuantity * variant.cost`; es valoración actual, no histórica.
- `lastReceiptAt`: último movimiento `receipt`.
- `averageUnitsSoldPerDay = unitsSoldPeriod / max(duración_en_días,1)`.
- `daysOfStockEstimate = availableQuantity / averageUnitsSoldPerDay`; `null` con velocidad cero. Es ritmo observado, no predicción.

## Pagos y sucursales

- Pagos se agrupan por el valor real `pos_payments.payment_method`.
- `percentageOfSales = payment amount / netSales * 100`; `null` con net sales cero.
- Sucursales: ventas, órdenes, ticket medio, items y clientes por `location_id`.

## Loyalty

- Miembros totales/activos: estado actual de `pos_loyalty_members`.
- Puntos ganados/canjeados: ledger `pos_loyalty_transactions` en el periodo; redeem se presenta como magnitud positiva.
- Rewards por puntos: `pos_loyalty_redemptions` unido a la venta completed del periodo.
- Tiers: distribución dinámica por tier, sin nombres hardcodeados.
- Visitas: qualifies del ledger, miembros progresando, unlocks creados/redimidos y disponibles.
- Unlocks disponibles son estado actual; el resto usa timestamps del periodo.

## Series, patrones y pares

- Series: buckets `hour`, `day`, `week`, `month`, validados contra lista cerrada y calculados en timezone de sucursal.
- Patrones: día ISO (1 lunes–7 domingo) y hora local (0–23).
- Pares: productos distintos presentes en la misma venta; el orden canónico es UUID menor/mayor para no duplicar A+B/B+A. Support es porcentaje de órdenes que contienen cada producto.

## Calidad de datos

Incluye ventas con/sin pago, identificación de cliente, productos sin categoría, clientes sin contacto, clientes con teléfono/email, consentimientos reales `marketing_consent` y `wallet_consent`, y variantes inventariables sin filas de stock. No existe un campo específico confirmado de WhatsApp opt-in, por lo que no se reporta.

## Snapshots

`pos_analytics_snapshots` guarda documentos compactos `reports_v1` para periodos daily/weekly/monthly/custom. Es caché/auditoría y nunca sustituye tablas operativas. Contiene summary, top 10 productos/clientes, inventario agregado, loyalty y calidad; no altera ventas ni decisiones operativas.
