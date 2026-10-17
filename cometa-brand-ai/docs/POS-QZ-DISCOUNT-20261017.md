# Corrección de mayoreo y puesta en servicio QZ

Esta corrección sustituye la instrucción anterior de capturar precios de fábrica para Magenta. Su regla es mínimo 50 piezas por producto padre, combinando variantes, con descuento de $10 MXN por pieza. No se suman ventas anteriores ni otros modelos. La modalidad es configurable por negocio; los precios originales y el descuento quedan en la venta. Los históricos y las políticas aceptadas de apartados no se migran ni recalculan.

## Decisión de confianza QZ

Recomendación: **Premium Support, SKU QZ-001**, emitido a nombre de COMETA, con firma en servidor. Precio publicado el 17 de octubre de 2026: **USD 749 por un año**. Incluye certificado/par de claves confiable y soporte. La tienda indica descuento de USD 100 para renovación con sesión iniciada: USD 649 resulta de restarlo al precio anual actual; debe confirmarse el importe final al renovar, con impuestos y condiciones aplicables. Hay opciones de varios años. No se ha comprado ni emitido nada.

- Compra oficial: https://buy.qz.io/Premium-Support-_p_13.html
- Cobertura oficial: https://qz.io/docs/faq — sin límite de clientes/usuarios ni restricción de dominios. Una licencia suele cubrir una organización.
- Para COMETA SaaS multinegocio, esa cobertura técnica permite una identidad central. Antes de comprar, confirmar por escrito con QZ que el contrato cubre todos los clientes independientes del SaaS y la distribución prevista del instalador, titular legal, impuestos, disponibilidad y renovación. No se ha solicitado esa confirmación externa.
- Company Branded Premium Support, SKU CB-001, cuesta USD 3,499 el primer año e incorpora marca propia en el instalador. No es necesario solo para impresión silenciosa: https://buy.qz.io/Company-Branded-Premium-Support_p_19.html. Su renovación reducida no tiene aquí un importe confirmado.
- Licencias de la aplicación y certificado son conceptos separados: https://qz.io/docs/licensing.

## Configuración central

Una vez emitido el certificado, administrar estas variables únicamente en el entorno Production de Vercel, con acceso restringido:

1. `POS_QZ_CERTIFICATE`: contenido público de `digital-certificate.txt`.
2. `POS_QZ_PRIVATE_KEY`: clave privada PEM correspondiente (RSA, al menos 2048 bits). Nunca en Git, navegador, terminales, capturas o documentación.
3. `POS_QZ_TRUST_MODE=qz-issued` para el certificado QZ. Publicar de nuevo para incorporar las variables.

El endpoint autenticado de terminal valida formato, fechas, RSA y correspondencia certificado/clave. Expone solo diagnóstico, huella pública y vencimiento. `ready` significa que el firmante central es utilizable; **no certifica que una terminal confíe en su emisor**. Solo firma consultas de impresoras y trabajos persistidos, autorizados y vinculados a marca, usuario, operador y terminal. Las órdenes tienen vencimiento y despacho de una sola ejecución. No es un servicio de firma arbitraria.

La renovación requiere actualizar el certificado emitido y, si cambia, la clave; volver a publicar, verificar diagnóstico y probar una terminal. Programar revisión operativa antes del vencimiento. QZ explica su renovación y continuidad de claves en https://qz.io/docs/renewal. No reenviar automáticamente trabajos cuyo resultado sea incierto.

## Instalación inicial de cada terminal

1. Instalar el controlador Epson y QZ Tray desde https://qz.io/download/. Iniciar QZ con el usuario Windows que tiene la impresora instalada. Mantener TLS local; no aceptar excepciones de certificado ni conexiones WS inseguras.
2. Abrir COMETA por HTTPS, entrar al negocio y seleccionar un operador con Configuración. Abrir POS → Configuración → Impresora y cajón. Leer el diagnóstico de firma.
3. Conectar y buscar impresoras. En el primer aviso comprobar la identidad COMETA esperada y permitir recordando la decisión. Con el certificado confiable y mensajes firmados no debe repetirse el aviso por ticket. Si aparece identidad anónima, detenerse y revisar firma; no confiar permanentemente en solicitudes sin firma.
4. Seleccionar `EPSON TM-T20II Receipt`, 80 mm y ruta `EPSON TM-T20II confirmada · ESC/POS y corte`. Guardar. El perfil anterior mediante controlador sigue disponible para otras impresoras.
5. Confirmar el pin del cajón contra el equipo conectado antes de habilitar su automatismo. En Windows: Dispositivos e impresoras → EPSON TM-T20II Receipt → Preferencias de impresión → ajustes de periféricos/cajón del controlador Epson: apertura al inicio y al final **desactivada**. La etiqueta exacta cambia entre versiones APD. Nunca activar apertura general desde el controlador.
6. Imprimir prueba QZ corta y larga. Confirmar ancho, acentos, nombres largos, corte, encabezado y final. Después probar efectivo, tarjeta, mixto, abono y copia. Solo el efectivo confirmado puede generar apertura automática; una copia no abre. El resultado de QZ confirma aceptación, no salida física.

