# Magenta — preparación Windows, 14 octubre 2026

## Ajuste de experiencia POS y pago Stripe completo verificado

**Estado vigente:** el usuario completó manualmente el Checkout test. Se verificó la cadena real del pedido **9594E855** (`9594e855-ddef-4831-a8c0-2181d07623ff`): sesión Stripe `complete/paid`, PaymentIntent `succeeded`, evento Stripe real correlacionado con sesión, intención e importe **300.00 MXN**, ledger del webhook, pedido PAID y un único efecto SALE de 3 unidades para la variante importada. Inventario final **5 unidades, reserva 0**. El aviso está persistido y ya leído; se corrigió la prueba que confundía ausencia de avisos no leídos con ausencia del evento. No se creó otro cobro ni se falsificó un evento remoto. La evidencia detallada permanece en `.next/magenta-functional/ephmrsjnpkcgddulvckj/verified-payment.json`, fuera de Git.

### URLs funcionales para revisar

- Administración: **https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app**.
- Pedidos online: **https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos/online-store/orders**.
- Pedido pagado: **https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos/online-store/orders?order=9594e855-ddef-4831-a8c0-2181d07623ff**.
- Atelier: **https://magenta-controlled-preview-test-delivery-cometa-os-s-projects.vercel.app**.

Las credenciales siguen en el archivo local privado `ACCESO-PRUEBAS.txt` indicado más abajo. Ambos alias son exclusivamente de pruebas; el publicador y verificador exigen `Ready/preview` y comparan los destinos Production, sin cambiar dominios operativos. Diseño Atelier, escáner y avances M1–M6 conservados.

### Experiencia implementada

- **Navegación:** Pedidos online en Operación, inmediatamente después de Ventas. Una sola Tienda online en Sistema, hacia configuración operativa. Se retiraron los enlaces a Apariencia del menú, de la cabecera de operaciones y de módulos; el editor y sus rutas conservan su implementación. La selección activa de configuración ya no abarca pedidos; el topbar resuelve primero la ruta más específica. Listado y detalle usan Pedidos online → folio → Volver a pedidos, sin pestañas Configuración/Apariencia/Pedidos. Se conservan filtros Retail, restricciones de operador, permisos y autorización por marca.
- **Detalle:** cabecera con folio/fecha/canal y estados separados; artículos con miniatura o placeholder, datos históricos, cantidad/precio/subtotal; cliente; dirección o recolección/horario/instrucciones; resumen de productos, descuentos, envío y total; botones con las mismas precondiciones/transiciones y advertencia de reembolso pendiente. Historial en español con fechas es-MX. Paneles y artículos adaptables, listado con desplazamiento horizontal cuando hace falta. Cambio de ruta/marca reinicia el estado de la vista para evitar mostrar datos anteriores.
- **Históricos:** no se reescriben nombres, opciones, importes ni snapshots existentes. Si falta SKU/código histórico, se ofrece la referencia actual etiquetada explícitamente. La imagen usa la ruta histórica del espacio inmutable de medios, después imagen actual validada dentro de la misma marca y finalmente placeholder, también al fallar la descarga. Nunca se aceptan URLs arbitrarias desde snapshots. Cuando un pedido antiguo no desglosa descuento, se informa “No desglosados”; no se inventa cero.
- **Avisos:** mapeo compartido de todos los eventos reales y estados, incluidos CREATED, PAYMENT_PAID, PAYMENT_EXPIRED, revisión/cancelación de pago, preparación, listo, envío, entrega y cancelación. Valores desconocidos (incluidos nombres de propiedades heredadas de JavaScript) muestran texto neutral en español. La campanita presenta folio, mensaje, fecha y estado Leído/No leído; “Marcar como leído” persiste sin ocultar el aviso. Cuenta solo pendientes, mantiene reconexión, sonido activado por clic y deduplicación; no promete sonido con navegador cerrado.

### Migración M8: acotada y aplicada solo a pruebas

`20261014180000_store_order_presentation_m8.sql` añade metadatos de presentación al insertar artículos nuevos: SKU, barcode, opciones, color y ruta de foto publicada, y nombre de sucursal al capturar la entrega. El enriquecimiento se conserva cuando M7 añade el precio/mayoreo; no modifica importes ni funciones de pago, reservas o inventario. No hay backfill de pedidos antiguos. Añade lectura de historial de avisos con los mismos controles `store_actor_m7`, destinatario y marca; la RPC anterior de avisos no leídos sigue disponible. La API opta al historial solo con `includeRead=1`.

Se probó desde cero en `cometa_bootstrap_1792001843987`: **85 migraciones**, cadena comercial local y prueba específica M8. PASS captura de datos/foto/sucursal, retención de precios, reintentos inmutables, históricos previos sin cambios, avisos leídos/no leídos, marcación idempotente y denegación de rol/marca ajena. La base temporal se eliminó por su nombre. Se aplicó únicamente a **`ephmrsjnpkcgddulvckj` / `magenta-preview-test`**, validado por metadatos. Un fingerprint transaccional comprobó que pedidos, snapshots existentes, inventario y efectos fueran idénticos antes y después; sin ampliar grants de tablas.

### Verificación y límites

- `node scripts/test-order-presentation.mjs`: PASS sobre componentes React reales, navegación/selección, datos antiguos/incompletos, alternativas de imagen y SKU, descuentos, acciones por estado y textos conocidos/desconocidos. Verifica markup y estructura adaptable; **no es revisión visual en navegador**.
- `node scripts/test-store-operations-api.mjs`: PASS autorización, marca ajena, validación, conflictos, errores seguros y selección compatible entre historial nuevo/avisos anteriores; transporte simulado.
- `node scripts/test-storefront-m6-local.mjs --operations`: PASS en `cometa_m6_1792002182881`, **con M8 instalada antes de la matriz M7**. Conserva M3–M6, compras, mayoreo, envío/recolección, concurrencia, último stock, webhook firmado local, transiciones, guía, cancelación pagada con una sola compensación, expiración y privacidad/RLS. Base temporal eliminada; ninguna operación remota de pago.
- `node scripts/test-magenta-functional-preview.mjs --check --verify-payment`: PASS en Preview con datos reales sintéticos: seis rutas storefront, página autenticada de pedidos, metadatos de detalle, historial leído, POS anónimo 401, origen ajeno 403, firma falsa 400, privacidad de comprador, reanudaciones concurrentes sin reserva duplicada y correlación Stripe completa del pago existente.
- TypeScript `--noEmit --incremental false --pretty false`: PASS. Builds administrativos/storefront Ready/preview con comprobación previa del backend aislado; sin desactivar TypeScript y sin bloqueo por `standalone`. Lint dirigido PASS en cambios nuevos. **Deuda preexistente separada:** `react-hooks/set-state-in-effect` en `pos-sidebar.tsx`, `setCanManageTeam(teamPermissionCache.get(brandSlug) || false)`; confirmado también en HEAD anterior, no se limpió incidentalmente.
- `cua.getState()` devolvió cero apps y cero navegadores. No se eludió el bloqueo ni se generaron capturas ficticias. **Pendientes para revisión manual:** composición visual real móvil/escritorio, interacción del menú/campanita y reproducción de sonido. No se hicieron nuevas aprobaciones visuales del Atelier ya aprobado.

### Archivos exactos de este ajuste

Modificados:

- `src/app/brand/[brandSlug]/components/pos-sidebar.tsx`
- `src/app/brand/[brandSlug]/components/pos-topbar.tsx`
- `src/app/brand/[brandSlug]/components/pos-store-bell.tsx`
- `src/app/brand/[brandSlug]/pos/online-store/operations.tsx`
- `src/app/workspace/brands/[brandSlug]/brand-modules.tsx`
- `src/app/api/pos/online-store/operations/route.ts`
- `scripts/test-magenta-functional-preview.mjs`
- `scripts/test-magenta-bootstrap-local.mjs`
- `scripts/test-store-operations-api.mjs`
- `scripts/test-storefront-m6-local.mjs`
- `docs/magenta-delivery-20261014.md`

Añadidos:

- `packages/own-storefront/order-presentation.ts`
- `src/app/brand/[brandSlug]/pos/online-store/order-detail.tsx`
- `src/lib/pos/order-presentation.ts`
- `supabase/migrations/20261014180000_store_order_presentation_m8.sql`
- `scripts/apply-magenta-presentation-test.mjs`
- `scripts/test-order-presentation.mjs`
- `scripts/test-order-presentation-local.mjs`

Se conserva `../cometa-hotfix-recovery/` fuera de la tarea. Sin merge ni cambios de Production. Los apartados inferiores son checkpoints históricos; sus pendientes de completar el pago ya fueron resueltos por esta verificación.

## Estado vigente: backend autorizado y Preview funcional

Este apartado sustituye los bloqueos de infraestructura descritos en los checkpoints históricos inferiores. El diseño Atelier está aprobado por el usuario y no se modificó. No se hizo merge, despliegue Production ni cambio de dominio operativo.

### Acceso

