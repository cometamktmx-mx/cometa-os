# Notas, apartados y cajón — entrega 17 octubre 2026

## Comportamiento

- Lista paginada (25), búsqueda global autorizada por nombre/folio, parcial y sin distinguir acentos/mayúsculas; filtros y orden por actividad o vencimiento.
- Detalle compacto, variantes agrupadas por ID del modelo, catálogo/escáner, disponibilidad, edición explícita del cliente, resumen y acciones accesibles. Progreso de fábrica una vez por modelo.
- El permiso SELL permite seguir armando un apartado activo; SETTINGS continúa reservado para configuración. Guardar calcula diferencias de reserva atómicamente, preserva folio, abonos, política y vencimiento. Reducciones solicitan motivo; cancelación exige motivo y permiso CANCEL.
- Excedentes pagados permanecen en `unresolved`. Liquidación con saldo cero no genera otro pago ni movimiento de efectivo. Entrega continúa como acción separada.
- Se conserva la regla configurable publicada: 50 piezas del mismo padre, tallas/colores combinables, descuento de $10 por pieza, sin precios manuales ni importes negativos. Ventas finalizadas no se recalculan.
- Nueva venta usa un único aviso flotante que expira; no desplaza el checkout ni captura foco. Se elimina el panel repetitivo de totales. Los errores permanecen junto a cobrar.
- La orden de cajón es RAW hexadecimal independiente del ticket: pin 2 `1B700019FA`, pin 5 `1B700119FA`. No se alteraron la ruta del ticket Epson, sus avances/corte ni certificados/claves.

## Validaciones

Pruebas ejecutadas contra la implementación real, con transportes sintéticos o PostgreSQL local desechable; ninguna venta o apertura física realizada durante las pruebas:

- `node scripts/test-pos-retail-orders-local.mjs`: 49/50/51; identidad del padre; combinación de variantes configurable; descuentos una vez; notas sin cobro/reserva; activación y conversión repetidas; abonos; incrementos/reducciones/liberaciones; liquidación y entrega; competencia por última unidad; pago y edición contra vencimiento; liberación única; retención inicial y abonos adicionales sin borrar dinero; excedente conservado y liquidación cero; búsqueda más allá de 25 registros y aislamiento.
- `node scripts/test-pos-retail-orders-api.mjs`: autenticación, permisos de Ventas, sucursal/marca, exclusión FOOD, origen, filtros inválidos y paginación.
- `node scripts/test-pos-retail-terminal.mjs`: efectivo/tarjeta/transferencia/mixto, reimpresión sin cajón, abonos confirmados, firma exacta, permisos, despacho único, incertidumbre sin reintento y bytes de ambos pines.
- `node --test scripts/test-pos-food-shell-v1.mjs scripts/test-pos-food-access-server-v1.mjs`: 26 pruebas correctas.
- TypeScript sin emisión y build Next completos. Lint dirigido limpio en órdenes, terminal, helpers y APIs de órdenes/impresión. Deuda previa comparada con HEAD: register 5 errores y 3 avisos; products API 11 errores `any`. No se amplió esa deuda ni se hizo limpieza ajena.
- Inspección visual de las páginas reales con transporte local: 1366 × 768 y tablet 820 × 1180, 18 variantes/3 modelos, resumen fijo, búsqueda de N-DEMO-036 fuera de primera página y ANGELA MUNOZ; escaneo conservando foco; total $7,000 para 50 × $150.

Capturas con datos sintéticos (no son ventas ni impresión física):

- [Lista](evidence/pos-workspace/orders-list.jpg)
- [Detalle escritorio](evidence/pos-workspace/orders-desktop.jpg)
- [Detalle tablet](evidence/pos-workspace/orders-tablet.jpg)
- [Nueva venta](evidence/pos-workspace/register-desktop.jpg)

## Producción y recuperación

La migración `20261018120000_pos_order_workspace.sql` es compatible con los consumidores existentes: búsqueda optativa `list=1`, función transaccional actualizada e índice aditivo. No reescribe registros históricos ni modifica RLS. SHA-256: `37b19c66753a88fc52dcb6bfb8644563acf785e11dee6ccf068ea5b98fae117f`.

Antes de aplicarla se restauraron esquema/datos y 76 archivos de Storage en un entorno aislado, comprobando hashes y acceso HTTP; el entorno fue retirado. La aplicación comprobó dentro de la misma transacción la conservación de catálogo, inventario, ventas, pagos, pedidos, usuarios y permisos. Evidencia privada excluida de Git: `build/pos-tickets/production-audit/recovery-result.json`, `applied.json` y carpeta del respaldo indicada por ellos.

