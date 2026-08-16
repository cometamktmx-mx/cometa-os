# COMETA POS V2B — Vertical Readiness Audit

Fecha de corte: 2026-08-14. Alcance: auditoría estática del repositorio; no se ejecutó SQL, no se consultaron datos productivos y no se realizaron pruebas manuales/E2E.

## Resumen ejecutivo

COMETA POS es hoy un POS retail funcionalmente avanzado, no una plataforma multivertical terminada. El flujo retail principal sí está conectado de UI a API y a una RPC transaccional: catálogo/variantes → carrito/scanner → caja abierta → pago → venta → descuento de inventario → loyalty → ticket consultable. Restaurante y servicios sólo tienen identidad de perfil y capability flags; no tienen los dominios operativos que requieren sus pilotos.

| Familia | Database | API | UI | Flow | Tests | Pilot readiness | Resultado |
|---|---:|---:|---:|---:|---:|---:|---|
| Retail / Moda | 88% | 82% | 78% | 72% | 68% | 65% | PARTIAL, piloto acotado viable tras P0 |
| Restaurant / Café | 18% | 10% | 8% | 5% | 5% | 5% | BLOCKER para restaurante; caja rápida solamente reutilizable |
| Services / Beauty | 12% | 8% | 6% | 3% | 3% | 3% | BLOCKER |

Los porcentajes no miden líneas de código. Pesan la existencia de un flujo utilizable y seguro de punta a punta.

## Criterio de clasificación

- **READY:** utilizable de punta a punta con persistencia, autorización y comportamiento coherente.
- **PARTIAL:** existe infraestructura real, pero falta una parte de integración, UI, persistencia, validación o prueba.
- **MISSING:** no existe implementación funcional relevante.
- **BLOCKER:** la ausencia o defecto impide un piloto seguro de esa vertical.

## Hallazgo crítico transversal

**BLOCKER CORE-1 — lifecycle/entitlements no se aplican en las APIs operativas (L).** V1B calcula `accessAllowed`, V1A entrega entitlements efectivos y `PosShell` muestra el banner, pero el shell siempre renderiza `children` y las rutas operativas sólo llaman `requirePosContext`. No hay usos productivos de `hasEntitlement` fuera de su definición. Una suscripción vencida o suspendida podría invocar directamente ventas, inventario, productos o loyalty. Evidencia: `src/app/brand/[brandSlug]/components/pos-shell.tsx`, `src/lib/pos/server.ts`, `src/lib/pos/entitlements.ts` y todas las rutas bajo `src/app/api/pos`. Impacto: el control comercial no es server-authoritative en la operación, aunque el resolver sí lo sea. Dependencia: un guard central de API reutilizable que preserve la superficie mínima de suscripción/activación.

## 1. Retail / Moda

### Venta

| Función | Estado | Evidencia y límite |
|---|---|---|
| Carrito, producto, variante, cantidad | READY | `pos/register/page.tsx` carga productos/variantes, controla cantidades y stock disponible. |
| Tallas y colores | READY para moda | Se guardan como atributos de variante; `products/page.tsx` renderiza definiciones dinámicas y el suite de variantes prueba atributos. No son un dominio separado. |
| Precio, descuento e impuestos | READY | UI calcula vista previa; `api/pos/sales/route.ts` sólo envía IDs/cantidad/descuento y `pos_complete_sale_v4` vuelve a resolver datos y totales server-side. |
| Cliente en venta | READY | Selector/búsqueda y loyalty se conectan al payload de venta. |
| Pago y cambio | READY | Efectivo, tarjeta, transferencia, wallet/other en backend; validación de cobertura y cambio. La UI expone efectivo, tarjeta, transferencia y otro. |
| Finalización e idempotencia | READY | `pos_complete_sale_v4`, `idempotencyKey` UUID estable por intento, fingerprint y replay/conflict en SQL. |
| Ticket/receipt | PARTIAL | La venta completada muestra confirmación; `/pos/sales` presenta detalle imprimible con `window.print()`. No hay plantilla térmica, envío digital ni dispositivo de impresión integrado. |