- Administración: **https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/login**.
- POS sintético: **https://cometa-os-magenta-test-delivery-cometa-os-s-projects.vercel.app/brand/magenta-preview/pos**.
- Tienda Atelier: **https://magenta-controlled-preview-test-delivery-cometa-os-s-projects.vercel.app**; rutas `/`, `/catalogo`, `/bolsa`, `/checkout`, `/pedidos`. La ruta exacta del producto sintético está en el archivo privado de acceso.
- Usuario, contraseña y enlace Checkout test: archivo local ignorado `.next/magenta-functional/ephmrsjnpkcgddulvckj/ACCESO-PRUEBAS.txt`. No se publican credenciales ni enlaces privados de Stripe en este informe. Si Vercel pide autenticación, usar la cuenta del equipo; la protección del panel permanece activa.
- Storefront inmutable funcional: https://magenta-controlled-preview-l7d8licsm-cometa-os-s-projects.vercel.app. Para compra y retornos usar la dirección estable de pruebas indicada arriba, que coincide con el origen autorizado.
- Administración inmutable final: https://cometa-aq5zcmpq3-cometa-os-s-projects.vercel.app; Ready/preview. Los logs remotos de ambas aplicaciones confirman `Verified isolated Preview build target` y compilación correcta.
- Preview visual histórica: https://magenta-controlled-preview-hme052ccm-cometa-os-s-projects.vercel.app. No confundirla con la tienda funcional.

### Supabase: evidencia y escrituras autorizadas

Se verificó mediante CLI que **`ephmrsjnpkcgddulvckj`** corresponde a **`magenta-preview-test`**, `ACTIVE_HEALTHY`, creado el 14/10/2026, región `us-west-2`. Antes de escribir: **0 tablas public, 0 usuarios Auth y 0 objetos Storage**. Se aplicaron los **84 archivos originales** de baseline/migraciones y se registraron en el ledger; cada archivo produjo su SHA-256 en la ejecución. No se vinculó el repositorio a otra base ni se usaron bases operativas.

Se creó un único usuario Auth sintético con email confirmado sin enviar correo, una marca `magenta-preview`, sucursal MXN, caja y cortesía Pro. Producto/variante y stock inicial de **10 unidades** se crearon con la RPC real `pos_import_v1` (productos e inventario). La primera prueba HTTP encontró `POS_SUBSCRIPTION_NOT_FOUND`: faltaba el registro comercial base aunque existía la cortesía. Se corrigió el aprovisionador para llamar `pos_initialize_brand_setup`, y se completó solo esa marca remota mediante la misma RPC. Estado local `trial`, sin `stripe_subscription_id`, sin suscripción externa ni cargo.

### Variables y despliegues

Administración usa variables **Preview + rama `delivery/magenta-20261014`**. La tienda no tiene Git conectado: Vercel rechazó su intento de variable por rama sin crearla. Se resolvió con overrides exclusivos de cada despliegue Preview, tanto build como runtime, enviados por entorno del proceso (solo nombres en argv). No se conectó Git ni se editaron registros compartidos Production/Preview. Ambos apuntan al mismo Supabase test.

Las copias de despliegue excluyen `.env`, secretos, datos, archivos SQL y Git. Una guarda anterior a `next build` exige `VERCEL_ENV=preview`, la URL exacta del backend autorizado y clave `sk_test_`. El publicador comprueba proyecto, rootDirectory y existencia del destino Production antes de usar `--target preview`; inspecciona la clasificación devuelta y detiene cualquier acción posterior si no es Preview. Los dos alias nuevos de pruebas devolvían 404 antes de crearse y solo se asignan a despliegues Ready/preview del proyecto esperado. No se tocó ningún alias Production. Los IDs de Production y rootDirectory se compararon antes/después y permanecen iguales.

Además de la clave específica del storefront, las rutas Stripe administrativas reciben claves test explícitas; sus webhooks de suscripciones/COMU ajenos a esta prueba quedan deshabilitados en la Preview. OpenAI y automatizaciones de WhatsApp se deshabilitan en este entorno. No se mandaron mensajes ni cargos reales.

### Stripe y expiraciones

- Endpoint **test** configurado en la cuenta test ya validada: storefront `/api/stripe/webhook`, sobre la URL estable de pruebas. Eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Secreto de firma privado, compartido con la configuración administrativa para indicar `TEST_CONFIGURED`. No se creó un segundo endpoint administrativo para estos pedidos.
- El webhook llega mediante el mecanismo oficial de Automation Bypass de Vercel, con token privado; no se desactivó Vercel Authentication. Se comprobó HTTP 400 sin firma y con firma inválida.
- `pg_cron`: job `magenta-preview-expiry`, activo cada minuto; conexión del scheduler y ejecución bajo `service_role`. Se verificó `cron.job_run_details.status=succeeded`.
- Prueba remota real: una orden sintética reservó 1 unidad; preparación privilegiada venció únicamente su fecha; el **temporizador remoto** la convirtió en EXPIRED y restauró la reserva. Dos repeticiones concurrentes de la RPC no liberaron dos veces. Rol anon denegado. No se ampliaron permisos de tablas: el intento inicial de preparar la fecha mediante service_role fue denegado y se sustituyó por SQL de fixture acotado al pedido y la marca test.
- La protección del pedido pagado frente a expiración está probada en PostgreSQL local; la misma prueba remota sobre un pago confirmado depende del Checkout pendiente.

### Recorrido y verificaciones reales

- **PASS remoto:** login sintético real Supabase → autorización POS → configuración persistida y `TEST_CONFIGURED` → venta POS por HTTP de **2 unidades del mismo producto importado** → stock **8**, reserva 0.
- **PASS remoto:** compra web por HTTP, entrega PICKUP, snapshots de productos/contacto/importes, total calculado en servidor **300.00 MXN**, sesión **real de Stripe Checkout test** → stock **8**, reserva **3**. No se declaró PAID al crear el enlace.
- **PASS remoto:** pedido y aviso persistido consultables en POS, eventos sin IDs duplicados; consulta de comprador con su cookie, sin cookie no se revela la orden; reanudaciones concurrentes conservan pedido y reserva.
- **PASS HTTP:** portada, catálogo, producto real, bolsa, checkout y pedidos devuelven 200; POS sin sesión 401; origen ajeno al checkout 403; webhook con firma inválida 400. Son pruebas HTTP, no revisión visual ni de sonido.
- **PASS local repetido:** `node scripts/test-magenta-bootstrap-local.mjs`, base vacía `cometa_bootstrap_1791999549863`, 84 migraciones y fixture corregido. Importación → venta → compra → webhook firmado sintético → aviso → inventario; concurrencia, duplicados y expiración conservan el pagado. Se eliminó exclusivamente esa base temporal. No se reinicializó la instancia ni se borraron contenedores/volúmenes existentes.
- **PASS:** TypeScript sin emisión, pruebas de configuración Preview, ESLint dirigido y `git diff --check`. Builds remotos de ambas aplicaciones Ready/preview, incluido el administrativo con `/comu/seller/orders`; sin omitir TypeScript. Las copias usan las raíces de monorepo del proyecto y los endpoints funcionan en Vercel; no se reprodujo un bloqueo de despliegue por `standalone`.

### Pendiente indispensable

**El Checkout alojado aún requiere que el usuario complete el pago con tarjeta test desde el enlace privado.** Se solicitó ese paso cuando la sesión estuvo disponible, conservando el bloqueo previo del navegador de automatización. No se usó una firma sintética para marcar este pedido remoto como pagado. El enlace vence aproximadamente 35 minutos tras su creación; una sesión vencida necesita recuperar/crear una nueva compra de prueba, no forzar el estado.

Después: `node scripts/test-magenta-functional-preview.mjs --verify-payment` debe comprobar Checkout `complete/paid`, PaymentIntent `succeeded`, pedido PAID mediante webhook, aviso y cantidad final **5/reserva 0**. Hasta entonces **no se certifica pago completo Stripe ni el tramo posterior al pago**. La consulta segura del comprador fue probada por HTTP con la cookie del runner; abrir directamente el Checkout privado en otro navegador no transfiere esa cookie y su retorno no constituye prueba de confirmación UI. Revisión interactiva, cámara y sonido quedan para el usuario; diseño Atelier aprobado se conserva.

### Archivos de esta continuación

Modificados: `scripts/provision-magenta-test-backend.mjs`, `scripts/magenta-preview-fixture.mjs`, `scripts/magenta-preview-environment.mjs`, `scripts/prepare-magenta-preview.mjs`, `scripts/test-magenta-preview-environment.mjs`, `docs/magenta-delivery-20261014.md`.

Añadidos: `scripts/deploy-magenta-functional-preview.mjs`, `scripts/verify-magenta-preview-deployments.mjs`, `scripts/test-magenta-functional-preview.mjs`, `scripts/test-magenta-remote-expiry.mjs`. Sin cambios a código UI/API, migraciones históricas, escáner ni avances M1–M6. Se conserva `../cometa-hotfix-recovery/` fuera de la tarea.

## Continuación desde 8818ef9 — arranque vacío y automatización preparada

Estado vigente: los pasos manuales se reducen a disponer de un proyecto Supabase vacío, exclusivo de pruebas y sin coste. No existe uno verificable entre los tres proyectos accesibles; se repitió la consulta de metadatos. No se creó ningún servicio, no se desplegó ni se cambiaron variables o dominios remotos en esta continuación.

### Única acción manual pendiente ahora

En **Supabase Dashboard → New project**, seleccionar una organización **Free con cupo disponible**, nombre exacto **`magenta-preview-test`**, región **East US (North Virginia)** si está disponible, y generar/guardar la contraseña de base de datos en el gestor privado. Confirmar creación solo si no exige suscripción ni cobro. No pausar, borrar ni transferir proyectos actuales para conseguir cupo. Si no hay cupo gratuito, informar ese impedimento antes de crear nada. Supabase limita los proyectos Free activos; otra organización no garantiza cupo adicional ([billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)).