Auditoría de reservas previa, solo lectura: 1 apartado activo; cero conflictos de stock/reservas, activaciones duplicadas o diferencias de pagos; cero activos ya vencidos; cron activo cada minuto. No se hicieron reparaciones de datos. Consulta repetible: `scripts/audit-pos-order-reservations.sql`.

Recuperación: volver al despliegue previo desde Vercel si hay una regresión de UI. La migración admite la versión anterior de la aplicación; no borrar funciones, índices, pedidos ni pagos para revertir UI. Si se requiere revertir la función de negocio, detener nuevas operaciones y evaluar los excedentes creados desde la publicación antes de restaurar su definición desde el respaldo probado. Nunca restaurar datos de respaldo sobre pagos posteriores sin conciliación. Conservar registro de migración y auditoría.

## Prueba física única del cajón en Magenta

1. Abrir https://app.cometaos.com/brand/magenta-fitwear/pos/settings/terminal en el navegador habitual. Usar un operador con permiso DRAWER y turno abierto autorizado. Para cambiar la configuración se requiere SETTINGS.
2. Mantener QZ abierto y la firma administrada existente. Confirmar impresora exacta **EPSON TM-T20II Receipt**, ruta Epson y el perfil de pin elegido según la conexión/manual. Guardar. La sección «Configuración recuperada del servidor» debe mostrar esa impresora, terminal, pin y bytes. Si hay cambios pendientes las pruebas quedan bloqueadas.
3. Consultar turnos, seleccionar el abierto y escribir «Prueba física de cajón Magenta». Pulsar **Solicitar apertura con registro** una sola vez. Esta prueba no registra venta ni cobro.
4. Anotar el mensaje completo, ID de solicitud y si hubo apertura física. Permiso/turno bloquean antes del envío; firma/conexión tienen diagnóstico propio; QZ puede rechazar o perder la conexión. «Orden enviada; apertura física por confirmar» significa que QZ aceptó el trabajo, no que el cajón abrió.
5. Si no abre, no alternar pines ni repetir automáticamente. Revisar en la terminal la cola de esa Epson y el log de QZ correspondiente a la hora/ID; confirmar cable de cajón, posición de llave y modelo exacto EC Line. La evidencia permite separar rechazo de software y falta de respuesta física. No configurar apertura global en el controlador Windows.

Tras confirmar apertura física, comprobar con una operación real autorizada: efectivo abre una vez; tarjeta/transferencia no; copia y nota sin cobro no. Anticipos/abonos en efectivo usan la misma ruta deduplicada. No hacer ventas ficticias en producción.

Epson documenta `ESC p`: m=0 corresponde al pin 2, m=1 al pin 5, unidades de t1/t2 de 2 ms. Se conserva pulso de encendido 50 ms y apagado 500 ms; no se ajustó a ciegas. [Referencia oficial Epson](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lp.html). QZ soporta datos RAW con flavor hexadecimal: [documentación oficial QZ](https://qz.io/docs/raw).

No se atribuye el fallo físico anterior a una causa demostrada: se corrigió una ruta de texto que podía transformar bytes y la ambigüedad entre configuración editada y guardada. La apertura física sigue pendiente de confirmación del usuario. No se compraron servicios ni se sustituyeron claves.

## Archivos de esta entrega

- `docs/evidence/pos-workspace/orders-desktop.jpg`
- `docs/evidence/pos-workspace/orders-list.jpg`
- `docs/evidence/pos-workspace/orders-tablet.jpg`
- `docs/evidence/pos-workspace/register-desktop.jpg`
- `docs/pos-magenta-workspace-release.md`
- `scripts/apply-pos-workspace-production.mjs`
- `scripts/audit-pos-order-reservations.sql`
- `scripts/pos-workspace-fixture.jsx`
- `scripts/preview-pos-orders-local.mjs`
- `scripts/test-pos-retail-orders-api.mjs`
- `scripts/test-pos-retail-orders-local.mjs`
- `scripts/test-pos-retail-terminal.mjs`
- `src/app/api/pos/products/route.ts`
- `src/app/api/pos/retail-orders/route.ts`
- `src/app/api/pos/terminal-print/route.ts`
- `src/app/brand/[brandSlug]/pos/orders/page.tsx`
- `src/app/brand/[brandSlug]/pos/register/page.tsx`
- `src/app/brand/[brandSlug]/pos/settings/terminal/page.tsx`
- `src/lib/pos/retail-orders.ts`
- `src/lib/pos/thermal-client.ts`
- `src/lib/pos/thermal.ts`
- `supabase/migrations/20261018120000_pos_order_workspace.sql`