La RPC `pos_complete_sale_v4` bloquea filas relevantes, valida caja/tenant/stock/reward, inserta venta, partidas y pagos, descuenta inventario, registra movimientos y actualiza loyalty dentro de una transacción de función. Ésta es la pieza más madura del producto.

### Caja

| Función | Estado | Evidencia y límite |
|---|---|---|
| Apertura/cierre de turno | READY | API `cash-sessions` llama `pos_open_cash_session` y `pos_close_cash_session`; UI permite fondo inicial, efectivo contado, notas y muestra diferencia. |
| Balance e historial | READY | UI muestra esperado, contado, diferencia y cortes recientes. |
| Métodos de pago | READY | Persistidos en `pos_payments`; visibles y filtrables en ventas/reportes. |
| Movimientos manuales de caja | MISSING | No hay ruta, UI ni referencia a `pos_cash_movements`; sólo apertura, ventas y cierre. |

### Productos

| Función | Estado | Evidencia y límite |
|---|---|---|
| CRUD funcional | PARTIAL | Crear, listar, editar y activar/desactivar existen. No hay eliminación, intencionalmente segura; categorías sólo GET/POST, sin edición. |
| Imágenes | READY | Upload/delete de objeto con API dedicada; producto y variante aceptan `image_url`. Requiere validación manual de storage/policies. |
| SKU/barcode/precio/costo | READY | Campos persistidos, validación de duplicados y suite SQL de variantes. |
| Variantes/sizes/colors | READY | Variantes múltiples, atributos dinámicos, activación individual y orden. |
| Tipo/inventario/impuesto | READY | `product_type`, `inventory_mode`, `track_inventory`, unidad y `tax_rate` participan en producto/venta. |

### Inventario y barcode

| Función | Estado | Evidencia y límite |
|---|---|---|
| Stock por variante y ubicación | READY | `pos_inventory`, joins en APIs/UI y bloqueo/descuento en venta. |
| Entradas/recepciones | READY | Recepciones, presentaciones de compra, unidades/conversiones, costo e historial mediante `inventory-receiving`. |
| Ajustes/movimientos | READY | API llama `pos_adjust_inventory`; la venta y recepción generan ledger. |
| Stock bajo | READY reactivo | UI y analytics comparan disponible con mínimo. No hay notificación/predicción garantizada. |
| Scanner → variante correcta → carrito | READY | `product-scan` busca SKU/barcode activo y retorna variante/producto; registro selecciona inventario de la ubicación. |

### Clientes y loyalty

| Función | Estado | Evidencia y límite |
|---|---|---|
| Crear/buscar/identificar | READY | `customers` GET/POST y selector en caja. |
| Editar datos de cliente | MISSING | La API no expone PATCH/UPDATE y la UI no tiene flujo de edición. |
| Historial comercial | PARTIAL | Ventas permiten buscar por cliente y analytics agregan clientes; la ficha de cliente enfatiza loyalty/visitas, no presenta un historial completo de compras. |
| Puntos, niveles, visitas y rewards | READY | APIs, UI, tablas/RPCs y suites dedicadas; integración atómica con `pos_complete_sale_v4`. |
| Redemption/idempotencia | READY | Rewards se resuelven server-side, se rechazan campos derivados del cliente y el replay de venta evita duplicar efectos. |

### Reports e intelligence

**READY:** resumen de ventas, top productos/clientes, salud de inventario, loyalty, series/patrones, signals y UI de reportes. **PARTIAL:** PULSAR tiene API, persistencia, generación, historial y UI, pero no se encontró enforcement de `intelligence.pulsar`; el entitlement está formalizado pero no protege la ruta. Las suites de PULSAR son muy pequeñas y no sustituyen una prueba del flujo OpenAI/persistencia/UI.

### Diferencias por profile

- `fashion`: familia retail y defaults legacy para `variants`, `sizes`, `colors`, `direct_inventory`, `loyalty`. Es el mejor ajuste al producto existente.
- `retail`: comparte el motor general; las diferencias observables provienen de capabilities/defaults, no de otro flujo.
- `pharmacy`: se agrupa en retail, pero `batches` y `expiration_dates` sólo aparecen como labels/códigos de capability. No existen tablas de lotes/caducidad, API, UI, consumo FEFO ni pruebas. Resultado: **BLOCKER para piloto farmacéutico regulado**.

