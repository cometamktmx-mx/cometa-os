# COMETA POS — correcciones del 17 de octubre de 2026

Documento histórico de la entrega 879426e. La instrucción de precios de fábrica para Magenta queda sustituida por descuento de $10 por pieza desde 50 del mismo modelo. La ruta QZ y sus requisitos actuales están en [la corrección posterior](POS-QZ-DISCOUNT-20261017.md); ya no es necesario capturar 387 precios de fábrica.

Entrega aditiva sobre la revisión de producción `eba5b0c` y la rama de entrega `45e5e73`. Se conservan catálogo, códigos, existencias, ventas, pagos, usuarios, permisos y las condiciones históricas. No se adquirieron servicios ni certificados.

## Impresión y cajón

El ticket usa papel de 80 mm, contenido de 70 mm, encabezado compacto, columnas de cantidades/importes, variantes, descuentos, pagos, recibido/cambio y marca de copia. El ancho imprimible documentado de la TM-T20II es 72 mm. No hay altura mínima, centrado vertical ni longitud de contenido de 297 mm. La impresión por navegador usa un documento independiente de la interfaz. QZ usa altura automática y `scaleContent:false`; el programa no envía avances ni cortes RAW, únicamente el pulso de cajón cuando corresponde.

Conexión, enumeración, autorización/firma y envío tienen errores diferenciados. La falta de firma impide comprobar conexión y enumeración desde producción: no equivale a afirmar que QZ o la Epson fallan. El selector explica el estado vacío y conserva una impresora guardada como «sin comprobar».

Producción no tiene `POS_QZ_CERTIFICATE` y `POS_QZ_PRIVATE_KEY`. No se inventó un certificado ni se habilitó QZ anónimo. El ensayo manual existente sigue limitado a Preview, negocio/terminal autorizados, permisos y registro. TLS sigue habilitado. Impresión y cajón automáticos requieren resolver la firma; la alternativa de navegador no abre el cajón. Una autorización manual de QZ no constituye firma comercial confiable.

Las órdenes automáticas se crean después de confirmar el servidor, incluidas las de anticipos y abonos. Solo efectivo solicita apertura; tarjeta, transferencia, notas y copias no lo hacen. Las órdenes son únicas, no se reintentan automáticamente y un error conserva el cobro. Una respuesta de cola no certifica impresión ni apertura física.

### Prueba mínima en la Epson de Magenta

1. Windows 10: **Configuración → Dispositivos → Impresoras y escáneres → EPSON TM-T20II Receipt → Administrar → Preferencias de impresión**. Confirmar papel de 80 mm. En Epson APD, revisar **Layout → Paper Size** y **Paper Reduction**: la reducción del espacio superior/inferior y el corte dependen de la versión instalada. Si usa el controlador genérico, estas opciones pueden no existir. No activar apertura del cajón antes/después de cada documento.
2. En POS, **Configuración → Terminal → Probar ticket en navegador**. Elegir **EPSON TM-T20II Receipt**, **Más ajustes → Tamaño del papel** correspondiente al formulario de 80 mm; escala **100 %**, márgenes **Ninguno**, encabezados y pies **desactivados**. No aceptar «ajustar a página» si amplía el ticket. El formulario 80 × 297 mm es un límite del controlador: CSS no puede garantizar recorte de papel ni suprimir el avance físico hasta el corte.
3. Medir el espacio antes del encabezado y al final. Probar ticket corto, uno largo, acentos y pagos mixtos. Si queda papel, comparar preferencias de reducción y comportamiento del controlador sin atribuir la causa al POS solo por el síntoma.
4. Probar copia desde Ventas: debe decir **COPIA / REIMPRESIÓN**, sin cobro ni apertura. Nota: debe decir **PEDIDO PENDIENTE — NO ES COMPROBANTE DE PAGO**.
5. Cuando se configure una firma confiable, buscar la impresora exacta y probar QZ. Confirmar perfil físico del cajón antes de habilitarlo; verificar efectivo/anticipo/abono y después tarjeta, transferencia y copia. Ante apertura incierta, revisar físicamente antes de cualquier acción manual.

