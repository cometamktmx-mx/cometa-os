# COMETA: confianza administrada de QZ para Magenta

Este paquete contiene exclusivamente certificados públicos e instrucciones. No contiene QZ Tray ni claves privadas. Instalar únicamente en la terminal Windows autorizada de Magenta. Requiere QZ Tray oficial 2.2.5 o posterior instalado, funcionando mediante TLS; la configuración documentada override.crt existe desde 2.1. No ejecuta certgen ni importa certificados en Windows, navegadores o Java.

## Alcance y licencia

QZ documenta el mecanismo en https://qz.io/docs/signing#to-override-the-trusted-root-certificate . La raíz permite que QZ reconozca certificados emitidos por COMETA. No es una raíz HTTPS de Windows ni restringe criptográficamente el certificado a una URL, impresora o equipo. En QZ 2.2.5 se agrega a las autoridades conocidas; no elimina otras autoridades o sitios ya autorizados. No se habilitan solicitudes anónimas. Custodiar la raíz es responsabilidad de COMETA: quien obtenga una clave de firma podría firmar operaciones de QZ.

El servidor autoriza solamente el negocio y origen configurados, usuarios con acceso, permisos de operador y órdenes exactas generadas y auditadas por COMETA. El identificador de terminal del navegador no es una identidad de hardware. Instalar este paquete en otro equipo ampliaría la confianza local: no distribuirlo a otras terminales sin autorización.

QZ publica LGPL 2.1 y documenta esta configuración; no se identificó una compra obligatoria para usarla. Este paquete no modifica ni redistribuye QZ y no ofrece soporte Premium o identidad certificada por QZ. Referencia: https://qz.io/docs/licensing . La confianza administrada exige mantenimiento propio; no equivale a un certificado comercial reconocido automáticamente en cualquier terminal.

## Instalación

1. Verificar en QZ > About la versión y comparar la huella SHA-256 de `manifest.json` con la entregada por COMETA por un canal independiente.
2. Extraer el ZIP. Salir de QZ desde su icono; no cerrar una impresión activa. Abrir PowerShell **como administrador**, situarse en la carpeta y ejecutar el comando completo de `INSTALAR.txt`. La elevación es necesaria para escribir `override.crt` y el registro de instalación en `C:\Program Files\QZ Tray`.
3. No cambiar la política de ejecución global. Si Windows marca el script como descargado, revisar su contenido y ejecutar `Unblock-File -LiteralPath .\cometa-qz-trust.ps1`. Si una política corporativa exige Authenticode, debe firmarlo el administrador de esa organización; el paquete no evade esa política.
4. Iniciar QZ desde el menú Inicio con el usuario habitual, abrir https://app.cometaos.com/brand/magenta-fitwear/pos/settings/terminal e iniciar sesión y operador con permisos de configuración. Conectar y buscar impresoras. Si QZ presenta autorización, comprobar COMETA y la huella del certificado de firma; permitir y recordar solo esa identidad. Nunca aceptar solicitudes anónimas. Algunas versiones guardan automáticamente el certificado que encadena a la raíz administrada.
5. Seleccionar `EPSON TM-T20II Receipt`, 80 mm y el perfil de ticket Epson TM-T20II. Guardar. Mantener la apertura indiscriminada del cajón desactivada en el controlador. Activar automatismos después de confirmar el perfil de cajón compatible.

Si existe otro override.crt, el asistente se detiene sin sobrescribirlo. Si QZ está en otra carpeta, usar `-QzDirectory 'ruta real'`. El instalador no cambia impresoras, datos POS, opciones TLS, firewall, políticas de ejecución ni opciones existentes de QZ. `-Action Status` y `-WhatIf` permiten revisión previa. Una reinstalación del mismo paquete es idempotente.

### Alternativa manual cuando PowerShell bloquea scripts

El asistente no tiene firma Authenticode comercial. En desarrollo se comprobó su sintaxis, pero la política local impidió ejecutarlo; no se cambió esa política. Para instalar sin scripts:

1. Cerrar QZ desde el icono. En el Explorador, abrir `C:\Program Files\QZ Tray`. Si ya existe `override.crt`, detenerse: no sobrescribirlo.
2. En la carpeta extraída, copiar `cometa-root.crt` y renombrar **la copia** a `override.crt` (activar Ver > Extensiones de nombre de archivo para evitar un nombre terminado en `.crt.crt`). Copiarla a la carpeta de QZ. Aceptar la solicitud administrativa de Windows. **No hacer doble clic ni usar “Instalar certificado”.**
3. Guardar el paquete y manifest.json para la retirada. Iniciar QZ y continuar con el paso 4 anterior.