### Blockers retail

| ID | Evidencia | Impacto | Dependencia | Dificultad |
|---|---|---|---|---|
| RT1 / CORE-1 | Sin guard lifecycle/entitlement en APIs | Acceso operativo directo tras vencimiento/suspensión | Guard central server-side | L |
| RT2 | Sin movimientos manuales de caja | No registra retiros, ingresos ni gastos durante turno | Ledger/RPC/API/UI de movimientos | M |
| RT3 | Clientes sin edición | Datos incorrectos no se corrigen desde POS | PATCH seguro y UI | S |
| RT4 | Ticket sólo impresión del navegador | Operación térmica/digital no validada | Plantilla e integración de impresión | M |
| RT5 | `batches`/`expiration_dates` son flags | Pharmacy no controla lotes/caducidad | Dominio de lotes + inventario FEFO | XL |

Conclusión retail: **piloto fashion/retail sí es alcanzable**, con alcance controlado, validación manual de hardware/storage y cierre de RT1–RT4. Pharmacy no debe incluirse como piloto completo.

## 2. Restaurant / Café

### Estado funcional

| Área | Estado | Evidencia |
|---|---|---|
| Menú básico alimentos/bebidas | PARTIAL | El catálogo genérico puede crear productos vendibles, categorías, precio, impuesto y productos sin inventario directo. No hay semántica de menú. |
| Recipes | MISSING | `recipes` sólo aparece en onboarding y validación de catálogo legacy; no hay tabla, RPC, API ni UI. |
| Ingredients | MISSING | Igual: capability sin catálogo/stock/unidades/consumo/costo de ingredientes. |
| Modifiers | MISSING | No existen grupos/opciones, required/min/max, extra price ni snapshot en partida. Los atributos de variante no representan elecciones por orden. |
| Combos | MISSING | No hay componentes, selección, pricing ni consumo coordinado. |
| Tables | MISSING | No hay entidad de mesa, estado, asignación/movimiento/unión ni UI. |
| Order center / open tabs | BLOCKER | No existe ruta ni entidad `order/open_order/tab`; el carrito vive sólo en React y toda operación persistida es una venta finalizada. Recargar pierde el pedido. |
| Kitchen tickets | BLOCKER | `kitchen_tickets` es sólo capability; no hay ticket, estados, pantalla ni vínculo a orden. |
| Tips | MISSING | Sin campo en payload, pago, venta, ticket o reporte. |
| Takeaway/counter | PARTIAL | Puede vender productos y cobrar inmediatamente como retail. No hay folio/nombre de pedido ni envío a cocina. |
| Receipt restaurante | MISSING | El ticket genérico no puede expresar modifiers, extras, propina, mesa u orden. |

El ejemplo “Mesa 4 → guardar → reabrir → agregar → cocina → cobrar” no es posible. El carrito de `pos/register/page.tsx` no persiste antes del cobro y `pos_complete_sale_v4` crea directamente una venta completada.

### Blockers restaurant

| ID | Evidencia | Impacto | Dependencia | Dificultad |
|---|---|---|---|---|
| R1 | No hay orden persistente abierta | Imposible servicio por mesa o cuenta abierta | Modelo order/order_item y máquina de estados | XL |
| R2 | No hay mesas vinculadas a órdenes | Imposible operación de salón | R1 + tables API/UI | L |
| R3 | No hay modifiers persistidos | No se capturan instrucciones/extras | Modelo de grupos/opciones + snapshots | L |
| R4 | No hay recetas/ingredientes | Venta no consume insumos ni calcula costo real | Catálogo, unidades, stock y consumo transaccional | XL |
| R5 | No hay kitchen tickets | Cocina no recibe ni actualiza comandas | R1/R3 + KDS/ticket state | L |
| R6 | No hay propinas | Cobro/reporte incompleto para restaurante | Extensión segura de pagos/venta/reportes | M |
| R7 / CORE-1 | Sin enforcement comercial en APIs | Acceso fuera de lifecycle | Guard central | L |

