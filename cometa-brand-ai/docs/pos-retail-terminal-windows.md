# COMETA POS comercio — terminal Windows

Esta entrega conserva el catálogo, precios, códigos, existencias, motor de cobro y reglas fiscales. La compatibilidad física requiere conocer y probar el modelo de impresora. No hay confirmación física del cajón: el resultado registrado describe la solicitud y la aceptación por el puente, no el movimiento mecánico.


## Ensayo antes de contratar certificado — 16 de octubre

QZ ofrece demostración gratuita con avisos: [Premium Support](https://buy.qz.io/Premium-Support-_p_13.html). No se necesita comprar ni generar certificados para este ensayo. El modo explícito implementado conserva los avisos nativos, WSS y la autorización del servidor COMETA; no instala raíces ni modifica protecciones QZ/navegador. No es impresión silenciosa ni autoservicio terminado.

Activación técnica ya preparada para el despliegue de pruebas: variable servidor `POS_QZ_MANUAL_TEST=true` y `VERCEL_ENV=preview`; ambas condiciones son obligatorias. El usuario debe marcar **Acepto probar con autorizaciones manuales de QZ · solo Preview**. Su decisión queda únicamente en sessionStorage de esa pestaña y marca. No se activa automáticamente por ausencia de certificado. Producción rechaza esta modalidad incluso si recibe la variable o un body manipulado.

El callback QZ pide autorización al servidor: valida operador/permisos, impresora, opciones, contenido, vencimiento y despacho único antes de devolver firma vacía. QZ solicita entonces permiso al usuario. El conector no autentica criptográficamente a COMETA en este modo: cerrar otras páginas de impresión, permitir solo la solicitud recién iniciada y no otorgar confianza permanente. Si la política instalada de QZ rechaza solicitudes sin firma, detener la prueba y comunicarlo; no desactivar esa política. Un aviso TLS del navegador tampoco se omite.

### Pasos personales mínimos

1. Abrir [Operadores Preview](https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos/staff) con la sesión autorizada de pruebas.
2. En «Configura tu equipo para comenzar», escribir nombre, elegir sucursal, introducir PIN propio de 4–8 dígitos, confirmarlo y pulsar «Crear primer operador».
3. Seleccionar ese administrador e ingresar su PIN. No compartirlo por chat. Crear después Ventas e Inventario con PINes personales desde Operadores.
4. Avisar cuando la sesión esté iniciada para completar comprobaciones autenticadas. La pestaña observada mostró «Failed to fetch» y errores de renovación Supabase; mientras persista, no se considera exitoso el alta ni el login.

### Windows: recorrido corto, solo Preview

1. Instalar controlador oficial y hacer una página de prueba Windows. Desactivar apertura automática del cajón en el controlador. Confirmar modelo, 58/80 mm y perfil/pin del fabricante.
2. Instalar [QZ Tray 2.3.0 oficial](https://qz.io/download/) para la arquitectura Windows de 64 bits correspondiente, con runtime incluido. Abrir QZ; no ejecutar scripts ni configurar claves. Permitir únicamente la conexión local del sitio de pruebas cuando el navegador lo solicite; no abrir puertos hacia otras computadoras.
3. Abrir [Terminal Preview](https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos/settings/terminal), marcar el modo manual, pulsar «Conectar y buscar impresoras» y revisar/aceptar el aviso QZ de esa solicitud. Puede aparecer como sitio anónimo/no confiable porque no hay certificado comercial.
4. Elegir impresora, papel, dejar perfil «Sin confirmar» y apertura apagada; guardar. «Probar impresión»: autorizar el aviso, comprobar ticket, acentos y recortes.
5. Solo con perfil ESC/POS confirmado: guardar pin compatible, abrir turno de prueba, seleccionar turno y motivo; «Solicitar apertura con registro», autorizar y observar físicamente. No repetir si el resultado es incierto.
6. Activar impresión automática y apertura por efectivo después de esas pruebas; guardar. Registrar **solo ventas sintéticas de Preview**, nunca cargos Stripe reales. Cada orden puede pedir aprobación independiente: ticket y cajón no son una sola confirmación.

| Caso | Resultado físico esperado | Evidencia que debe revisarse |
| --- | --- | --- |
| Efectivo | Ticket + una solicitud de cajón | Una venta, ticket correcto, una apertura observada |
| Tarjeta / transferencia | Ticket, sin cajón | Una venta, sin solicitud de cajón |
| Mixto con efectivo | Ticket + una solicitud de cajón | Importes y cambio correctos, una apertura |
| Reimpresión | Ticket, sin cajón | Misma venta, sin cobro nuevo |
| USB desconectado | Puede fallar o quedar en cola | Venta sigue confirmada; no volver a cobrar |

Antes de reimprimir tras desconexión, revisar/cancelar la cola retenida Windows: al reconectar puede salir el ticket pendiente. Una cola aceptada no prueba impresión física ni apertura. Denegar un aviso puede dejar el resultado de cajón incierto y no provoca reintento automático. Si el administrador supera 3 minutos durante el ensayo, desbloquear antes de continuar; la venta ya confirmada no se pierde.

### Estado y licencia SaaS

- Usuarios/permisos/bloqueo: suites de servidor y shell aprobadas; recorrido autenticado personal pendiente.
- PWA: implementación conservada; instalación y suspensión/reanudación Windows pendientes. Edge → Aplicaciones → Instalar este sitio; Chrome → Instalar COMETA POS. Verificar marca al abrir y configurar esta ventana; no recargar una venta en curso para actualizar. Requiere internet.
- Impresión/cajón manual: mecanismo de prueba implementado y validado en software; QZ real, avisos y hardware pendientes.
- Autoservicio sin avisos repetidos: pendiente de firma central, confianza distribuida y validación Windows; no contratado.

La [FAQ oficial](https://qz.io/docs/faq#licensing) declara que Premium Support no limita clientes/usuarios ni dominios. Esto respalda el uso de un certificado central para múltiples terminales; no publica una restricción por tienda. La tarifa publicada es US$749 por un año y descuento de US$100 en renovación; hay aviso de disponibilidad en la tienda. No es una cotización específica para COMETA ni confirmación contractual de nuestro SaaS. Antes de contratar, confirmar por escrito: SaaS multinegocio, terminales/clientes de terceros, certificado y clave custodiados solo por COMETA, dominios propios y Preview, precio final/impuestos, renovación y disponibilidad. No se envió mensaje ni se compró nada.

No confundir con [Company Branded](https://qz.io/docs/company-branded): cambiar la identidad del ejecutable requiere producto separado. Conservamos QZ Tray original. Sus [términos específicos](https://qz.io/docs/company-branded-service-terms-of-use) no se presentan como contrato de Premium Support estándar.

Archivos de esta continuación: `src/app/api/pos/terminal-print/route.ts`, `src/lib/pos/thermal-client.ts`, `src/types/qz-tray.d.ts`, `src/app/brand/[brandSlug]/pos/settings/terminal/page.tsx`, `scripts/test-pos-retail-terminal.mjs`, `docs/pos-retail-terminal-windows.md`. Sin nuevas migraciones.

## Preparación técnica

Migraciones, en orden (sin seeds ni cambios de catálogo):

1. `20261016090000_pos_retail_operators_v1.sql`: columnas aditivas de rol/permisos de comercio, actividad humana de sesión, guardia transaccional del último administrador, límite atómico de intentos de PIN y acceso de la RPC de venta exclusivamente desde servidor. Conserva roles/PIN existentes y FOOD. Los usuarios existentes requieren revisión explícita de permisos; cambiar una etiqueta no les concede nuevos permisos.
2. `20261016091000_pos_terminal_print_jobs_v1.sql`: configuración por terminal y solicitudes auditadas con deduplicación y despacho de una sola vez. Tablas privadas para `service_role` detrás de autenticación, marca y operador.

No basta revertir código para deshacer las migraciones. Si hay que retirar esta versión, conservar columnas y registros de auditoría, detener impresión automática y restaurar la versión anterior de aplicación. No eliminar datos con escrituras posteriores. La revocación de ejecución pública de la RPC financiera debe conservarse.

Dependencia web: `qz-tray@2.2.5` fijada en lockfile. Puente de escritorio recomendado: QZ Tray **2.3.0**, por las restricciones de origen y red. No se instala Electron ni un servidor propio.

Variables **solo servidor**, separadas por entorno:

- `POS_QZ_CERTIFICATE`: certificado público de firma, PEM completo.
- `POS_QZ_PRIVATE_KEY`: clave privada de firma, PEM completo; jamás `NEXT_PUBLIC_*`, navegador, repositorio, ticket o chat.

Fuera del modo manual de Preview descrito arriba, sin ambas variables la impresión automática permanece sin capacidad de despacho. La venta confirmada no se revierte ni se vuelve a cobrar. El operador puede reimprimir una vez configurado el puente. No copiar una clave/certificado de laboratorio al despliegue operativo sin instalar y verificar su confianza.

La API firma únicamente el hash SHA-256 de una orden de impresión autorizada, con RSA SHA-512, conforme al cliente QZ. Valida origen, sesión/operador, marca, terminal, datos generados en servidor, impresora y opciones exactas, vencimiento y despacho único. No firma archivos, sockets, programas ni datos de impresión arbitrarios.

## Instalación en la computadora del cliente

1. Obtener marca/modelo exactos, ancho de papel, controlador Windows y manual del conector del cajón. Conectar impresora USB y cajón **al puerto indicado por el fabricante**. Instalar el controlador oficial y comprobar primero una página de prueba de Windows.
2. En preferencias del controlador, **desactivar cualquier apertura automática del cajón al imprimir**. Dejarla activa haría que una reimpresión pudiera abrirlo, fuera del control de COMETA.
3. Descargar el instalador oficial de [QZ Tray](https://qz.io/download/), con su runtime incluido, e instalarlo. La [FAQ oficial](https://qz.io/docs/faq) describe OpenJDK incluido y requisitos. No hace falta instalar Node.js en la caja.
4. Abrir Configuración → Impresora y cajón → **Conectar y buscar impresoras**. Elegir una impresora instalada, papel y perfil, guardar y probar. El cliente no ejecuta scripts, genera certificados ni entrega claves. El nombre guardado se conserva si el conector no responde.
5. Para operación sin avisos repetidos, COMETA administra centralmente `POS_QZ_CERTIFICATE` y `POS_QZ_PRIVATE_KEY`, separados por entorno. La clave PKCS#8 RSA de 2048 bits queda únicamente en servidor; el certificado X.509 es público. La confianza TLS de localhost la instala QZ; es distinta del certificado que firma solicitudes. El certificado demo por computadora **no es la solución autoservicio elegida**. Para confianza distribuible, Premium Support publica US$749 por un año y renovación reducida: [oferta oficial](https://buy.qz.io/Premium-Support-_p_13.html). La página muestra también aviso de disponibilidad: confirmar disponibilidad, cobertura SaaS y condiciones con QZ antes de contratar. No se ha comprado ni activado un certificado comercial. Una raíz propia requiere distribución de confianza y mantenimiento central; no se traslada ese trabajo al cliente.

   **Bloqueo de distribución:** preparar por COMETA un instalador/configuración de conector que restrinja escucha a localhost/WSS, orígenes COMETA explícitos, impresión a archivos/hosts y acceso a archivos. El script existente `scripts/windows/configure-qz-pos.ps1` es una referencia interna de soporte, no un paso del cliente. No declarar esta distribución segura y autoservicio completada hasta ensayarla en Windows; el instalador QZ estándar no incorpora nuestras restricciones por sí solo.

6. Autorizar solo el certificado esperado de COMETA; no aceptar solicitudes sin firma ni de otros sitios. Si Edge/Chrome solicita acceso a red local, permitirlo exclusivamente para el origen elegido. [Restricción de acceso local del navegador](https://qz.io/docs/lna).
7. Iniciar sesión en COMETA POS y configurar el primer administrador de comercio con **su propio PIN y confirmación**. Crear Ventas/Inventario desde **Operadores**, sin compartir PIN. El restablecimiento reemplaza el hash y revoca sesiones; nunca muestra el PIN anterior.
8. Abrir **Configuración → Impresora y cajón de esta terminal** (`/brand/SLUG/pos/settings/terminal`). Seleccionar la impresora Windows detectada, elegir 58/80 mm y guardar. Inicialmente dejar **Sin confirmar · solo imprimir con controlador Windows** y apertura automática apagada. Probar impresión y revisar acentos, recortes y cantidades.
9. Solo si el manual confirma ESC/POS, seleccionar el pin de pulso compatible. Con turno autorizado abierto, elegir caja, escribir motivo y solicitar prueba de cajón. Si no es ESC/POS compatible, mantener apertura automática deshabilitada: hace falta el perfil del fabricante; no probar comandos arbitrarios.
10. Activar impresión automática y, tras la prueba física, apertura por efectivo. Un pago mixto con efectivo envía apertura; tarjeta/transferencia exclusivas no. Reimprimir no genera comando de cajón. Ante resultado incierto, inspeccionar el equipo; no repetir automáticamente la apertura.

## Instalar la app

Abrir el POS autorizado por HTTPS. En Edge: menú **Aplicaciones → Instalar este sitio como una aplicación**; en Chrome: usar **Instalar COMETA POS** en la barra o menú de instalación disponible. Abrir la app instalada, comprobar el negocio y fijarla a la barra de tareas de Windows. El manifest inicia en `/pos`, que resuelve los negocios autorizados y conserva el login; el scope `/` es necesario por las rutas `/brand/[slug]/pos`.

La PWA usa el mismo puente local. Verificar/configurar la terminal desde la ventana instalada. Requiere conexión para confirmar operaciones. El service worker solo cachea manifest/iconos públicos; no HTML, APIs, sesiones ni respuestas privadas. Las actualizaciones esperan aceptación y no fuerzan recarga de la venta en curso.

## Seguridad y comprobación

- Cuenta Supabase propietaria: autoriza el negocio. Operador PIN: limita las operaciones, incluso si la cuenta anfitriona es administradora global. Un cambio de operador no hereda permisos ni el modo administrativo.
- Administrador y usuarios con privilegios administrativos efectivos: bloqueo a los 180 segundos sin actividad humana. Ventas e Inventario predeterminados no usan esa expiración; la sesión general sigue teniendo su vigencia máxima existente. Polling no renueva actividad. El servidor vuelve a comprobarla antes de autorizar operaciones.
- El bloqueo conserva el componente/carrito pendiente y no cierra caja ni crea una venta. La venta se atribuye al operador del cobro confirmado. FOOD conserva sus roles y modo administrativo.
- Apertura manual exige permiso, turno de la marca/sucursal y motivo. Se guarda usuario anfitrión, operador, turno, fecha, solicitud y resultado conocido.

Pruebas automatizadas: `node scripts/test-pos-retail-terminal.mjs`, `node scripts/test-pos-food-access-server-v1.mjs`, `node scripts/test-pos-food-shell-v1.mjs`, `node scripts/test-pos-staff-foundation-v1.mjs`. `scripts/test-pos-retail-terminal.sql` se ensaya junto con las migraciones en una transacción **solo de pruebas**, terminada en `ROLLBACK`.

Pendiente físico: instalación PWA en Windows 10 Pro del cliente; permisos de red local; impresión real 58/80 mm; perfil/pin del cajón; desconexión USB; suspensión y reanudación de ese equipo. No se autoriza una venta ficticia en producción para estas pruebas.

Los permisos de cancelación, devolución y cambio de precio no crean un motor nuevo para esas acciones: solo deben habilitarse cuando exista un recorrido operativo soportado y validado. No presentar una casilla como una operación comercial terminada.

## Evidencia de esta entrega (16 de octubre)

- Build administrativo aislado y build Vercel Preview completados; guardia de build confirmó backend `ephmrsjnpkcgddulvckj` y Stripe test. Producción y storefront no se desplegaron.
- TypeScript sin errores; lint de archivos nuevos y APIs sin errores. En páginas heredadas, lint conserva 7 errores y 3 advertencias preexistentes (comparados con `ede5537`); no se hizo limpieza fuera de alcance. Suite de terminal: casos de efectivo/tarjeta/transferencia/mixto, reimpresión, firma real RSA del mensaje QZ, deduplicación, fallo/resultado incierto y permisos. Son pruebas de software, sin impresora ni ventas reales.
- Regresión: 9 pruebas de servidor y 17 de shell aprobadas, más contratos de staff. Incluyen FOOD y conservación del componente/carrito al bloquear/cambiar operador.
- PostgreSQL real de pruebas: ensayo transaccional con ROLLBACK aprobado; último administrador, bootstrap con operador anterior conservado, PIN, expiración, marca, grants y deduplicación. Dos migraciones aplicadas solo a `magenta-preview-test`; hashes de ambas coinciden con el historial. No aplicadas a producción.
- Pendiente: recorrido autenticado del nuevo administrador PIN en Preview; instalación PWA real y hardware. La firma QZ no está configurada. No declarar impresión/cajón listos físicamente.

### Archivos del cambio

- `.gitignore`
- `docs/pos-retail-terminal-windows.md`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `public/manifest.json`
- `public/pos-icon-192.png`
- `public/pos-icon-512.png`
- `public/sw.js`
- `scripts/prepare-magenta-preview.mjs`
- `scripts/test-pos-food-access-server-v1.mjs`
- `scripts/test-pos-food-shell-v1.mjs`
- `scripts/test-pos-retail-terminal.mjs`
- `scripts/test-pos-retail-terminal.sql`
- `scripts/test-pos-staff-foundation-v1.mjs`
- `scripts/windows/configure-qz-pos.ps1`
- `src/app/api/pos/billing/checkout/route.ts`
- `src/app/api/pos/billing/portal/route.ts`
- `src/app/api/pos/bootstrap/route.ts`
- `src/app/api/pos/cash-sessions/route.ts`
- `src/app/api/pos/imports/route.ts`
- `src/app/api/pos/online-store/operations/route.ts`
- `src/app/api/pos/online-store/payments/route.ts`
- `src/app/api/pos/operator-session/route.ts`
- `src/app/api/pos/sales/route.ts`
- `src/app/api/pos/staff/route.ts`
- `src/app/api/pos/subscription/route.ts`
- `src/app/api/pos/terminal-print/route.ts`
- `src/app/brand/[brandSlug]/components/pos-connection-status.tsx`
- `src/app/brand/[brandSlug]/components/pos-operator-gate.tsx`
- `src/app/brand/[brandSlug]/components/pos-shell.tsx`
- `src/app/brand/[brandSlug]/components/pos-sidebar.tsx`
- `src/app/brand/[brandSlug]/components/pos-topbar.tsx`
- `src/app/brand/[brandSlug]/pos/register/page.tsx`
- `src/app/brand/[brandSlug]/pos/sales/page.tsx`
- `src/app/brand/[brandSlug]/pos/settings/page.tsx`
- `src/app/brand/[brandSlug]/pos/settings/terminal/page.tsx`
- `src/app/brand/[brandSlug]/pos/staff/page.tsx`
- `src/lib/pos/access.ts`
- `src/lib/pos/mutation-access.ts`
- `src/lib/pos/retail-permissions.ts`
- `src/lib/pos/staff-server.ts`
- `src/lib/pos/thermal-client.ts`
- `src/lib/pos/thermal.ts`
- `src/types/qz-tray.d.ts`
- `supabase/migrations/20261016090000_pos_retail_operators_v1.sql`
- `supabase/migrations/20261016091000_pos_terminal_print_jobs_v1.sql`

FOOD conserva la reimpresión del navegador; el puente y su configuración se limitan a comercio. Editar un operador legado conserva sus permisos efectivos salvo cambio explícito. Cancelación/devolución/cambio de precio no se anuncian como acciones disponibles porque no se añadió un motor nuevo para ellas.

## Continuación autoservicio

- Consulta de impresoras firmada únicamente para `printers.find` sin filtros, con permiso SETTINGS, autenticación de marca, mismo origen y vencimiento de 30 segundos. Comparte la cola del cliente con impresión para evitar mezclar callbacks de firma. No permite firmar operaciones arbitrarias.
- JS instalado: 2.2.5. Contrato print/firma contrastado con el código oficial QZ Tray 2.3.0; prueba RSA y opciones reales de la dependencia aprobadas. Conexión real JS/Tray y permisos de red local aún pendientes en Windows; no equivale a compatibilidad física verificada.
- No se modificaron roles, PIN, PWA, motor de venta ni migraciones con este ajuste.
- Prueba física exclusivamente en Preview: efectivo (ticket y una apertura), tarjeta/transferencia (ticket sin apertura), mixto efectivo (una apertura), reimpresión (sin apertura), USB desconectado (venta confirmada conservada, sin volver a cobrar). Windows puede aceptar y retener una cola sin USB: revisar o cancelar esa cola antes de reimprimir para no duplicar tickets al reconectar. Nunca repetir automáticamente una apertura incierta.
- Recorrido personal pendiente: crear primer administrador con PIN propio; probar Ventas e Inventario con sus propios PIN, rechazo de permisos, administrador tras 180 segundos y regreso de suspensión; conservar carrito al bloquear/cambiar. No confundir suites de software aprobadas con este recorrido autenticado.

### Enlaces de Preview

- POS: https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos
- Terminal: https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos/settings/terminal
- Operadores: https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos/staff
