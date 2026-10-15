# COMETA POS Signals Engine — `signals_v1`

Las señales son hechos deterministas, no recomendaciones ni contenido generado. El motor usa rangos semiabiertos `[start,end)`, tenant autorizado y evidencia JSON estructurada.

## Reglas V1

| Tipo | Categoría | Regla y datos mínimos | Severidad | Dedupe / resolución | Evidencia principal |
|---|---|---|---|---|---|
| `sales_drop` | risk | ventas netas ≤ -20%; ≥5 órdenes previas | high | evento por periodo | current/previous/delta, órdenes |
| `sales_growth` | trend | ventas netas ≥ +20%; ≥5 órdenes previas | medium | evento por periodo | current/previous/delta |
| `average_ticket_drop` | risk | ticket ≤ -15%; ≥5 órdenes previas | medium | evento por periodo | ticket current/previous |
| `average_ticket_growth` | opportunity | ticket ≥ +15%; ≥5 órdenes previas | medium | evento por periodo | ticket current/previous |
| `product_growth` | product | ≥3 unidades en ambos periodos y crecimiento ≥30% | medium | variante+periodo; top 5 | unidades y venta actual |
| `product_decline` | product | ≥3 unidades en ambos periodos y caída ≤-30% | medium | variante+periodo; top 5 | unidades y venta actual |
| `inventory_out_of_stock` | inventory | available ≤0, producto/variante activos e inventariables | high | ubicación+variante; auto-resolve | available/minimum/ubicación |
| `inventory_below_minimum` | inventory | 0<available≤minimum y minimum>0 | medium | ubicación+variante; auto-resolve | available/minimum/ubicación |
| `inventory_low_days` | inventory | velocidad>0 y cobertura ≤7 días; ≤2 high | medium/high | ubicación+variante; auto-resolve | cobertura, stock, unidades, ubicación |
| `inventory_stagnant` | inventory | stock valorizado >0 y cero venta en ventana | low | ubicación+variante; auto-resolve | stock, valor, unidades, ubicación |
| `customer_reactivation` | customer | ≥2 compras; 0.9–1.5× frecuencia media | medium | agregado diario | afectados, gasto histórico, top 10 IDs |
| `customer_at_risk` | customer | ≥3 compras; >1.5× frecuencia media | high | agregado diario | afectados, gasto histórico, top 10 IDs |
| `customer_identification_low` | risk | ≥10 ventas y tasa <50% | medium | evento diario | ventas/identificadas |
| `loyalty_near_visit_reward` | loyalty | progreso a una visita de meta | medium | campaña; auto-resolve | meta y afectados |
| `loyalty_unlock_available` | loyalty | unlocks available agrupados por campaña/reward | info | campaña+reward; auto-resolve | cantidad y reward |
| `payment_method_concentration` | trend | método ≥80% y ≥5 transacciones | info | método+periodo | método, importe, transacciones |
| `strong_sales_window` | trend | franja ≥1.5× promedio y ≥3 órdenes | info | día+hora+periodo; top 3 | día, hora, ventas, órdenes |
| `product_pair_opportunity` | opportunity | ≥5 órdenes juntas | low | par+periodo; top 10 | productos, coocurrencia, supports |

Los thresholds se concentran en defaults JSON dentro del generador; `pos_signal_rule_configs` permite desactivar o sobreescribir reglas comparativas sin obligar configuración por marca. Cada señal conserva `rule_version` específico.

## Reglas omitidas en V1C

- `loyalty_engagement_growth`: V1A no expone comparación equivalentemente periodizada de todos los contadores loyalty.
- `weak_sales_window`: no existe calendario de horarios abiertos; una hora sin venta no prueba debilidad.
- `customer_phone_coverage_low`: V1A no expone total de clientes como denominador estable.
- `product_no_sales` se representa como `inventory_stagnant`, que exige stock y cero ventas; no se duplica otra señal por la misma evidencia.
- `high_value_customer_inactive` y `new_high_value_customer`: requieren un universo completo de clientes/ventas; la RPC de ranking está limitada. Se posponen para evitar percentiles sesgados.

## Dedupe, vigencia y privacidad

Los eventos incluyen periodo en `dedupe_key`; los estados usan entidad estable y se resuelven cuando dejan de observarse. En inventario, la ubicación forma parte de `location_id`, `dedupe_key`, evidencia y contexto para impedir que dos sucursales colisionen. No se borran. Customer signals se agregan y sólo almacenan hasta 10 IDs en context; Reports nunca muestra teléfonos o emails.

`POST /api/pos/reports/signals` ejecuta el generador desde servidor después de autenticar y autorizar la marca; `GET` lista señales con filtros validados. Las RPC permanecen restringidas a `service_role`. Reports solicita la generación para el rango visible y presenta como máximo seis señales prioritarias, conservando estados de carga, error y vacío.

El resumen del generador calcula `generated` y `updated` con `run_started`, `created_at` y `last_seen_at`, por lo que contabiliza todas las reglas aunque una regla use una llamada `PERFORM`.

PULSAR podrá interpretar `title`, `evidence`, `context` y `rule_version`, pero V1C no almacena narrativas, recomendaciones, impacto estimado ni campañas.