Al quedar activo, enviar únicamente **Project Settings → General → Reference ID** y confirmar que está vacío y reservado a pruebas Magenta. No enviar contraseña ni claves por chat. El CLI autenticado permite ejecutar SQL contra `--project-ref` mediante Management API y recuperar claves en memoria; no hace falta que el usuario copie credenciales o ejecute SQL. No se modifica el vínculo existente de Supabase.

### Baseline vacío y cadena sintética: resultados reales

- `node scripts/test-magenta-bootstrap-local.mjs`: **PASS** en `cometa_bootstrap_1791996808435`; base creada desde template0, cero tablas public y cero usuarios al inicio. Se cargó únicamente DDL técnico Auth/Storage sin políticas de aplicación ni filas, y la publicación técnica `supabase_realtime`; ningún esquema public ni dato operativo fue copiado. Después se aplicaron **los 84 archivos originales** de `supabase/migrations`, ordenados, con envoltura transaccional y retirada de BOM UTF-8. No se cambió ninguna migración histórica.
- Primeros ensayos detectaron requisitos del entorno de ejecución: publicación Realtime ausente, políticas de aplicación incluidas indebidamente en el DDL técnico, `LOCK TABLE` fuera de transacción y BOM insertado después de BEGIN. Se corrigió el runner, sin omitir archivos. El baseline completo también pasó por separado en `cometa_bootstrap_1791996625395`.
- El aprovisionador compartido creó usuario/perfil sintéticos, marca **Magenta — PRUEBAS SINTETICAS**, slug `magenta-preview`, sucursal MXN, caja, acceso Pro de cortesía por 30 días sin suscripción Stripe, tienda habilitada, contenido publicado y destinatario POS. El producto y sus **10 unidades** se crean mediante las RPC reales del importador, no insertando productos/inventario directamente.
- **Mismo producto/variante:** importación 10 → `pos_complete_sale_v4` de 2 → cantidad 8 → orden web/reserva de 3 → handler webhook real con firma SDK sintética → cantidad 5/reserva 0 → aviso persistido para el destinatario. El webhook duplicado concurrente genera un solo pago/efecto SALE. Firma inválida, live, importe y marca ajena rechazados.
- Se creó otra orden pendiente, se vencieron sus fechas y las del pedido pagado, y se ejecutó el comando de expiración concurrentemente y de nuevo: solo pendiente pasó a EXPIRED, reserva volvió a 0, cantidad siguió en 5 y el pagado permaneció PAID. Roles anon/authenticated no pueden ejecutar la RPC.
- Todas las bases `cometa_bootstrap_*` creadas por los ensayos fueron eliminadas por su propio nombre, sin FORCE. Sin resets/prune ni cambios a bases, contenedores o volúmenes existentes.
- **Esto sigue sin ser un pago completo procesado por Stripe ni un recorrido UI autenticado en Preview.** Se probó continuidad SQL del mismo artículo y handler firmado local; la compra Checkout real necesita el backend remoto y la interacción del usuario mientras el navegador siga bloqueado.

### Stripe: credenciales existentes y endpoints

`node scripts/check-magenta-stripe-test.mjs --verify`: `COMU_STRIPE_SECRET_KEY` y `STRIPE_SECRET_KEY` locales tienen prefijo `sk_test_` y ambas respondieron a `accounts.retrieveCurrent()` en la **misma cuenta**. Se consultó solo la cuenta, sin pagos ni cambios; no se imprimieron valores. La variable específica `STOREFRONT_STRIPE_TEST_SECRET_KEY` sigue ausente, pero puede poblarse desde la clave test validada. No hay que pedir otra clave al usuario.

| Aplicación / ruta | Responsabilidad | Necesaria para esta entrega |
| --- | --- | --- |
| Storefront `/api/stripe/webhook` | Pago de órdenes de tienda propia M6/M7 | **Sí, un endpoint test** |
| Admin `/api/stripe/webhook` | Suscripciones comerciales POS | No; cortesía sintética cubre acceso POS |
| Admin `/api/comu/stripe/webhook` | Pagos/finanzas del marketplace COMU | No; no es receptor del pedido de tienda propia |
| Admin `/api/comu/stripe/connect-webhook` | Stripe Connect de COMU | No |

Las rutas iguales `/api/stripe/webhook` tienen hosts y dominios funcionales distintos: no se debe enviar el mismo evento de tienda a ambos. Para tienda propia, eventos **snapshot** `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, en la cuenta test validada. No se requieren precios Stripe ni clave publicable para Checkout alojado.

`configure-magenta-test-webhook.mjs <ref> <origin> --apply` está preparado: exige destino storefront **Ready/preview**, configura un secreto de Automation Bypass mediante API oficial sin desactivar Vercel Authentication, comprueba que el handler responde, crea/actualiza únicamente su endpoint test identificado por metadata y guarda `whsec` en `.next` ignorado. La URL privada agrega `x-vercel-protection-bypass`; no se imprime ni se incluye en Git. No utiliza el secreto para el navegador. [API oficial Vercel](https://vercel.com/docs/rest-api/projects/update-protection-bypass-for-automation), [webhooks protegidos](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

### Expiraciones: ejecutor concreto

`supabase/preview/install-expiry.sql` prepara **pg_cron**, job **`magenta-preview-expiry`**, cada minuto, comando `set role service_role; select public.store_orders_expire_m6('magenta-preview');`. El instalador exige sesión PostgreSQL privilegiada, referencia explícita distinta de los tres proyectos conocidos, una sola marca sintética y únicamente el usuario de prueba. `cron.schedule` usa el mismo nombre al reinstalar, evitando jobs duplicados. La autenticación es la conexión del scheduler PostgreSQL; luego reduce al rol service_role, único rol de aplicación autorizado a la RPC. No necesita secreto HTTP, Vercel cron ni desproteger el panel. El endpoint POST `/api/checkout/expire` existente conserva su autenticación, pero no es la vía elegida.

Comando/efectos/autorización/idempotencia probados en PostgreSQL real como se describe arriba. **Instalación pg_cron y ejecución por reloj en el backend remoto aún pendientes**: después de aprovisionar, comprobar `cron.job`, esperar un ciclo y verificar `cron.job_run_details.status='succeeded'`, luego repetir con pedidos sintéticos vencidos/pagados. No se simula que el temporizador ya corrió. Vercel ejecuta sus cron en producción, por eso no se añadió un cron allí ([Vercel Cron](https://vercel.com/docs/cron-jobs)); Supabase Cron admite llamadas SQL ([documentación](https://supabase.com/docs/guides/cron)).

### Aprovisionamiento y variables listos para el agente

- `provision-magenta-test-backend.mjs <ref>` solo imprime plan. Con `--apply`, bloquea las tres referencias existentes, exige nombre exacto/estado activo y cero tablas public/usuarios, valida Stripe test antes de mutar, aplica archivos registrando ledger, crea usuario con Auth Admin (`email_confirm`, sin correo), carga fixture y job. Contraseña sintética y claves se guardan solo en `.next/magenta-functional/<ref>/`, nunca stdout/Git. Si falla parcialmente, se detiene: no resetea ni reaplica automáticamente una base no vacía.
- `magenta-preview-environment.mjs <ref> <admin-preview-origin> <store-preview-origin>` prepara nombres sin valores. `--apply` exige inspección **Ready/preview** de ambos proyectos esperados y usa `vercel env add … preview --git-branch delivery/magenta-20261014 --project <id>` con valores por stdin. No escribe los registros compartidos Production/Preview. No contiene `deploy`, `promote`, cambios DNS ni aliases.
- Variables de Supabase de ambos runtimes se derivan del mismo `<ref>` confirmado; origen y mapa `OWN_STOREFRONT_URLS` apuntan a Preview. La clave test se asigna a `STOREFRONT_STRIPE_TEST_SECRET_KEY`; el `whsec` de storefront se comparte con la comprobación de configuración del administrador, sin crear otro receptor. Se bloquean envíos WhatsApp/IA y COMU en esta rama para el recorrido sintético.
- Orden operativo restante: proyecto vacío confirmado → aprovisionar/migrar → verificar cron → configurar overrides de rama con orígenes Preview existentes → desplegar solo a proyectos ya establecidos con destino Preview verificado → configurar endpoint test contra storefront funcional → subir `whsec` de rama y recompilar → confirmar Auth URLs y cuenta/política Stripe → ejecutar Checkout test real y seguir los IDs hasta POS/avisos/inventario. No utilizar el proyecto administrativo sin despliegues ni un primer deploy susceptible de autopromoción. No desplegar los artefactos de build con claves ficticias.
- `test-magenta-preview-environment.mjs`: PASS rechazo de claves live, localhost, referencias conocidas y dominios de producción; backend compartido de pruebas y controles de envíos. Dry-run de aprovisionador/webhook: PASS, sin mutaciones. ESLint dirigido: PASS. TypeScript sin emisión: PASS. Build administrativo/storefront aprobado en checkpoint anterior, sin cambios de aplicación en esta iteración. Los scripts remotos están preparados pero aún no ejecutados contra un proyecto nuevo.

Archivos exactos de esta continuación: modificados `scripts/test-store-webhook-local.mjs` (slug parametrizable, default conservado) y este informe; añadidos `config/magenta-preview-deployment.json`, `scripts/check-magenta-stripe-test.mjs`, `scripts/configure-magenta-test-webhook.mjs`, `scripts/magenta-preview-environment.mjs`, `scripts/magenta-preview-fixture.mjs`, `scripts/provision-magenta-test-backend.mjs`, `scripts/test-magenta-bootstrap-local.mjs`, `scripts/test-magenta-preview-environment.mjs`, `supabase/preview/install-expiry.sql`. `../cometa-hotfix-recovery/` intacto y excluido.

## Continuación desde 73b3cd4 — build y dependencias exactas

Esta sección es el estado más reciente. Se conserva la rama `delivery/magenta-20261014` y el trabajo anterior. En esta continuación no se desplegó, no se modificaron dominios ni variables remotas y no se accedió a datos operativos.

### URL visual y rutas

URL exacta: **https://magenta-controlled-preview-hme052ccm-cometa-os-s-projects.vercel.app**. Se repitió `vercel inspect`: `dpl_ABfALPXGoyV6EC82Kg674BdhVL8G`, `target preview`, `Ready`.

| Ruta en esa URL | Qué revisar |
| --- | --- |
| `/` | Portada, hero, categorías, look, tipografía, footer y responsive |
| `/catalogo` | Tarjetas, proporciones y catálogo sintético |
| `/productos/11111111-1111-4111-8111-111111111111` | Ficha, estructura de galería y variantes; controles desactivados |
| `/bolsa` | Presentación estática; no persistencia |
| `/checkout` y `/pedidos` | Aviso de recorrido bloqueado, no formularios funcionales |

No se volvió a automatizar el navegador bloqueado. La revisión visual permanece pendiente del usuario.

### Corrección mínima del build

`src/app/comu/seller/orders/page.tsx` exportaba una página con prop adicional `brandSlug?: string`, incompatible con la validación de App Router. La primera búsqueda se limitó indebidamente al árbol COMU; el build detectó el consumidor Brand OS en `src/app/brand/[brandSlug]/comu/orders/page.tsx`. Se retiró la prop de la página y se trasladó su rama por marca a ese wrapper, que ahora usa directamente el gestor existente manteniendo `requireBrandAccess` seguido de `requireOrderBrand`. La ruta independiente `src/app/comu/seller/[brandSlug]/[view]/page.tsx` se conserva. No se alteraron permisos OWNER/ADMIN/ORDER_MANAGER, consultas, filtros, enlaces ni redirecciones. Regresión adicional verifica orden de ambas guardas, sus denegaciones y uso del seller resuelto.

`node scripts/test-comu-orders-page.mjs`: PASS ejecutando la página real con Auth simulado: 401 al login, 403 a notFound, 503 propagado, estado vacío, redirección de tienda única con filtros permitidos y selector de varias tiendas. `test-comu-orders-o1-presentation-local.mjs`: PASS. ESLint de página/script: PASS. Build administrativo repetido sobre copia de 687 archivos sin `.env` mediante `node node_modules/next/dist/bin/next build .next/magenta-preview-preparation/source-1791995544066/cometa-os/cometa-brand-ai --webpack`; resultado final registrado abajo.

El segundo build pasó compilación y TypeScript (incluida validación App Router); falló luego en `/api/analyze-brand` porque inicializa clientes Supabase/OpenAI al importar y la copia no contenía variables. No se modificó esa API. Reintento con entorno de proceso limitado a variables de Windows y valores ficticios: URL Supabase/OpenAI `http://127.0.0.1:9`, claves `synthetic-build-only`, telemetría deshabilitada. Estos valores no son credenciales, no se escribieron en `.env` y **el artefacto resultante no debe desplegarse**. El build de Preview real debe recompilar con las variables exclusivas de pruebas. TypeScript raíz `--noEmit --incremental false --pretty false`: PASS. Advertencia de múltiples lockfiles en la copia anidada: el tracing root inferido es el repositorio padre; no certifica empaquetado remoto ni justifica cambiar configuración de producción.

