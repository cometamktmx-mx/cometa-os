# Retail V1 — cierre operativo

## Definiciones y fuentes

- Venta finalizada: registro canónico en pos_sales con estado completed o partially_refunded, por sold_at. La liquidación/conversión explícita de una cajita crea esa venta; entrega es otro evento. Notas y cajitas activas no son ventas. Los importes parcialmente reembolsados conservan su snapshot original y los ajustes monetarios se muestran aparte; no se presenta una venta neta de devoluciones inexistentes en la fuente.
- Recepción de dinero: pos_payments.created_at para venta directa; pos_retail_order_payments.created_at para depósito inicial, abono y pago de liquidación. Concepto y método son dimensiones distintas. La vista pos_retail_money_v1 no almacena ni duplica dinero. Excluye copias prepaid de la liquidación y movimientos de caja ligados a un pago de cajita. Las retenciones no son nuevas entradas.
- Efectivo esperado: fondo inicial + movimientos efectivos en efectivo con signo. Transferencias, tarjeta, monedero y otros métodos se muestran por separado. Fondo inicial no es ingreso comercial. Corte cerrado conserva expected_cash/count/difference históricos; diferencias con reconstrucción actual se advierten sin reescribir el cierre.
- Comparaciones: periodo anterior de igual número de días; base cero no produce porcentaje. Límites de fechas en zona de sucursal, final exclusivo al día siguiente. Si las sucursales tienen distintas zonas o monedas, debe seleccionarse una sucursal.
- Caja del cliente: por pagar=max(total-pagado,0), disponible=max(pagado-total,0), calculados por caja sin compensar clientes. Estado activo incluso con cero productos o depósito superior al total. Plazo original, reserva por diferencia y entrega explícita se conservan.
- Fábrica: descuento histórico separado solo cuando la solicitud original permite identificarlo; otros descuentos y descuentos antiguos sin evidencia se etiquetan juntos, sin inferir precios actuales. Magenta conserva mínimo 50 por modelo y $10 por pieza.
- Utilidad BRUTA estimada: venta sin impuestos menos costo histórico, solamente en renglones con costo positivo. El cero heredado no demuestra costo cero. Se informa cobertura por renglones; lo desconocido no genera utilidad ficticia. No incluye gastos ni es utilidad neta.
- Inventario: físico/reservado/disponible actuales; movimiento absoluto registrado en el periodo, no necesariamente venta ni entrega. Sin movimiento significa sin movimientos registrados, no prueba de ausencia de actividad anterior.

## Operación y permisos

Reportes requiere permiso del host pos.reports.view y operador REPORTS. Verificar transferencia requiere además CASH; reverso de movimiento manual requiere SETTINGS y turno abierto en la misma caja física. La verificación es manual, con referencia, motivo, operador e historial; no consulta bancos ni cambia reservas/activación previas. Reversar un movimiento crea una compensación vinculada y no elimina el original ni modifica cortes cerrados.

Los seguimientos internos requieren SELL, responsable de la misma marca/sucursal, nota y fecha. No envían WhatsApp, correo ni mensajes. Se muestran pendientes/vencidos y se conserva cumplimiento. Las horas del seguimiento se capturan explícitamente en la zona del equipo. La lista general limita a 500 y lo avisa.

Modificar contenido reutiliza el selector publicado. Reserva/libera diferencias atómicamente, conserva pagos, requiere motivo al reducir y confirma cambios de importe antes de guardar. Historial nuevo incluye cantidades anteriores; registros antiguos se muestran como snapshot sin inventar un antes. Configuración allow_active_content_changes se acepta en nuevas condiciones. ordinary_returns_allowed=false únicamente en Magenta; no existe un flujo ordinario de devoluciones POS que se haya eliminado o activado con este cierre. Correcciones administrativas no son cambios comerciales de compras finalizadas.

## Separación FOOD

Compartidos: rutas cash-sessions y cash-movements, wrapper reports/page, función pos_close_cash_session y columna nullable de vínculo de reverso. Tipo POS resuelto en servidor; Retail usa pos_retail_cash_command_v1, FOOD conserva pos_cash_command_v2. La función de cierre añade una rama únicamente para perfil Retail. Endpoints de reportes/seguimientos y funciones de cajitas rechazan FOOD. Mesas, comandas, cocina, impresión, pagos FOOD y sus roles no se modifican.

## Verificación