La instalación manual no crea el registro de propiedad del asistente: para retirarla, cerrar QZ, comprobar que override.crt coincide con cometa-root.crt (Propiedades o `Get-FileHash` de ambos archivos) y eliminar solamente ese override.crt desde el Explorador. Después bloquear COMETA en Site Manager. No usar el asistente para retirar una instalación manual sin su registro.

## Prueba física pendiente

Primero enviar el ticket de prueba sin cajón. Comprobar acentos, alineación, margen superior y corte. Luego, con caja abierta y permiso, probar apertura manual una sola vez y con motivo. Si el resultado es incierto, revisar físicamente antes de cualquier nueva orden. Finalmente comprobar venta en efectivo y abono en efectivo (una apertura), tarjeta/transferencia y nota (ninguna), y copia (sin cobro ni apertura). Las operaciones reales deben ser autorizadas y conciliadas; no registrar cobros ficticios como prueba.

Software: ancho de contenido 70 mm/560 puntos en el perfil Epson de 80 mm; inicialización ESC @ sin avance, raster y corte parcial GS V 66 0. Este corte conserva el avance físico que necesita la impresora. Validar en la Epson; no hay impresión física confirmada desde desarrollo. Papel 80 x 297 mm del controlador no obliga a llenar el ticket en la ruta ESC/POS.

## Retirada y revocación

Para revocar inmediatamente, cerrar QZ en la terminal y deshabilitar centralmente la firma (retirar POS_QZ_PRIVATE_KEY o cambiar POS_QZ_MANAGED_BRAND a un valor sin coincidencia y publicar). Ejecutar el mismo comando de INSTALAR.txt con `-Action Uninstall`; solo elimina la raíz idéntica a este paquete y su registro, nunca otra configuración.

Además, en cada cuenta Windows que haya usado QZ, QZ > Advanced > Site Manager: bloquear/eliminar el certificado COMETA de la lista de permitidos. La CLI oficial permite bloquear el certificado concreto: `& 'C:\Program Files\QZ Tray\qz-tray-console.exe' --block '.\cometa-signer.crt'`, ejecutado bajo la cuenta que usa QZ. Reiniciar QZ y verificar que COMETA ya no obtiene confianza silenciosa. No borrar listas enteras ni otros sitios. Fuente: https://qz.io/docs/command-line . Retirar la raíz y bloquear el certificado es necesario ante compromiso de claves; no depender de una CRL pública de QZ para certificados propios.

## Custodia y renovación

Raíz RSA 4096, vigencia 3 años; firma RSA 2048 PKCS#8, vigencia 1 año. Las fechas exactas están en manifest.json. Renovar al menos 30 días antes del vencimiento. Las claves se cifran mediante DPAPI CurrentUser en una carpeta fuera de Git, con ACL limitada al usuario emisor y SYSTEM; los temporales de emisión se eliminan. DPAPI requiere conservar el perfil Windows y sus credenciales: una copia de los archivos en otro equipo no basta para recuperar las claves. La raíz no se carga al servidor. La clave de firma se carga únicamente como variable sensible en Vercel, nunca en NEXT_PUBLIC, Git, navegador o paquete.

El procedimiento conservador de renovación genera una raíz y firmante nuevos con `scripts/prepare-qz-managed-root.mjs`, en carpetas nuevas. Antes del cambio, guardar los certificados públicos/huellas antiguos y verificar las nuevas claves. En ventana de mantenimiento: cerrar QZ, retirar el paquete anterior, instalar el nuevo, actualizar certificado y clave central juntos, publicar y comprobar descubrimiento/ticket. Bloquear el certificado anterior; conservar su paquete público para auditoría. No reutilizar una raíz comprometida. No hay renovación ni pago automáticos.

Recuperación de un fallo de publicación: conservar el paquete anterior y la versión anterior de los secretos hasta verificar el nuevo par; restaurarlos juntos si no hubo compromiso. Ante compromiso, no restaurar confianza antigua: emitir nueva raíz y repetir instalación. No modificar datos, pagos ni reservas para recuperar impresión.