**Resultado final del build administrativo con ese entorno sintético: PASS, salida 0.** Compilación, TypeScript, recopilación de rutas, generación de 111 páginas estáticas, optimización y trazas completadas; `/comu/seller/orders` figura como ruta dinámica. No se omitió TypeScript ni se activó `ignoreBuildErrors`. Pruebas de ambas páginas y lint dirigido PASS; `git diff --check` PASS. Se resuelve el bloqueo de código del build; permanecen los de aprovisionamiento y certificación funcional descritos a continuación.

### Bloqueos confirmados por metadatos, sin secretos

Se repitieron `supabase projects list` y `vercel env ls preview` en ambos proyectos. Siguen disponibles únicamente PTM App MVP (inactivo), Nahuitech-Quotes y Cometa BRAND IA (activos); ninguno confirmado exclusivo de pruebas. No se infiere aislamiento por nombre.

| Destino | Configuración necesaria | Estado observado |
| --- | --- | --- |
| Admin Preview | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Existen, pero comparten ámbito Production/Preview; no certificadas para pruebas |
| Admin Preview | `APP_ORIGIN` | Existe compartida; necesita URL Preview propia, no producción |
| Admin Preview | `OWN_STOREFRONT_URLS` | Ausente; mapa JSON del slug sintético a la URL Preview storefront |
| Admin y storefront Preview | `STOREFRONT_STRIPE_TEST_SECRET_KEY`, `STOREFRONT_STRIPE_TEST_WEBHOOK_SECRET` | Ausentes en ambos listados; admin las requiere para habilitar Stripe, storefront para crear sesiones/verificar eventos |
| Storefront Preview | `STOREFRONT_SUPABASE_URL`, `STOREFRONT_SUPABASE_ANON_KEY`, `STOREFRONT_SUPABASE_SERVICE_ROLE_KEY`, `STOREFRONT_BRAND_SLUG`, `STOREFRONT_ORIGIN` | Existen todas compartidas Production/Preview; reemplazar solo para Preview/rama con destino confirmado |
| Storefront Preview | `STOREFRONT_EXPIRY_SECRET` y scheduler POST `/api/checkout/expire` | Variable ausente; ejecutor remoto no certificado |
| Entorno local | Variables específicas `STOREFRONT_*` | Ausentes de `.env.local`; solo nombres inspeccionados. Las variables Stripe genéricas y COMU no se consideran credenciales autorizadas de esta tienda |

El checkout usa Stripe Checkout alojado: no necesita publicar una `pk_test` en el navegador ni `STRIPE_PRICE_*`, porque construye el importe de la orden en servidor. No se leyeron valores de las claves genéricas para intentar reutilizarlas.

### Pasos indispensables para desbloquear el recorrido

