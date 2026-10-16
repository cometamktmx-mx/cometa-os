# COMETA POS comercio — terminal Windows

Esta entrega conserva el catálogo, precios, códigos, existencias, motor de cobro y reglas fiscales. La compatibilidad física requiere conocer y probar el modelo de impresora. No hay confirmación física del cajón: el resultado registrado describe la solicitud y la aceptación por el puente, no el movimiento mecánico.

## Preparación técnica

Migraciones, en orden (sin seeds ni cambios de catálogo):

1. `20261016090000_pos_retail_operators_v1.sql`: columnas aditivas de rol/permisos de comercio, actividad humana de sesión, guardia transaccional del último administrador, límite atómico de intentos de PIN y acceso de la RPC de venta exclusivamente desde servidor. Conserva roles/PIN existentes y FOOD. Los usuarios existentes requieren revisión explícita de permisos; cambiar una etiqueta no les concede nuevos permisos.
2. `20261016091000_pos_terminal_print_jobs_v1.sql`: configuración por terminal y solicitudes auditadas con deduplicación y despacho de una sola vez. Tablas privadas para `service_role` detrás de autenticación, marca y operador.

No basta revertir código para deshacer las migraciones. Si hay que retirar esta versión, conservar columnas y registros de auditoría, detener impresión automática y restaurar la versión anterior de aplicación. No eliminar datos con escrituras posteriores. La revocación de ejecución pública de la RPC financiera debe conservarse.

Dependencia web: `qz-tray@2.2.5` fijada en lockfile. Puente de escritorio recomendado: QZ Tray **2.3 o posterior compatible**, por las restricciones de origen y red. No se instala Electron ni un servidor propio.

Variables **solo servidor**, separadas por entorno:

- `POS_QZ_CERTIFICATE`: certificado público de firma, PEM completo.
- `POS_QZ_PRIVATE_KEY`: clave privada de firma, PEM completo; jamás `NEXT_PUBLIC_*`, navegador, repositorio, ticket o chat.

Sin ambas variables la impresión automática permanece sin capacidad de despacho. La venta confirmada no se revierte ni se vuelve a cobrar. El operador puede reimprimir una vez configurado el puente. No copiar una clave/certificado de laboratorio al despliegue operativo sin instalar y verificar su confianza.

La API firma únicamente el hash SHA-256 de una orden de impresión autorizada, con RSA SHA-512, conforme al cliente QZ. Valida origen, sesión/operador, marca, terminal, datos generados en servidor, impresora y opciones exactas, vencimiento y despacho único. No firma archivos, sockets, programas ni datos de impresión arbitrarios.

## Instalación en la computadora del cliente

1. Obtener marca/modelo exactos, ancho de papel, controlador Windows y manual del conector del cajón. Conectar impresora USB y cajón **al puerto indicado por el fabricante**. Instalar el controlador oficial y comprobar primero una página de prueba de Windows.
2. En preferencias del controlador, **desactivar cualquier apertura automática del cajón al imprimir**. Dejarla activa haría que una reimpresión pudiera abrirlo, fuera del control de COMETA.
3. Descargar el instalador oficial de [QZ Tray](https://qz.io/download/), con su runtime incluido, e instalarlo. La [FAQ oficial](https://qz.io/docs/faq) describe OpenJDK incluido y requisitos. No hace falta instalar Node.js en la caja.
4. Ejecutar en PowerShell `scripts/windows/configure-qz-pos.ps1 -Origin "https://ORIGEN-EXACTO-A-PROBAR"`, usando el origen real de Preview o producción, sin rutas. El script configura únicamente QZ para el usuario Windows: escucha en `127.0.0.1`, WSS, origen explícito y sin File IO ni impresión a archivos/hosts. Conserva opciones existentes si detecta conflicto. Cerrar QZ y volver a abrirlo. Verificar que sus puertos no escuchan en interfaces de red; no abrir el firewall para otras computadoras. Opciones respaldadas por la [documentación oficial](https://qz.io/docs/command-line).
5. Configurar confianza y firma. Para un ensayo en ese equipo: QZ → **Advanced → Site Manager → + → Create New**, siguiendo [Signing](https://qz.io/docs/signing). Sus claves de demostración solo sirven en la instalación que las genera. Entregar los archivos al responsable técnico por un medio privado para configurar las variables de **Preview**, nunca pegarlos al chat. Para operación estable, usar certificado QZ o una raíz propia administrada. QZ es gratuito; su certificado/soporte comercial tiene costo. No se ha contratado licencia ni se promete impresión silenciosa sin confianza configurada. Véase [licencias y avisos](https://qz.io/docs/faq).
6. Autorizar solo el certificado esperado de COMETA; no aceptar solicitudes sin firma ni de otros sitios. Si Edge/Chrome solicita acceso a red local, permitirlo exclusivamente para el origen elegido. [Restricción de acceso local del navegador](https://qz.io/docs/lna).
7. Iniciar sesión en COMETA POS y configurar el primer administrador de comercio con **su propio PIN y confirmación**. Crear Ventas/Inventario desde **Operadores**, sin compartir PIN. El restablecimiento reemplaza el hash y revoca sesiones; nunca muestra el PIN anterior.
8. Abrir **Configuración → Impresora y cajón de esta terminal** (`/brand/SLUG/pos/settings/terminal`). Copiar el nombre exacto de la impresora Windows, elegir 58/80 mm y guardar. Inicialmente dejar **Sin confirmar · solo imprimir con controlador Windows** y apertura automática apagada. Probar impresión y revisar acentos, recortes y cantidades.
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
- TypeScript sin errores; lint dirigido sin errores. Suite de terminal: casos de efectivo/tarjeta/transferencia/mixto, reimpresión, firma real RSA del mensaje QZ, deduplicación, fallo/resultado incierto y permisos. Son pruebas de software, sin impresora ni ventas reales.
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