Referencias: [Epson TM-T20II, guía técnica](https://files.support.epson.com/pdf/pos/bulk/tm-t20ii_trg_en_revc.pdf), [manual de software Epson](https://files.support.epson.com/pdf/pos/bulk/tm-t20ii_swum_en_01.pdf), [QZ Pixel Printing](https://qz.io/docs/pixel).

## Reglas comerciales

Precio de fábrica por UUID de producto padre o variante, configurable por negocio. El servidor cotiza y valida antes de cobrar. El pedido actual determina el mínimo; nunca se acumulan ventas anteriores. Al editar se muestra el total anterior y el nuevo. Fábrica y descuento explícito se aplican una vez. Las ventas finalizadas y los reintentos históricos conservan sus importes.

Magenta: mínimo 50 piezas del mismo modelo, combinación de variantes habilitada. La consulta encontró 387 productos activos / 475 variantes. Los precios de fábrica requieren captura explícita; véase [lista por identidad de modelo](evidence/pos-tickets/factory-prices-pending.csv). No se interpretan nombres como precios ni se fusionan productos distintos. Si tallas/colores fueron importados como productos padres diferentes, necesitan revisión de catálogo: no se agrupan por parecido.

Notas: folio, cliente/contacto, variantes, cantidades, cotización, edición, reapertura, impresión y conversión. No cobran, reservan ni descuentan inventario. Conversión y activación revalidan precio/disponibilidad, con revisión e idempotencia.

Apartados: anticipo mínimo $500 MXN, 15 días desde activación, política aceptada almacenada. Abonar o editar no reinicia el plazo. Reservas atómicas; edición activa requiere configuración, cancelación requiere permiso. Anticipos/abonos separados de ventas, efectivo registrado como depósito de caja; liquidación aplica saldo prepagado sin segunda entrada ni descuento de stock. Entrega explícita separada.

`pg_cron` procesa vencimientos cada minuto sin abrir el POS. Bloqueo de filas e idempotencia protegen pago/vencimiento. Se liberan reservas una vez; $500 iniciales se registran como retención sin nuevo ingreso. Abonos adicionales quedan como saldo pendiente administrativo. No se reembolsan automáticamente ni se aceptan nuevos abonos vencidos.

## Validación y recuperación

Pruebas ejecutadas: TypeScript sin emisión, build Next, lint dirigido del código nuevo, tests de terminal/firma/reimpresión, API de pedidos con permisos y aislamiento, regresión FOOD (9 pruebas servidor y 17 shell), fixtures visuales y PostgreSQL desechable. Casos DB: 49/50/51, variantes del mismo padre, padres distintos de nombre idéntico, caída bajo mínimo, precio faltante, descuento único, notas sin dinero/stock, activación y conversión repetidas, edición de reservas, abonos, liquidación, entrega explícita, vencimiento único, retención/abonos pendientes, competencia por stock y pago bloqueado hasta después del vencimiento.

Respaldo completo en custodia local privada: esquema/datos de una instantánea y 76 objetos. Restauración aislada sin puertos públicos, propietarios/permisos conservados, 76 descargas por Storage con hashes iguales. Migración probada sobre la restauración. Aplicación de producción transaccional con huellas de catálogo, stock, ventas, dinero, clientes, usuarios y permisos sin cambios; registro de hash de migración. No se registraron ventas ni pagos sintéticos en producción.

Recuperación: conservar la versión anterior de Vercel. Ante fallo de aplicación, volver a esa versión y deshabilitar nuevas activaciones desde reglas; mantener el proceso de vencimiento para reservas ya activas. No borrar tablas nuevas ni restaurar un respaldo sobre ventas posteriores. La migración es aditiva y compatible con la aplicación anterior; la restauración total queda reservada a un incidente con conciliación de movimientos posteriores.

Capturas de datos sintéticos: [venta](evidence/pos-tickets/short.png), [nota](evidence/pos-tickets/note.png), [abono](evidence/pos-tickets/active.png), [liquidación](evidence/pos-tickets/settled.png), [copia](evidence/pos-tickets/copy.png), [ticket largo, inicio](evidence/pos-tickets/long-top.png) y [final](evidence/pos-tickets/long-bottom.png). Son renderizados de software, no impresión física validada.