Conclusión restaurant: **no apto para piloto de restaurante**. Un demo de cafetería de mostrador puede reutilizar catálogo/caja/venta inmediata, pero no debe presentarse como Restaurant Core.

## 3. Services / Beauty

### Estado funcional

| Área | Estado | Evidencia |
|---|---|---|
| Catálogo de servicios | PARTIAL | El producto genérico tiene `product_type`, precio, categoría, activo y puede vender sin inventario. No se encontraron duración, empleado elegible o entidad propia. |
| Staff | MISSING | Sin empleados POS, especialidades, disponibilidad, roles operativos o comisión. |
| Appointments | BLOCKER | No hay entidad/API/UI para cita, fecha, hora, duración, cliente, servicio, empleado o estados. |
| Calendar/conflicts | BLOCKER | Las apariciones de “calendar/schedule” pertenecen a MERCURY o Sales AI, no a POS de servicios. |
| Cita → caja → loyalty | BLOCKER | Sólo existe el último tramo: venta inmediata a cliente con loyalty. No hay cita que completar/enviar a caja. |
| Commissions | MISSING | Sin configuración, cálculo, persistencia ni reporte. |
| Recurring clients | PARTIAL | Historial agregado, loyalty por visitas, returning customers y signals aportan base analítica; no existe frecuencia por servicio/empleado ni workflow de rebooking. |

### Blockers services

| ID | Evidencia | Impacto | Dependencia | Dificultad |
|---|---|---|---|---|
| S1 | Sin appointments | No se puede operar una agenda beauty | Modelo y estados de cita | XL |
| S2 | Sin staff/disponibilidad | No se puede asignar ni evitar conflictos | Staff + horarios + reglas | L |
| S3 | Sin duración/calendario | No hay slots ni vistas día/semana | S1/S2 + calendar UI | L |
| S4 | Sin handoff cita→caja | Cobro no conserva contexto del servicio | S1 + enlace a venta | M |
| S5 | Sin comisiones | Nómina/incentivos manuales | Staff + sale attribution | L |
| S6 / CORE-1 | Sin enforcement comercial en APIs | Acceso fuera de lifecycle | Guard central | L |

Conclusión services: **no apto para piloto operativo**. Puede demostrarse cobro de un “producto tipo servicio” y loyalty, pero no agenda ni gestión beauty.

## 4. Arquitectura core compartida

| Componente | Reutilización | Estado |
|---|---|---|
| Auth, tenant y brand switching | Todas | READY; las 21 rutas POS auditadas usan `requirePosContext`, que autentica, resuelve slug y verifica `user_brand_access`. |
| Onboarding/perfil | Todas | READY como foundation; `pos_configure_business_profile` materializa defaults/overrides y V2A deriva family. |
| Subscription/lifecycle | Todas | PARTIAL; resolver/UI listos, enforcement operativo ausente. |
| PosShell/sidebar | Todas | READY como shell compartido; conoce family/capabilities, pero todavía no adapta navegación. |
| Customers/loyalty | Todas | Reutilizable, con edición e historial detallado pendientes. |
| Products/register/payments/cash | Todas con adaptación | Motor retail reusable para counter/service checkout; no sustituye orders ni appointments. |
| Reports/signals | Todas con nuevas dimensiones | Base sólida, hoy centrada en sale/product/variant/customer/inventory. |
| Receipts | Todas con templates | Genérico retail; requiere snapshots verticales para modifiers/order/tip/service/staff. |
| Notifications | Ninguna implementación POS específica encontrada | MISSING. |

No se recomienda fork de codebase. Se recomienda conservar auth, tenant, shell, customer, payment, sale final, loyalty y analytics, añadiendo agregados verticales antes de la venta final.

## 5. Inventario de database

La DDL base de varios objetos productivos no está en las migraciones versionadas visibles; su existencia se confirma por consumidores, `%rowtype`, tests/preflights y RPCs. Esto es deuda de trazabilidad, no prueba de ausencia en Supabase.

### Core/retail confirmado