La reconexión solo reintenta la conexión TLS local una vez; nunca el envío de ticket o cajón. Cambiar de negocio, terminal o certificado cierra la conexión anterior. Si QZ devuelve cero impresoras se muestra un error y la acción de revisar usuario Windows/controlador/reiniciar QZ, sin un selector vacío inexplicable.

## Alternativa soportada: raíz administrada

QZ soporta una CA propia o de terceros mediante `override.crt`/`authcert.override`; no es el certificado HTTPS de localhost. Documentación: https://qz.io/docs/signing y https://qz.io/docs/provisioning.

Requiere una CA custodiada, emisión de certificado de firma RSA, cadena válida y distribución administrativa del certificado raíz público a **cada terminal**. La raíz privada permanece fuera de terminales y del servidor web; solo la clave de firma del servicio va al servidor. Configurar `POS_QZ_TRUST_MODE=managed-root` después de emitir y distribuir la confianza. No se ha creado ni instalado una CA de producción sin un responsable y proceso de custodia.

En QZ 2.2.5 o posterior, provisioning de tipo `ca` instala la raíz en la fase `certgen`; `cert` registra el certificado del firmante en `allowed.dat` durante `startup`. El administrador puede preparar `provision.json` y cargarlo mediante el mecanismo oficial de sideloading, con los certificados públicos junto al archivo. Verificar huellas por un canal confiable y conservar permisos de administrador sobre la instalación. No copiar claves privadas a ese paquete.

COMETA tendría que mantener inventario de terminales, actualizaciones de confianza, renovación, rotación, retirada de certificados comprometidos y pruebas por versión de QZ. No asumir que el override aporta revocación automática; acordar y probar el procedimiento de retirar confianza de todos los equipos. No desactivar TLS, validación de firma ni seguridad de origen. Esta opción evita comprar el certificado QZ pero añade operación de PKI; para terminales de clientes independientes se recomienda el certificado QZ.

## Ticket y alcance de la validación

80 mm es el papel; contenido de 70 mm dentro de los 72 mm imprimibles de TM-T20II. La ruta ESC/POS rasteriza HTML para preservar acentos, usa 8 puntos/mm, imagen de 560 puntos de ancho, altura automática, inicialización sin avance y `GS V 66 0` al final. El corte incluye el recorrido físico necesario hasta la cuchilla, sin líneas vacías añadidas. Referencias: https://qz.io/api/qz, https://raw.githubusercontent.com/qzind/tray/v2.2.5/src/qz/printer/action/PrintRaw.java y https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_cv.html.

No se atribuye el desperdicio del primer ticket a una causa comprobada: falta inspección física. El formulario Windows de 80 × 297 mm no determina la altura de la ruta raw. En contingencia por navegador o ruta pixel, seleccionar rollo 80 mm, escala 100 %, márgenes ninguno y encabezados/pies desactivados; activar ahorro de papel/altura variable solo si el controlador lo ofrece. CSS no cambia las preferencias del controlador. La contingencia por navegador **no completa el objetivo de impresión directa**.

Los comprobantes incluyen original, descuento y neto por pieza cuando corresponda. Notas y copias de abonos pueden enviarse directamente por QZ sin cobro ni cajón, conservando el snapshot del abono. Las pruebas automáticas y la inspección de HTML no certifican la Epson, el cortador ni el cajón.

## Recuperación

La migración es aditiva: agrega modalidad y descuento a reglas y reemplaza tres funciones conservando sus contratos y privilegios. No actualiza ventas, pagos, inventario, clientes, usuarios ni pedidos. La configuración de Magenta se hace explícitamente tras publicar. Si hay una regresión, desactivar mayoreo para nuevas operaciones desde Configuración y restaurar el despliegue anterior mientras se corrige hacia adelante. No eliminar columnas ni restaurar una copia antigua sobre pagos nuevos. Conservar respaldo privado restaurado y pruebas de integridad del lanzamiento.