1. El titular debe identificar un Supabase existente vacío y exclusivo de pruebas o crear uno (organización, región y posible coste requieren su elección). Proporcionar la **referencia**, no contraseñas por chat. No reutilizar los tres candidatos sin confirmación explícita. Aprovisionar credenciales del nuevo proyecto de forma privada y autorización de conexión/migración al destino exacto.
2. Ensayar el baseline desde cero antes de publicarlo. El repositorio empieza con `20260828233603_remote_schema.sql`; los runners aprobados restauran esquema de PostgreSQL local y prueban migraciones posteriores, **no certifican aún instalar toda la cadena desde cero**. Revisar migraciones de datos y no copiar filas operativas ni ejecutar `db push` contra el proyecto vinculado actual. Además del baseline POS/Auth/Storage/permisos, hacen falta M0, A1, M1–M6, `20261014120000_pos_imports_v1.sql`, `20261014140000_pos_product_delivery_save.sql` y `20261014160000_store_operations_m7.sql`, con dependencias y ledger comprobados en el destino nuevo.
3. Crear identidad sintética Auth, perfil activo, acceso owner/admin, marca Retail, suscripción/capacidades POS, ubicación/moneda y caja de prueba. Habilitar tienda A1, canales M1 y contenido publicado M2/M3, bucket `pos-products` con políticas; configurar destinatario POS, envío/recolección y pagos. Auth Site URL/redirects deben apuntar solo al admin Preview. No enviar invitaciones ni mensajes reales.
4. El titular debe facilitar acceso a una cuenta/sandbox Stripe test y configurar de forma privada `sk_test_…` en ambos proyectos Preview. La cuenta consultada debe coincidir con la guardada por configuración de tienda. Registrar destino HTTPS **snapshot** en `<URL-Preview-storefront>/api/stripe/webhook`, en la misma cuenta/modo test, para `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`. Guardar el `whsec_…` específico de ese endpoint; no el de otro endpoint o de Stripe CLI. Referencia: [Stripe webhooks](https://docs.stripe.com/webhooks).
5. Si Vercel Authentication protege la Preview, el webhook necesita acceso mediante el mecanismo oficial Protection Bypass for Automation configurado por el titular, sin revelar su secreto ni desactivar protección global. Esto habilita entrega servidor-a-servidor, no elude el bloqueo del navegador. [Documentación oficial](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation). Comprobar respuesta del endpoint y recepción en Stripe; login HTML no cuenta como éxito del webhook.
6. Configurar solo ámbito Preview/rama, verificar referencias/orígenes sin imprimir claves y revisar destino Vercel **antes** de cualquier publicación. No usar el proyecto administrativo sin despliegues: el primer despliegue fue autopromovido en el intento anterior. Mantener Git deployments deshabilitados. Si no se puede asegurar destino Preview, no ejecutar deploy. No crear/modificar aliases de producción. Tras disponer de URL Preview estable, ajustar origen/webhook/Auth y volver a publicar solo Preview.
7. Completar una sesión Checkout test desde la compra web (tarjeta de prueba oficial, nunca tarjeta real), registrar IDs de sesión/evento/pedido sin datos privados, comprobar `livemode=false`, entrega webhook 2xx, pago PAID, bandeja POS, aviso persistente e inventario. Referencia de pruebas: [Stripe testing](https://docs.stripe.com/testing). El navegador sigue bloqueado: la interacción de Checkout y QA visual requiere al usuario mientras continúe ese bloqueo; no se sustituye por un evento fabricado.

### Estado del recorrido solicitado

| Paso | Evidencia disponible | Falta para certificar la cadena completa |
| --- | --- | --- |
| Importación → producto/variante | Persistencia, duplicados, reversión y alta/reintento PostgreSQL PASS en checkpoint aprobado | Importar fixture desde sesión autenticada del backend nuevo y conservar los IDs |
| Producto → venta POS | Motor canónico y carreras de stock M6 probados localmente | Venta POS autenticada del mismo artículo importado; registrar venta/caja/movimiento |
| Compra web → pago | Orden/reserva y snapshots M7 PASS; handler webhook real con firma sintética PASS | Checkout Session real de Stripe test y pago completado por proveedor |
| Pago → pedido POS → aviso → inventario | Transiciones, avisos persistidos, deduplicación y movimientos SQL PASS | Comprobar esos mismos IDs a través de ambas apps Preview y notificación visible/sonora |

**No se ha realizado un pago test completo mediante Stripe ni el recorrido integral solicitado.** Los tests locales usan firmas sintéticas/transporte local; incluso `test-storefront-m62-stripe.cjs` intercepta Stripe con un proveedor simulado. Esto no acredita pago ni webhook entregado por Stripe. El bloqueo actual es aprovisionamiento externo y acceso de pruebas, no se declara resuelto con mocks.

Caso integral preparado para ejecutar cuando estén disponibles las dependencias: importar producto sintético con 10 unidades; registrar venta POS de 2 (cantidad 8, reserva 0); comprar 3 por web (cantidad 8, reserva 3, disponible 5); completar Stripe test (cantidad 5, reserva 0); verificar un solo descuento web de 3, el mismo folio en comprador/POS y evento PAID por destinatario. Reentregar el mismo evento Stripe: cantidad permanece 5, sin evento/movimiento duplicado. Cancelación de un segundo intento pendiente debe liberar únicamente su reserva. Registrar import batch, producto/variante, venta, pedido, sesión Stripe test, evento y movimientos para probar continuidad del **mismo** artículo; las suites separadas actuales no demuestran esa continuidad.

Archivos de esta continuación: `src/app/comu/seller/orders/page.tsx`, `src/app/brand/[brandSlug]/comu/orders/page.tsx`, `scripts/test-comu-orders-page.mjs` y este informe. Se conserva `../cometa-hotfix-recovery/` sin incluirlo.

## Continuación desde 299fa29: tienda propia, pedidos y Preview visual

**Estado vigente:** implementación local ampliada y pruebas PostgreSQL aprobadas; integración remota y revisión visual pendientes. Este apartado sustituye los pendientes históricos que ya están resueltos abajo. Rama `delivery/magenta-20261014`; sin merge ni modificaciones de bases operativas.

### Resultado implementado

- Configuración propia persistida por marca en `store_settings`, con revisión optimista y autorización owner/admin: nombre/contacto/dirección/estado, sucursal, cobertura postal/país, tarifa, umbral gratis, plazo, recolección, métodos de pago, políticas y destinatarios POS. No depende de cajas ni modifica COMU. Dominio muestra URL configurada y estado explícitamente no verificado; DNS se gestiona internamente, no se simula una conexión. El canal disponible es campanita POS; no se prometen email/WhatsApp automáticos.
- Mayoreo propio por producto o combinado con semántica UNIT_PRICE/AMOUNT_OFF/PERCENT_OFF existente; cálculo SQL autoritativo, prioridad por producto y umbral mayor aplicable. No se leen reglas privadas de COMU. Las pruebas nuevas cubren combinado porcentual; faltan casos específicos de paridad para cada modalidad.
- Checkout reutiliza reserva, expiración y confirmación M6; calcula precios, descuento, cobertura, envío y stock en servidor. Snapshots de artículo/variante/precio/contacto/entrega; recolección sin tarifa. La tarifa es política del comercio, no cotización de paquetería. WhatsApp crea primero pedido pendiente/reserva y ofrece mensaje con folio: no envía ni confirma pago. No hay conciliación manual de pagos offline ni reembolso implementado.
- Consulta de pedidos del comprador con cookie de propietario y filtro de marca, detalle y confirmación en pantalla. No hay correo transaccional ni recuperación entre dispositivos sin la cookie. API POS con bandeja/detalle/historial y estados separados; preparar/listo/enviado con guía/entregado requieren pago confirmado. Cancelación pendiente libera reserva; cancelación pagada antes de envío repone una vez y deja `refund_required`, sin afirmar reembolso. Se rechaza cancelar enviado/entregado.
- Campanita persistida por evento/destinatario, contador total y últimos 100 avisos, lectura persistente, consulta cada 15 s y recuperación al reconectar/volver a la pestaña. Sonido habilitado por clic, deduplicación por evento durante el montaje; una señal por lote nuevo. No se certifica deduplicación entre pestañas ni sonido con navegador cerrado.
- Atelier: ZIP ya localizado sin `(1)`; se contrastaron también `product-v6.css` y los estilos de portada/categorías. Adaptados producto, galería, variantes, modal, mayoreo, navegación a bolsa/pedidos y móvil conservando componentes y catálogo real M3–M6. No equivale a revisión visual aprobada. Escáner/importador y alta aprobados en 299fa29 conservados.

### Pruebas reales y límites

- `node scripts/test-storefront-m6-local.mjs --operations`: PASS en dos bases aisladas `cometa_m6_1791991823317` y `cometa_m6_1791992202506`, eliminadas al terminar sin FORCE. Copia de esquema local, fixtures sintéticos, migración `20261014160000_store_operations_m7.sql` solo en esas bases. Sin reset ni cambios a contenedores/volúmenes existentes.
- Suite M6 original completa seguida de M7: configuración/CAS/autorización, destinatarios/productos de otra marca rechazados, redacción pública, mayoreo, tarifa/umbral/recolección/cobertura, creación/replay concurrentes, payload cambiado, propietario ajeno, precio inmutable, transiciones por pago y entrega, guía, cancelación pagada concurrente con una sola reposición, última unidad, expiración, avisos persistentes/lectura/autorización y RLS.
- `test-store-webhook-local.mjs`, invocado desde la suite: handler real y firmas del SDK Stripe; transporte hacia PostgreSQL local. Rechaza firma incorrecta, live, importe incorrecto y marca ajena; webhook duplicado concurrente produce un pago/evento/descuento de stock. **No** es prueba contra Stripe remoto ni certifica Checkout Session del proveedor.
- `node scripts/test-store-operations-api.mjs`: PASS parser y handler real con Auth/transporte simulados, 401/403, marca ajena, límites de documento, acciones inválidas, Stripe ausente, conflictos y errores seguros. Contratos M3–M6 y escáner sintético PASS; no se sustituyeron las pruebas reales de importador/alta registradas en la sección anterior.
- TypeScript sin emisión PASS. Build webpack storefront en su ubicación real PASS. La advertencia standalone anterior venía de la copia anidada y dependencias fuera del tracing root; no aparece al compilar `apps/magenta-storefront` en el monorepo. La Preview estática no usa standalone ni funciones servidor.
- ESLint dirigido: se corrigió el enlace interno de la nueva página de pedidos con `Link`; comprobación final de esa página/campanita PASS. Resto de archivos nuevos comprobados sin errores; permanecen cuatro advertencias en componentes compartidos por `<img>` y navegación interna existente. `git diff --check` sin errores de whitespace.
- Build general en copia sin `.env`: compilación JS correcta; falla el chequeo de página en `src/app/comu/seller/orders/page.tsx` por prop de página `brandSlug?: string` no admitida por App Router. Firma verificada en 299fa29: deuda preexistente, no corregida incidentalmente. Esto bloquea el build administrativo completo.
- Navegador bloqueado: no se buscó una vía alternativa ni se generaron capturas como supuesta aprobación. Pendientes QA autenticada, móvil, galería/variantes/bolsa, accesibilidad, sonido real y recorridos integrales.

### Infraestructura y siguiente paso concreto

Metadatos Supabase accesibles: `fvaruzjravbwzatnjfoe` (PTM App MVP, inactivo), `ofkvisonfllafkzihdvq` (Nahuitech-Quotes, activo), `zhtagqrzyovsrmsicaot` (Cometa BRAND IA, activo/vinculado). **Ninguno confirmado exclusivo de pruebas.** Vercel `cometa-os` comparte variables Supabase entre Production y Preview; nombres de proyectos o variables no acreditan aislamiento. No se consultaron datos remotos ni se mostraron secretos.

Para habilitar Preview funcional: crear o designar un proyecto Supabase vacío exclusivo de pruebas, confirmar su referencia y ausencia de datos operativos, cargar baseline y dependencias A1/M0–M6 más migraciones de importador/alta/M7 con fixtures sintéticos; configurar Auth/Storage y variables solo Preview en proyectos aislados. No conectar Vercel a Supabase local. Provisionar `STOREFRONT_STRIPE_TEST_SECRET_KEY` (`sk_test_`) y `STOREFRONT_STRIPE_TEST_WEBHOOK_SECRET` del endpoint Preview y validar cuenta, evento firmado y Checkout Session test; estas variables no estaban disponibles. Las claves genéricas/COMU existentes no se reutilizaron. Configurar y verificar también el ejecutor de expiraciones M6; hay liberación en solicitudes de checkout, pero no se certifica un scheduler remoto. No se realizaron pagos ni mensajes reales.

### Preview disponible e incidente de clasificación

URL: https://magenta-controlled-preview-hme052ccm-cometa-os-s-projects.vercel.app

Vercel inspect: `dpl_ABfALPXGoyV6EC82Kg674BdhVL8G`, **target preview / Ready**. Artefacto HTML estático generado con los componentes actuales y recursos demo del ZIP; banners explícitos, datos sintéticos, CSP sin scripts/conexiones/formularios. Bloqueados: edición POS, interacción de variantes/galería, bolsa persistente, checkout, pagos, WhatsApp, pedidos reales y campanita. No sustituye al frontend funcional ni certifica su integración. Puede requerir acceso del equipo por la protección de Preview; no se desactivó esa protección. Verificación estructural local de rutas/recursos/ausencia de secretos y estado remoto, no revisión visual.

Incidente: el primer intento con `--target preview` en el proyecto administrativo sin despliegues fue clasificado por Vercel como **production**. Se detectó y eliminó inmediatamente el despliegue estático propio `dpl_3ShmVvSJzWNYUxQ3fQF6tnceskFf` (CLI confirmó eliminación). No contenía backend, pagos ni datos reales. El reintento usó el proyecto storefront ya existente y se verificó explícitamente como Preview. No se promovió la aplicación operativa ni se alteraron sus bases. No se debe afirmar que no ocurrió ningún despliegue clasificado producción.

Se deshabilitó despliegue automático Git para esta rama en ambos `vercel.json`, conservando las otras reglas; evita que el push active una app funcional con variables compartidas. Las publicaciones posteriores deben seguir el gate anterior.

### Archivos exactos de esta continuación

Modificados: `apps/magenta-storefront/app/api/checkout/route.ts`, `apps/magenta-storefront/app/layout.tsx`, `apps/magenta-storefront/lib/checkout-server.ts`, `packages/own-storefront/checkout.css`, `packages/own-storefront/checkout.tsx`, `packages/own-storefront/home.css`, `packages/own-storefront/home.tsx`, `packages/own-storefront/product.css`, `scripts/test-storefront-m6-local.mjs`, `src/app/brand/[brandSlug]/components/pos-sidebar.tsx`, `src/app/brand/[brandSlug]/components/pos-topbar.tsx`, `vercel.json`, este informe.

Añadidos: `apps/magenta-storefront/app/api/store-settings/route.ts`, `apps/magenta-storefront/app/pedidos/page.tsx`, `apps/magenta-storefront/lib/store-information.tsx`, `apps/magenta-storefront/vercel.json`, `packages/own-storefront/operations-contract.ts`, `scripts/prepare-magenta-visual-preview.mjs`, `scripts/test-store-operations-api.mjs`, `scripts/test-store-operations-local.mjs`, `scripts/test-store-webhook-local.mjs`, `src/app/api/pos/online-store/operations/route.ts`, `src/app/brand/[brandSlug]/components/pos-store-bell.tsx`, `src/app/brand/[brandSlug]/pos/online-store/operations.tsx`, `src/app/brand/[brandSlug]/pos/online-store/orders/page.tsx`, `src/app/brand/[brandSlug]/pos/online-store/page.tsx`, `supabase/migrations/20261014160000_store_operations_m7.sql`.

No se incorporan `.env`, claves, artefactos `.next`, ZIP ni `../cometa-hotfix-recovery/`.

## Reanudación tras reinicio — 14 octubre 2026

Esta sección sustituye el estado de bloqueo Docker del checkpoint inferior. La instrucción vigente autoriza cambios, commits, push y Preview, pero exige confirmar antes del despliegue un backend accesible y exclusivo de pruebas, pagos test y migraciones. No autoriza merge ni producción. **La entrega completa sigue pendiente.**

### Docker y aislamiento verificados

- Engine 29.7.2 / Docker Desktop 4.88.1 responde por el named pipe local. El CLI no está en PATH; el sandbox denegó el pipe con EPERM y la consulta posterior con permiso elevado tuvo éxito.
- Inventario: 30 contenedores: 10 running, 19 exited y 1 restarting. Los 18 `food_cert_auth_*` / `food_cert_rest_*` están detenidos. En el conjunto `supabase_*_zhtagqrzyovsrmsicaot`, db, studio, pg_meta, storage, rest, realtime, inbucket, auth, kong y analytics están activos; edge_runtime detenido y vector reiniciándose. No se modificó su estado.
- Tres volúmenes existentes conservados: `supabase_db_zhtagqrzyovsrmsicaot`, `supabase_edge_runtime_zhtagqrzyovsrmsicaot`, `supabase_storage_zhtagqrzyovsrmsicaot`. Sin reset, prune, eliminación de contenedores ni reutilización de datos operativos.
- Aislamiento mediante bases nuevas dentro del PostgreSQL local existente; **no es otro cluster ni un backend para Vercel**. Solo se leyó el esquema public/auth/storage de `postgres`, sin copiar sus filas. Las migraciones y fixtures sintéticos se aplicaron exclusivamente a las bases temporales.
- Bases de esta ejecución, todas eliminadas por su runner con `dropdb` sin FORCE: `cometa_eleventa_1791990363126`, `cometa_eleventa_1791990449525`, `cometa_eleventa_1791990522769`, `cometa_m6_1791990565316`.

### Resultados nuevos y reproducibles

| Comprobación | Resultado real |
| --- | --- |
| `node scripts/test-pos-eleventa-local.mjs` | PASS PostgreSQL: persistencia, códigos con ceros, duplicados, mismo archivo con clave nueva rechazado, replay, dos solicitudes concurrentes con misma clave, payload alterado rechazado, aislamiento de marca, campos omitidos conservados, inventario absoluto, reservas, preview obsoleto, rollback, reversión y bloqueo tras actividad posterior, denegación de roles |
| Alta `20261014140000_pos_product_delivery_save.sql`, dentro del mismo runner ampliado | PASS: alta/reintentos concurrentes devuelven el mismo producto y una sola existencia inicial; cambio de payload/canales rechazado; actor/marca ajenos rechazados; alta inválida no deja recibo; intención de canales persistida |
| Dependencias A1/M1 reales en la última ejecución | PASS: tienda deshabilitada retorna pendiente con motivo correspondiente; tienda habilitada guarda ambos canales y repite el resultado sin duplicación. La prueba anterior sin dependencias solo comprobaba recuperación ante fallo; no se utiliza como prueba de habilitación |
| `node scripts/test-storefront-m6-local.mjs` | PASS SQL M4/M5/M6, A1/M1/M2 y M0 instalados: configuración/envío fail-closed, snapshots de precio, replay con stock cero, pagos duplicados, cancelación/expiración, pago tardío, carreras Retail/COMU/tienda por última unidad, permisos/RLS y suspensión. Cotizaciones/configuración son fixtures; no hubo proveedor Stripe real |
| `node scripts/test-pos-eleventa-api.mjs` | PASS handler con Auth/RPC simulados; distinto de la prueba PostgreSQL |
| `node scripts/test-pos-camera-scanner.mjs` | PASS imágenes sintéticas EAN-13/UPC-A. Cámara, Code 128 físico y permisos de móvil siguen pendientes |
| `node scripts/test-storefront-m{3,4,5,6}-contract.mjs` (cada archivo individualmente) | PASS; proveedores y transporte simulados según cada suite |
| `node scripts/test-comu-buyer-notifications-node.mjs`, `test-comu-orders-o1-presentation-local.mjs`, `test-comu-notifications-n1-node.mjs` | PASS lógica existente de pedidos/notificaciones COMU; cero correos reales. No certifica ni implementa la nueva bandeja/campanita POS para pedidos de tienda propia |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` | PASS, salida 0 |
| `node node_modules/eslint/bin/eslint.js scripts/test-pos-eleventa-local.mjs` | PASS, salida 0 |
| Build webpack de copia storefront sin `.env` | PASS compilación, TypeScript y rutas. Advertencia: 27 archivos de dependencias fuera de outputFileTracingRoot; empaquetado standalone no certificado |
| `git diff --check` | PASS; advertencias LF/CRLF de Git, sin errores de whitespace |

Build reproducido con `node scripts/prepare-magenta-preview.mjs` y `node node_modules/next/dist/bin/next build .next/magenta-preview-preparation/source-1791990675889/storefront/apps/magenta-storefront --webpack`. La copia ignorada contiene 676 archivos, sin secretos ni archivos de entorno; no se desplegó. No se instalaron dependencias.

### Atelier: referencia encontrada y adaptación inicial

Archivo disponible: `referencias-magenta/MAGENTA-Atelier-Shopify-v0.6.zip`, sin el sufijo `(1)`. SHA256: `8c62a787114fd2f86643c72adba56be7472c9514ee50ce9b50ddb64edecc5db7`. Se inspeccionaron su inventario, `assets/atelier-v4.css`, `sections/hero.liquid`, tokens y settings.

Se adaptaron a `packages/own-storefront/home.css` tipografía/espaciado de tarjetas, botones, encabezado, hero, proporción de look, beneficios, FAQ y footer, con reglas responsivas y movimiento reducido. Se mantienen variables de apariencia y overrides existentes del editor; no se copiaron textos comerciales, imágenes demo ni lógica Shopify. **Es una adaptación inicial, no equivalencia visual completa certificada.** No se abrió una vía alternativa de automatización del navegador bloqueado. Revisión desktop/móvil a cargo del usuario: home con/sin imagen, tarjetas vacías/con datos, editor y sus overrides, catálogo/producto/bolsa, footer y foco de teclado.

### Bloques abiertos y publicación

- Se solicitó el prompt original con los criterios de configuración persistente, tarifas/cobertura, WhatsApp, pedidos y campanita: el checkpoint solo conserva una enumeración, insuficiente para fijar las reglas comerciales o ampliar schema. No se inventaron tarifas, canales de notificación ni integración entre pedidos COMU y tienda propia.
- El checkout existente tiene reserva/lifecycle real probado localmente; aún no hay cotizador real ni Stripe test del proveedor certificado. Sigue pendiente el recorrido autenticado y visual.
- Falta nombre/referencia de backend Supabase exclusivo de pruebas accesible desde Vercel, sin datos operativos. No se leyeron claves ni se aplicaron migraciones remotas. Las variables Preview históricas compartidas con producción no sirven como evidencia de aislamiento.
- La autorización de push/Preview sigue vigente, pero no se hace push en esta reanudación: la configuración versionada solo deshabilita despliegues Git de otra rama de backup; no se ha confirmado que el push de delivery no dispare un Preview con el backend anterior. Resolver el gate de despliegue antes de publicar la rama.
- Sin nueva URL Preview, sin merge ni producción. Permanecen pendientes los bloques funcionales anteriores y el producto de captura única completo descrito en el checkpoint.

Archivos modificados en esta reanudación: `scripts/test-pos-eleventa-local.mjs`, `packages/own-storefront/home.css`, `docs/magenta-delivery-20261014.md`. SQL de aplicación, M1–M6 y escáner conservados. `../cometa-hotfix-recovery/` no se toca ni se incluye.

## Checkpoint antes de reiniciar Windows

Rama: `delivery/magenta-20261014`. Checkpoint local de trabajo en curso, **no entrega certificada**. Por instrucción del usuario, no hacer push ni desplegar. El hash se obtiene con `git log -1 --format=%H` después del commit; este informe queda dentro de ese commit.

Esta sección actualiza el estado histórico del importador descrito más abajo:

- Se conserva íntegro el importador ELEVENTA y las correcciones M3/footer. Las migraciones no se ejecutaron en bases remotas.
- Escáner añadido a Nueva venta: cámara trasera preferida, selección alternativa, lector nativo cuando soporta formatos requeridos y fallback ZXing, pausa después de cada lectura, rearmado explícito y liberación de cámara al cerrar. Se conserva entrada manual/lector físico. API busca códigos exactos de variante y, como alternativa, código de producto para elegir variante; escapa comodines de SKU y conserva el filtro de marca/canal.
- Nuevo producto permite seleccionar POS/tienda propia antes del primer guardado, consultando habilitación y permisos en servidor. Se preparó `20261014140000_pos_product_delivery_save.sql`: reutiliza creación canónica, conserva intención de canales, recibo de reintento por marca/actor/payload y resultado pendiente si falla la activación del canal. **Código en curso, SQL sin ejecutar ni certificar.** La creación desde este formulario requiere esa migración; sin ella responde 503. No confundir selección guardada con publicación efectiva.
- Se retiró el borrado físico de la imagen al quitar su asociación de una variante, para preservar fotos compartidas entre tallas. Queda por revisar el borrado de portada y demás referencias compartidas.
- Se corrigieron textos dañados y el mensaje “Product Engine” del editor.
- Se añadió `@zxing/browser` 0.2.1 (MIT), con `@zxing/library` 0.23.0 (Apache-2.0, requiere Node >=24). Se conservan manifest y lockfile para reproducibilidad; no se incluyen dependencias instaladas. La instalación reportó cinco vulnerabilidades altas del árbol total, pendientes de clasificación; no se ejecutó autofix.

### Verificaciones y entorno al pausar

- TypeScript sin emisión: PASS en el último ciclo de implementación. Los últimos cambios posteriores fueron mensajes de error y textos; no se repitió compilación para este checkpoint documental.
- ESLint dirigido: PASS en componente de cámara, opciones de canales, componente de canales y prueba del escáner. No equivale a lint global; el error histórico del script M3 indicado abajo permanece.
- `node scripts/test-pos-camera-scanner.mjs`: PASS con imágenes sintéticas EAN-13/UPC-A. ZXing puede representar EAN-13 que inicia en cero como UPC-A: verificar coincidencia con etiquetas reales y lector nativo. Pendientes Code 128, cámara, permisos, foco y teléfono/tablet.
- Pruebas previas del importador y contratos M3–M6: resultados históricos abajo; no sustituyen PostgreSQL ni comercio real.
- Docker: `docker desktop restart` falló por timeout al detener procesos. Se terminó únicamente la distribución `docker-desktop` y se intentó abrir Docker Desktop de nuevo, sin reset/prune ni borrado de volúmenes. El runner aislado volvió a terminar con `LOCAL PERSISTENCE NOT CERTIFIED: Docker timeout`, antes de crear base.
- Configuración efectiva de desarrollo observada: Supabase apunta a `127.0.0.1`. Las comprobaciones HTTP remotas históricas de abajo **no certifican esta configuración local actual**. Login autenticado pendiente.
- Vercel: proyecto `cometa-os`, raíz `cometa-brand-ai`, rama de producción `main`. Variables Supabase de Preview compartidas con Production según metadatos; no se confirmó backend aislado. Existen proyectos de preview controlada, pero su nombre no certifica aislamiento. No usar el script antiguo `deploy-appearance-release.mjs`, que contiene `--prod`.
- No se identificó un proyecto Supabase exclusivo de pruebas entre los accesibles. Se solicitó nombre/referencia y confirmación de ausencia de datos operativos; no hubo respuesta al pausar. No se solicitaron ni registraron claves.
- No se obtuvo nueva captura: el control de Windows se detuvo al no poder verificar con seguridad la URL del navegador. El intento de iniciar dev en `127.0.0.1:3000` falló con `EACCES`; reintentar con permisos adecuados al retomar. No cambiar credenciales.
- Build, pagos Stripe de test, venta POS real y persistencia siguen pendientes. No hay URL Preview nueva.

### Orden para retomar

1. Revisar rama/status y leer este informe; conservar cambios externos. Comprobar Docker tras reinicio. Ejecutar `node scripts/test-pos-eleventa-local.mjs` únicamente en su base temporal aislada; no resetear ni sembrar datos existentes.
2. Revisar y probar ambas migraciones con PostgreSQL real. El runner actual solo aplica la migración ELEVENTA: ampliar las pruebas para creación/reintento/canales antes de publicar la segunda. Probar aislamiento, concurrencia, rollback, repetición y bloqueo de reversión tras operaciones posteriores.
3. Completar producto de una sola captura: galería/portada ordenable, fotos por color, COMU con sus requisitos, edición y reintentos; canales en importación. El formulario y RPC actuales cubren solo parte del alcance, no COMU ni galería unificada. Revisar recuperación de reintentos cuando el formulario cambia después de una respuesta incierta y estado visible de canales pendientes al reabrir.
4. Obtener ubicación de `MAGENTA-Atelier-Shopify-v0.6(1).zip` (solicitada, pendiente). Adaptar Atelier preservando M1–M6; no sustituirlo por tema genérico.
5. Completar configuración online persistente y aplicada, tarifas/cobertura, checkout/WhatsApp/pagos/reservas, cuenta/pedidos, bandeja POS y avisos persistidos. Estos bloques **no se implementaron en esta iteración**; reutilizar motores existentes.
6. Verificar escáner real y flujos POS/web, TypeScript, lint pertinente, contratos M3–M6, build y capturas reales. ELEVENTA real queda pendiente hasta recibir archivos del cliente; usar solo sintéticos en pruebas.
7. Solo después de nueva instrucción para publicación y verificaciones: confirmar backend exclusivo de pruebas, respaldo y Stripe test; aplicar migraciones allí y preparar Preview. La instrucción actual es **checkpoint local, sin push ni despliegue**.

### Archivos adicionales de este checkpoint

Además de los archivos ELEVENTA/M3 enumerados al final:

- `package.json`, `package-lock.json` (declaración y resolución de ZXing, no dependencias instaladas).
- `src/components/pos-camera-scanner.tsx`.
- `scripts/test-pos-camera-scanner.mjs`.
- `src/app/api/pos/product-scan/route.ts`.
- `src/app/brand/[brandSlug]/pos/register/page.tsx`.
- `src/app/api/pos/products/route.ts`.
- `src/app/api/pos/product-channel-options/route.ts`.
- `src/app/brand/[brandSlug]/pos/products/page.tsx`.
- `src/app/brand/[brandSlug]/pos/products/product-channels.tsx`.
- `supabase/migrations/20261014140000_pos_product_delivery_save.sql`.

Fuera del checkpoint y sin descartar: `../cometa-hotfix-recovery/`; archivos locales ignorados como `.env*`, `node_modules/`, `.next/`, cachés y configuración local de Vercel. No se incorporan secretos ni diagnósticos privados. Los apartados siguientes documentan el primer bloque y sus resultados históricos.

Estado: código del importador preparado localmente; **persistencia y migración todavía no certificadas**. No publicar la migración hasta ejecutar las pruebas PostgreSQL y revisar sus resultados. No hubo despliegues, cambios de datos/esquema remotos, resets, ni uso de datos reales del cliente. Mac, Android e iOS fuera de alcance.

## Implementado

- Configuración → ¿Vienes de otro POS? → ELEVENTA → Productos / Inventario / Clientes.
- SheetJS **0.20.3**, ya instalado: `.xls`, `.xlsx`, CSV UTF-8 y Windows-1252. No se instalaron dependencias ni se cambiaron manifests/lockfiles.
- Selección de hoja y fila de encabezados; alias de encabezados y correspondencia manual por índice, sin plantilla obligatoria. Columnas no seleccionadas no se importan.
- Vista previa con valores, conteos, errores por fila y coincidencias de marca. Decisión explícita crear/actualizar/omitir. Límite: 500 filas, 100 columnas y archivo de 5 MB.
- Códigos textuales y formato numérico de Excel preservados. No se reconstruyen ceros ya perdidos en el origen. Fórmulas mapeadas rechazadas; deben exportarse como valores.
- Precios/costos/existencias no negativos, precisión controlada, contactos validados, duplicados dentro del archivo y coincidencias por código/SKU/barcode o código externo/teléfono/correo para clientes. Teléfonos se comparan sin puntuación, sin inferir país.
- Productos nuevos simples por código: base SKU canónica, unidad pieza explícita en la interfaz; requiere nombre, precio, costo e impuesto explícitos. No se infieren fotos, tallas, colores o mayoreo. Productos con variantes se excluyen de actualización masiva de Productos; Inventario puede localizar una variante inequívoca por SKU/barcode.
- Vacíos/ausentes no sobrescriben valores existentes. Inventario usa `pos_adjust_inventory(..., p_set_absolute=true)`, valida sucursal y reserva disponible. No suma por defecto.
- API reconstruye las filas desde el archivo en cada confirmación. Reutiliza permisos de configuración + dominio, acceso comercial, operador/dispositivo y resolución de marca. RPC adicional restringida a service role, perfil activo, marca activa y owner/admin (o admin global canónico); valida marca e identidad persistida.
- Migración local añade registro, códigos externos de clientes y RPC transaccional. Registro guarda actor, archivo/hash, filas, antes/después, idempotencia y estado/reversión. Reintento con misma clave/payload recupera el resultado; archivo ya aplicado se rechaza con otra clave. Todo el lote se confirma o revierte en una transacción.
- Reversión conserva el historial y añade movimientos compensatorios para inventario. Comprueba actividad posterior mediante snapshots y `xmin` de productos, variantes, inventario, clientes y sus dependencias FK directas. Revalida la sucursal original.
- Footer de Magenta corregido: reutiliza `renderPhoto` en vez de llamar a `photo` fuera de su ámbito. Se conserva el diseño y el trabajo M1–M6.
- Prueba M3 corregida para cargar `section-registry`; incluye regresión del footer con logo.

## Riesgos y límites concretos

- La barrera de reversión es **conservadora a nivel de marca**: puede rechazar una reversión aunque la actividad posterior no afecte directamente a una fila del lote. No intenta fusionar cambios.
- La RPC bloquea temporalmente las tablas involucradas y dependencias FK para evitar carreras con escritores POS existentes. Los locks son de tabla y pueden afectar a otras marcas durante el lote; timeout de espera de 5 s. Falta medir duración/contención en PostgreSQL real antes de publicación. El límite de 500 filas no certifica rendimiento.
- El fingerprint cubre FK directas, no certifica integraciones futuras que guarden referencias sin FK. Revaluar el alcance al añadir nuevas superficies de escritura.
- No hay compatibilidad final ELEVENTA hasta revisar archivos reales. Alias y pruebas actuales usan datos sintéticos. Campos como departamento, mayoreo, crédito y fotos no se deducen ni importan de descripciones.
- La reversión y la repetición del mismo archivo están implementadas y tienen casos preparados, pero **no se ejecutaron contra base de datos** porque Docker no respondió.
- Al faltar la migración, la API informa que el esquema está pendiente y no intenta escrituras alternativas.

## Verificación realizada

- `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: PASS tras corregir el footer; comprobación final repetida después de los cambios.
- `node scripts/test-pos-eleventa-import.mjs`: PASS. Archivos XLS/XLSX/CSV sintéticos, ceros textuales/formateados, alias/manual, campos desconocidos, vacíos, precisión, duplicados e inválidos. Segunda lectura determinista; **no es prueba de persistencia**.
- `node scripts/test-pos-eleventa-api.mjs`: PASS. Ejecuta el módulo real del handler con Auth/RPC simulados: guardas, rechazos, parseo, selección obligatoria, campos ausentes, CSV de Windows, migración ausente y conflictos. **No certifica RLS ni persistencia.**
- `test-storefront-m3-contract.mjs`, `m4`, `m5`, `m6`: PASS. Pruebas de contratos existentes; M5 usa transporte/storage simulados y M6 firmas Stripe sintéticas. No certifican checkout comercial.
- ESLint dirigido a los nuevos archivos TS/TSX y scripts ELEVENTA: PASS. El script M3 conserva un error preexistente `@next/next/no-assign-module-variable` en su variable `module`; no se hizo limpieza general.
- `git diff --check`: PASS; advertencias de conversión LF/CRLF, sin errores de whitespace.
- HTTP local real: `/api/pos/imports?...&kind=products` devuelve **401** sin sesión; la página de importación devuelve **307** al login. Esto no sustituye una prueba autenticada ni de datos.
- Entorno: Node 24.20.0, Next 16.4.0, TypeScript 5.9.3. Usar `npm.cmd` en Windows porque la política de PowerShell bloquea `npm.ps1`.
- Supabase configurado localmente respondió 200 en Auth health y REST, sin revelar secretos ni mutar datos. Login manual/acceso de marca pendiente: `http://localhost:3000/login`.

## Persistencia pendiente y reproducción

Comando preparado: `node scripts/test-pos-eleventa-local.mjs`.

Se intentó ejecutar: **LOCAL PERSISTENCE NOT CERTIFIED: Docker timeout**. Se detuvo antes de crear la base. No se sustituyó esta prueba por HTTP.

El runner solo usa el named pipe local de Docker; exige un contenedor Supabase PostgreSQL publicado en 54322, crea `cometa_eleventa_<timestamp>`, copia **solo esquema** de la base local existente y aplica la migración únicamente a la base nueva. Prepara fixtures `SYNTHETIC` en ella y elimina únicamente esa base al terminar (sin FORCE). No carga `.env` ni credenciales remotas. Requiere el baseline local anterior a esta migración y las extensiones del entorno Supabase.

Casos preparados: persistencia, ceros, dos reintentos concurrentes con misma clave, payload alterado, mismo archivo con nueva clave, ausencia de duplicados, rollback atómico de lote inválido, aislamiento entre dos marcas, precios/costos ausentes preservados, inventario absoluto, reservas, preview obsoleto, reversión y rechazo tras actividad posterior, roles anon/authenticated denegados. **Todos estos casos PostgreSQL siguen pendientes de ejecución.**

También pendientes: prueba end-to-end autenticada y revisión visual página por página. La herramienta de navegador no tiene sesiones y no pudo crear un navegador (`Browser is not available: iab`); no se entregan capturas antiguas como evidencia nueva. No se ejecutó build completo conectado a servicios; sí compilador TypeScript y pruebas locales arriba.

## Archivos de esta tarea

Modificados:

- `packages/own-storefront/home.tsx` (corrección previa conservada).
- `scripts/test-storefront-m3-contract.mjs`.
- `src/app/brand/[brandSlug]/pos/settings/page.tsx`.

Añadidos:

- `src/lib/pos/eleventa-import.ts`.
- `src/app/api/pos/imports/route.ts`.
- `src/app/brand/[brandSlug]/pos/settings/import/page.tsx`.
- `supabase/migrations/20261014120000_pos_imports_v1.sql` (pendiente de publicación y certificación local).
- `scripts/test-pos-eleventa-import.mjs`.
- `scripts/test-pos-eleventa-api.mjs`.
- `scripts/test-pos-eleventa-local.mjs`.
- `docs/evidence/eleventa/SINTETICO-productos.xls`.
- `docs/evidence/eleventa/SINTETICO-productos.xlsx`.
- `docs/evidence/eleventa/SINTETICO-productos.csv`.
- `docs/evidence/eleventa/SINTETICO-clientes.csv`.
- `docs/evidence/eleventa/SINTETICO-invalidos.csv`.
- `docs/evidence/eleventa/SINTETICO-inventario.csv`.
- `docs/magenta-delivery-20261014.md`.

La carpeta externa `../cometa-hotfix-recovery/` se conservó. Sin staging, commits ni push. Los cambios adicionales de interfaz/canales quedan a la espera de la revisión consolidada del usuario.