| Tipo | Objetos |
|---|---|
| TABLE | `pos_products`, `pos_product_variants`, `pos_product_attribute_definitions`, `pos_categories`, `pos_inventory`, `pos_inventory_movements`, `pos_inventory_receipts`, `pos_inventory_receipt_items`, `pos_units`, `pos_unit_conversions`, `pos_variant_purchase_presentations`, `pos_locations`, `pos_registers`, `pos_cash_sessions`, `pos_sales`, `pos_sale_items`, `pos_payments`, `pos_customers`; tablas loyalty; tablas analytics/signals/PULSAR. |
| RPC | `pos_update_product_v2`, `pos_set_product_active`, `pos_adjust_inventory`, `pos_complete_inventory_receipt`, `pos_open_cash_session`, `pos_close_cash_session`, `pos_complete_sale_v4`; RPCs loyalty, analytics, signals y PULSAR. |
| TRIGGER | Triggers de `updated_at` para loyalty/signals; no se encontró trigger vertical restaurant/services/pharmacy. |
| VIEW | Ninguna view vertical creada por las migraciones inspeccionadas. |
| INDEX | Índices de loyalty, analytics, signals, reports y los constraints/índices base verificados por preflights. |
| TEST | Suites de variantes/inventario, sale/loyalty, reports/signals/PULSAR, entitlements/lifecycle/profile family. |

### Inventario vertical

| Vertical | TABLE | RPC | TRIGGER | VIEW | INDEX | TEST |
|---|---|---|---|---|---|---|
| Restaurant | Ninguno de recipe/ingredient/modifier/combo/table/order/kitchen/tip | Ninguno | Ninguno | Ninguna | Ninguno | Sólo preservación de capability codes en V2A |
| Services | Ninguno de appointment/booking/staff/employee/commission/availability | Ninguno | Ninguno | Ninguna | Ninguno | Sólo profile family/capability existente |
| Pharmacy | Ninguno de batch/lot/expiration | Ninguno | Ninguno | Ninguna | Ninguno | Sólo preservación de capability codes en V2A |

## 6. Inventario API

Todas las rutas siguientes tienen guard de tenant `requirePosContext`.

| Endpoint | Métodos | Dependencia/consumidor | Completitud |
|---|---|---|---|
| `/api/pos/bootstrap` | GET | Perfil, suscripción, ubicaciones, cajas, productos, inventario; dashboard/register/cash | READY, contrato amplio; sin enforcement |
| `/api/pos/profile` | GET/POST | Catálogos/defaults/capabilities y RPC canónica; onboarding/shell | READY foundation |
| `/api/pos/products` | GET/POST/PATCH | Productos/atributos/RPCs; products/register/inventory | READY salvo delete |
| `/api/pos/product-images` | POST/DELETE | Storage; products | PARTIAL hasta prueba real de storage |
| `/api/pos/product-scan` | GET | Variantes; register | READY |
| `/api/pos/categories` | GET/POST | Categorías; products | PARTIAL sin update |
| `/api/pos/inventory` | GET/POST | Stock/adjust RPC; inventory | READY |
| `/api/pos/inventory-receiving` | GET/POST | Recepciones/unidades/conversiones; inventory | READY, compleja y sin suite propia visible |
| `/api/pos/cash-sessions` | GET/POST | Open/close RPC; cash/register | PARTIAL sin movimientos manuales |
| `/api/pos/sales` | GET/POST | `pos_complete_sale_v4`; register/sales | READY retail |
| `/api/pos/customers` | GET/POST | Customers; customers/register | PARTIAL sin edit |
| `/api/pos/loyalty` | GET/POST | Múltiples tablas/RPCs; loyalty/customers/register | READY |
| `/api/pos/reports*` | GET/POST | Analytics/signals/PULSAR; reports | PARTIAL por entitlement/enforcement y pruebas externas |
| `/api/pos/subscription` | GET/POST | Lifecycle/entitlements/transitions; shell/subscription | READY comercial |

No se encontraron endpoints huérfanos claros dentro de POS; sí se encontraron **dominios completos ausentes**: orders, tables, kitchen, recipes, ingredients, modifiers, combos, tips, appointments, staff, schedules y commissions.

## 7. Inventario UI

Páginas reales: home POS, register, cash, sales, products, inventory, customers, loyalty, reports, settings, onboarding y subscription. Todas consumen APIs reales; no se detectaron páginas verticales ni links rotos añadidos. `pos-module-placeholder.tsx` existe como componente, pero no constituye una vertical.