- TypeScript sin emisión y build Next de producción.
- PostgreSQL desechable: 49/50/51, identidad del modelo, notas sin reserva, reservas concurrentes, pago/edición contra vencimiento, caja vacía y $278 con $500, disponible $222, total $3000, abonos duplicados, liquidación y entrega, retención sin ingreso nuevo, separación de fechas de depósito y venta, verificación manual idempotente, reverso compensatorio, cierre concurrente idempotente y diferencia de conteo.
- Reportes contrastados con sumas de pagos fuente. CSV con BOM, importes precisos y protección de fórmulas. Costos ausentes y base comparativa cero.
- API: acceso, operador, aislamiento de marca/sucursal/terminal, FOOD rechazado, origen, validación y reverso restringido.
- 43 pruebas FOOD de shell, acceso y operación; matriz multirrol y permisos Retail explícitos.
- Terminal/QZ: una apertura por efectivo, ninguna en notas/reimpresiones/tarjeta/transferencia; fallo de periférico no repite cobro. Software, no hardware.
- Inspección de componentes reales con transporte sintético local a 1093 × 480 CSS px. Panel de corte conserva cierre y pie; seguimiento y productos tienen desplazamiento. Equivale al área CSS de 1366 × 600 a 125%, pero NO certifica zoom nativo: el ayudante Windows falló al iniciar con “failed to write kernel assets”. No se hicieron pagos ficticios en producción.

Capturas: [corte](evidence/retail-v1/corte.jpg), [dinero](evidence/retail-v1/dinero.jpg), [cajita](evidence/retail-v1/cajita.jpg), [seguimiento](evidence/retail-v1/seguimiento.jpg).

## Recuperación y publicación

Migración aditiva 20261019090000_pos_retail_v1_reporting.sql. Antes de aplicarla se exige respaldo reciente, restauración aislada y verificación de Storage. El aplicador compara fingerprints dentro de la misma transacción para catálogo, inventario, ventas, pagos, cajas, usuarios y permisos; excluye únicamente la nueva columna nullable de reverso. Si falla, rollback de la transacción. No elimina datos ni reconstruye pagos.

Para recuperación de aplicación: volver al deployment anterior conservando el esquema aditivo. No borrar metadatos de verificaciones/reversos/seguimientos ni restaurar indiscriminadamente toda la base sobre operaciones posteriores. El respaldo privado queda fuera de Git. Una recuperación de datos debe hacerse primero en entorno aislado, comparar movimientos posteriores y aplicar reparación específica autorizada.

## Cajón: pendiente físico

Se conserva configuración QZ y firma administrada. Epson ESC p usa m=0 para pin 2 y m=1 para pin 5; t1/t2 son unidades de 2 ms. Comando publicado: 1B700019FA o 1B700119FA, RAW hexadecimal, 50 ms encendido/500 ms apagado. No se alteran pines ni certificados sin evidencia.

Fuentes oficiales: https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lp.html y https://qz.io/docs/raw .

Prueba mínima en Magenta: operador autorizado, turno abierto, configuración de la terminal y destino EPSON TM-T20II Receipt confirmados; ejecutar UNA apertura manual con motivo “Prueba física autorizada”, copiar mensaje completo e ID de solicitud y observar el cajón. “Orden enviada” solamente confirma aceptación del trabajo, no apertura. Si queda incierto, no repetir automáticamente ni alternar perfiles. Conservar ticket funcional. La prueba física sigue pendiente del usuario.

## Pendientes y congelamiento

Revisar costos históricos faltantes, referencias/confirmaciones manuales de transferencias y saldos administrativos pendientes. No se exige capturar precios de fábrica de Magenta. Históricos sin operador/costo/clasificación no se inventan. Reportes de más de 15 MB o más de 366 días piden reducir rango y no muestran totales truncados.

Tras este cierre, se congelan nuevas funciones Retail V1 hasta revisión en noviembre de 2026. Continúan correcciones de errores. No se incluyen importación IA, integraciones nuevas ni nahuitech-quotes.

## Archivos de esta entrega

- docs/evidence/retail-v1/cajita.jpg
- docs/evidence/retail-v1/corte.jpg
- docs/evidence/retail-v1/dinero.jpg
- docs/evidence/retail-v1/seguimiento.jpg
- docs/pos-retail-v1-release.md
- scripts/apply-pos-retail-v1-production.mjs
- scripts/pos-workspace-fixture.jsx
- scripts/test-pos-multirole-cash-v1.mjs
- scripts/test-pos-retail-orders-local.mjs
- scripts/test-pos-retail-report-api.mjs
- scripts/test-pos-retail-report.mjs
- src/app/api/pos/cash-movements/route.ts
- src/app/api/pos/cash-sessions/route.ts
- src/app/api/pos/retail-followups/route.ts
- src/app/api/pos/retail-orders/route.ts
- src/app/api/pos/retail-reports/route.ts
- src/app/brand/[brandSlug]/components/pos-retail-followups.tsx
- src/app/brand/[brandSlug]/components/pos-retail-reports.tsx
- src/app/brand/[brandSlug]/pos/orders/page.tsx
- src/app/brand/[brandSlug]/pos/reports/page.tsx
- src/lib/pos/retail-orders.ts
- src/lib/pos/retail-report.ts
- supabase/migrations/20261019090000_pos_retail_v1_reporting.sql
- docs/evidence/retail-v1/venta-larga.jpg