- Retail: UI extensa y operativa; sus principales huecos son movimientos de caja, editar cliente y receipt especializado.
- Restaurant: sólo puede reutilizar products/register/cash/sales; no hay order center, floor plan, KDS o configuradores de receta/modifier.
- Services: sólo puede reutilizar products/register/customers/loyalty; no hay agenda, staff o ficha de cita.
- Pharmacy: no hay lot/expiry UI.

## 8. Cobertura de pruebas

| Área | Cobertura existente | Falta |
|---|---|---|
| Venta + loyalty | Suites SQL V4B de 36 casos y suites loyalty/visitas | API/component/E2E, hardware, impresión, concurrencia real |
| Variantes/inventario | Preflight y suite SQL de variantes/inventario | Recepción end-to-end, scanner físico, storage de imágenes |
| Reports/signals | Suites SQL de analytics/signals | UI/E2E y semántica por vertical |
| PULSAR | Postflight/suite mínimos | Mock/contract del modelo, entitlement y E2E |
| Product platform | V1A 36/36, V1B 45/45, V2A 35/35 reportados | Enforcement de rutas operativas |
| Restaurant | Ninguna prueba funcional | Todo el dominio |
| Services | Ninguna prueba funcional | Todo el dominio |
| Pharmacy | Ninguna prueba funcional | Lotes/caducidad |

Un build o suite de schema no demuestra que scanner, impresora, caja física, cocina o agenda sean utilizables. Antes de piloto se requiere smoke test manual por rol/tenant y E2E de los caminos críticos.

## 9. Oportunidades WOW separadas de blockers

### MUST FOR PILOT

- Guard central lifecycle/entitlements.
- Retail: movimientos de caja, edición de cliente, ticket validado y runbook de operación.
- Restaurant: open orders, modifiers, mesas/takeaway, kitchen tickets; inventario por receta sólo si el piloto promete costeo/stock.
- Services: staff, disponibilidad, appointments/calendar y handoff a caja.

### WOW FOR LAUNCH

- Retail: predicción de stock bajo, product pairing y recovery opportunities usando analytics/signals existentes.
- Restaurant: tablero de cocina en vivo, tiempos por estación y sugerencias de upsell/modifiers.
- Services: recurrencia inteligente, recordatorios, rebooking y rendimiento de staff.
- Compartido: receipt digital, insights por cliente y recomendaciones contextuales.

### POST-LAUNCH

- Restaurant: split/merge avanzado de mesas, cursos, múltiples estaciones y costeo sofisticado.
- Services: comisiones complejas, recursos/cabinas y paquetes/membresías.
- Pharmacy: FEFO, trazabilidad regulatoria, alertas y devoluciones por lote.

## 10. Recomendación de secuencia

1. **P0 transversal: Commercial Access Enforcement** antes de declarar cualquier piloto seguro.
2. **V2C Retail Hardening** corto: capitaliza el flujo ya funcional y permite un piloto real rápido.
3. **V2D Restaurant Core**: construir primero order aggregate, modifiers y kitchen path; no intentar recetas avanzadas antes del flujo operativo.
4. **V2E Services Core**: appointments/staff/calendar como agregado propio y luego conexión al checkout compartido.

El orden no significa terminar un ERP por vertical. Retail puede pilotear primero; Restaurant y Services al 24 de agosto deben ser demos verticales honestas o pilotos extremadamente acotados, no productos completos.

## 11. Riesgos y límites de esta auditoría

- No se consultó Supabase; objetos base pueden existir fuera de las migraciones locales. Sin embargo, búsquedas exhaustivas de consumidores no encontraron integración vertical oculta.
- No se ejecutó build, SQL ni E2E por alcance. La clasificación READY significa flujo estáticamente conectado y respaldado por suites relacionadas, no certificación de producción/hardware.
- Algunos archivos usan `any` y rutas muy grandes; es deuda existente y no se corrigió.
- El código visible muestra texto con mojibake en salidas de PowerShell; debe validarse visualmente en navegador antes de piloto, sin asumir que el archivo servido está corrupto.

