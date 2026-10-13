# Editor visual de Apariencia — 12 octubre 2026

Ruta: https://app.cometaos.com/brand/magenta-fitwear/pos/online-store/appearance

Cuenta propietaria existente: `guiasmagenta@gmail.com`. También disponible para el administrador global canónico. La cortesía POS, las membresías y A1 conservan sus autoridades; el editor no concede servicios ni crea membresías.

## Implementación

Referencia revisada: `referencias-magenta/editor-visual-magenta-aprobado.png`. Administración azul marino/cian; la vista previa conserva los colores y tipografía de cada marca. Barra superior, navegación POS reducida a regreso, estructura izquierda, lienzo central y controles de la selección a la derecha. Tablet/teléfono alternan Secciones/Vista previa/Editar.

Inicio, Catálogo y Producto reutilizan sus componentes públicos. El lienzo es un iframe del mismo origen con un documento de ancho propio: escritorio a 1024 px escalado al espacio disponible y teléfono hasta 390 px. Producto utiliza datos publicados y variantes reales; su modo administrativo no cambia URL del administrador, bolsa, reservas ni pedidos. Las ventanas de producto consultan su propio documento para el foco de teclado.

Selección desde lienzo/estructura, campos Imagen/Texto/Botón, orden por arrastre o botones accesibles, visibilidad, activación de secciones disponibles y duplicación de elementos compatibles. El modelo sigue admitiendo exactamente una sección por tipo. No se duplican secciones completas ni IDs de productos destacados.

Se mantienen las opciones de Home, Catálogo y Producto. Los destinos ofrecen Inicio, Catálogo, productos publicados y enlace configurable. Los datos por prenda siguen en Productos → Ficha web. Encabezado y pie comparten la navegación existente, sin crear otro contrato.

## Persistencia y recuperación

Se reutilizan `brand_storefront_appearance` y `brand_storefront_save_m3`. **Sin migración nueva.** Los documentos antiguos siguen siendo válidos. Campos opcionales allowlist:

- `mediaLayout`: encuadre horizontal/vertical de escritorio y móvil, más archivo móvil alternativo por imagen original.
- `buttonLabels`: texto de botones por tipo de sección.

El renderer público consume los mismos campos; no se modifica el archivo original. La API comprueba pertenencia de rutas, existencia de medios y permisos antes de guardar. Biblioteca autorizada: namespace `<marca>/web`, hasta 100 carpetas recientes con hasta 100 archivos por carpeta; no pretende ser una biblioteca paginada ilimitada.

Guardado automático tras 900 ms sin cambios, solicitudes serializadas y revisión esperada. La respuesta actualiza revisión sin sustituir una edición posterior. Publicar primero termina el guardado y luego publica explícitamente el documento revisado. Subidas bloquean publicación. Deshacer/rehacer mantiene hasta 50 versiones de esta pestaña.

Un error no se trata como éxito. Recuperar consulta el servidor: reconoce una respuesta perdida si el contenido coincide, reintenta si la revisión permanece igual o presenta conflicto. El usuario elige conservar su edición sobre la nueva revisión o cargar la versión remota. La primera opción reemplaza explícitamente el documento; no es una fusión automática de campos. Se advierte al salir con cambios/subidas pendientes. El historial de deshacer y cambios que aún no llegaron al servidor son de la pestaña, no almacenamiento durable offline.

La API de Apariencia devuelve `private, no-store` en éxito y error. Un precheck evita invocar una revisión ya obsoleta; la RPC conserva el bloqueo/CAS transaccional. No se modificó su SQLSTATE histórico: una carrera que alcance directamente su conflicto SQL puede terminar en error de transporte, recuperable mediante lectura; no se declara una nueva certificación de concurrencia SQL.

`OWN_STOREFRONT_URLS` configura en servidor la relación marca → URL HTTPS para “Ver tienda”. MAGENTA apunta al storefront existente. Sin relación configurada se omite el enlace, sin inferir otro dominio.

## Verificación

- TypeScript sin emisión: PASS. Builds independientes de administrador y storefront en Vercel: PASS.
- Lint dirigido: sin errores; seis advertencias `no-img-element`, imágenes compartidas entre app y preview.
- Contratos M3/M4/M5: PASS.
- `test-appearance-visual-contract.mjs`: límites de encuadre, rutas móviles de otra marca, etiquetas de botón y renderer compartido escapado PASS.
- Regresión de navegador M5 existente: PASS variantes, URL/recarga, galería por color, agotados, guía/teclado/Escape/foco, bolsa, barra fija y tres tamaños. Datos y transporte de disponibilidad simulados; evidencia anterior conservada y nuevas capturas en `regression-m5/`.
- `test-appearance-visual-ui.mjs`: React real y Chrome, transporte/Auth/Storage simulados. Selección, autosave, undo/redo, orden, visibilidad, publicación explícita, pérdida de respuesta persistida, conflicto/rebase elegido, biblioteca, encuadre y escritorio/tablet/teléfono sin overflow: PASS.
- `certify-appearance-visual-http.mjs`: Next desplegado + Auth/PostgREST/Storage reales. Sesiones OTP generadas administrativamente sin enviar correo ni cambiar contraseñas. Propietario MAGENTA: leer, guardar **el mismo borrador** y recargar PASS. Anónimo 401, cruce de marca 403, rutas de medios ajenas 400. Caché privada verificada.
- Marca `release-test-*` ya existente, sin storefront comercial asociado: subida real de PNG identificado, biblioteca por marca, borrador separado del publicado, revisión antigua 409, encuadre móvil persistido, publicación explícita y proyección pública PASS. Cortesía temporal y habilitación A1 de prueba restauradas al finalizar; datos de prueba conservados y servicio nuevamente suspendido.
- MAGENTA: comparación antes/después confirma borrador y documento público sin cambios; solo avanzó la revisión al guardar idéntico contenido. No se alteraron productos, variantes, inventario, precios ni publicaciones M1/M2.
- `capture-appearance-deployed.mjs`: navegador real con sesión temporal del propietario, editor publicado, acceso por cortesía, enlace de tienda y vista previa desktop/phone PASS. No escribe contenido.

## Evidencia y comparación

`docs/evidence/appearance-visual/`:

- `editor-desktop.png`, `editor-desktop-edited.png`: composición del editor con contenido de demostración local explícito.
- `editor-phone-controls.png`, `editor-phone-preview.png`, `editor-tablet.png`.
- `editor-conflict.png`, `editor-crop.png`.
- `editor-real-magenta-desktop.png`, `editor-real-magenta-phone.png`: instancia publicada y contenido actual real de MAGENTA.

Se corrigieron dos diferencias materiales detectadas en capturas: escritorio activaba el breakpoint de tablet por el ancho del panel y un BOM CSS del harness reducía la altura del editor móvil. Se conserva el renderer aprobado de la tienda, por lo que el encabezado y la fotografía real no se sustituyen por los del mockup.

MAGENTA aún no tiene fotografías comerciales en su Portada ni productos elegibles publicados para esta vista. El editor muestra acciones de carga y estados vacíos. Las fotos de los fixtures visuales no se publicaron en MAGENTA. Para la ficha de ejemplo del selector se necesita un producto con canal online y Ficha web publicada.

La navegación de prueba permite cambiar entre Inicio/Catálogo/Producto y probar la ficha sin comprar. No ejecuta enlaces externos, bolsa ni envíos de formularios del catálogo dentro del editor. No certifica checkout, WhatsApp, pagos, newsletter ni otros servicios externos.

## Archivos

- `src/app/brand/[brandSlug]/pos/online-store/appearance/appearance-editor.tsx`, `appearance.css`, `catalog-settings.tsx`, `product-settings.tsx`.
- Nuevos `visual-editor.tsx`, `use-appearance-draft.ts`, `media-control.tsx` en esa carpeta.
- `src/app/api/pos/online-store/appearance/route.ts`.
- `packages/own-storefront/contract.ts`, `home.tsx`, `home.css`, `product.tsx`.
- `scripts/test-appearance-visual-ui.mjs`, `test-appearance-visual-contract.mjs`, `certify-appearance-visual-http.mjs`, `capture-appearance-deployed.mjs`, `deploy-appearance-release.mjs`.
- Este documento y evidencia visual.

Se usan copias de despliegue revisadas, sin `.env`, datos privados ni fixtures comerciales. No se hizo staging, commit, push ni cambio de HEAD. El trabajo previo permanece pendiente en su estado local. No se aplicaron migraciones ni se activaron cobros, mensajes o workers.

## Despliegues finales y límite de infraestructura

- Administrador final READY: `dpl_BiPvDJMtLcmvkNgzB2RzJkd3B3q6`, https://cometa-1jkschup2-cometa-os-s-projects.vercel.app, alias https://app.cometaos.com. Incluye selección por elemento y foco accesible; capturas autenticadas finales sobre este despliegue.
- Storefront compatible READY: `dpl_ETumsBFi6mxWyphkLzygTrkcQUWG`, https://magenta-controlled-preview-hyftonkk3-cometa-os-s-projects.vercel.app, alias https://magenta-controlled-preview.vercel.app. Incluye encuadres, foto móvil y etiquetas compartidas. Home y Catálogo respondieron HTTP 200 después de la entrega.
- Dos builds adicionales del storefront (`AX6CSNjB52oRHxPjuxmuarUTsr6F` y `Gi8UfPteaLauNM54beox6a1dwanX`) quedaron sin avance en `npm ci`, sin diagnóstico adicional en logs. Se cancelaron exclusivamente esos builds, con ID/proyecto/estado comprobados. El segundo usó descargas acotadas; no se encadenaron más reintentos. El alias sigue en el deployment READY anterior.
- La única diferencia de runtime pendiente de sincronizar en ese último build del storefront es el foco de teclado mediante `event.currentTarget.ownerDocument` en las ventanas del producto (en la página pública coincide con `document`). El administrador sí incluye ese ajuste para su iframe. No bloquea el editor ni el renderizado público de encuadres.
- No se cambiaron versiones de paquetes en este bloque. El build mostró la deuda conocida de cinco alertas altas de dependencias de desarrollo; no se declara una nueva auditoría de seguridad ni se ejecutó actualización indiscriminada.

Repositorio al cierre: rama `feature/comu-v1`, HEAD `e11383a1864aee98736834a8ca8c4bb7c7cb7bca`, índice vacío, diff-check PASS. Los archivos preexistentes continúan pendientes; las adiciones de este bloque están listadas arriba.


## Corrección de contenido y personalización — 12 octubre 2026

Auditoría remota de solo lectura: magenta-fitwear tiene una imagen en el catálogo POS (namespace histórico), un producto activo y Ficha web en borrador vacía, sin publicación. Apariencia no tiene portada ni logo; no se rellenó contenido comercial. La biblioteca anterior omitía el namespace histórico. Ahora permite seleccionarlo y crea una copia web inmutable autorizada, conservando el original. El DTO administrativo informa motivos de inelegibilidad; no modifica la proyección pública.

Cambios: portada sin imagen compacta; avisos editor-only para contenido pendiente y sección oculta seleccionada; selección específica de imagen/título/texto/botón/entrada; selector de productos con miniaturas; controles de encabezado; footer con identidad logo/texto/ambos/ninguno, nombre gigante opcional y redimensionable, columnas, redes y contacto. Estilos por bloque (tipografía, tamaños, colores, espacios, alineación, columnas cuando aplican, botones) con ajustes desktop/mobile y restauración del bloque. Catálogo y Bolsa incorporan orden/visibilidad de bloques; la selección y los importes permanecen obligatorios. Bolsa usa el componente real en modo sin efectos, sin crear sesión ni operaciones. El encuadre y fotografía móvil de banner de Catálogo se aplican en editor y storefront.

Persistencia: campos JSON opcionales validados en el contrato existente; no migración, sin alterar versiones públicas por guardar borrador. Se conservan CAS, recuperación de respuesta perdida, undo/redo y publicación explícita. Campos desconocidos y CSS/URLs arbitrarios no se aceptan.

Pruebas: contratos de Apariencia/M3/M4/M5; TypeScript; lint dirigido; Chrome con React real y transporte simulado; HTTP real con Auth/PostgREST/Storage y publicación únicamente en release-test; navegador real con administrador canónico en marca sintética: foto existente, título, orden, guardar, recargar y publicar, comprobado en RPC pública. Sesión real temporal del propietario para lectura/capturas MAGENTA, sin envío de correo. La prueba sintética restaura servicio y retira cortesía temporal. MAGENTA conserva su documento público y borrador comercial.

Límites expresos: textos transaccionales de seguridad/errores, etiquetas de filtros y estructura funcional de variantes/pagos siguen definidos por aplicación. No hay CSS libre, fuentes subidas por el usuario ni composición arbitraria de tipos de sección; existe una sección por tipo y duplicación de entradas compatibles. Los estilos son por bloque, no un editor tipográfico independiente para cada palabra. La vista de Bolsa sin selección es vacía; no se inventan artículos para ilustrarla. La ficha de un producto no publicado se prepara en POS/Ficha web, no en Apariencia. No declarar personalización libre de todos los elementos ni habilitación comercial completa.

Despliegue: copia revisada, sin staging/commits/push. Para storefront se usó el manifiesto de dependencias de su app, fijando versiones del lockfile existente en la copia; evitó instalar herramientas OS ajenas. No se cambió el manifiesto del repositorio ni proyectos Vercel.

### Despliegues verificados de esta corrección
- COMETA: dpl_GTVKHDfpdrXqVtRnfHNRZnFRi2rN; https://app.cometaos.com/brand/magenta-fitwear/pos/online-store/appearance
- Storefront: dpl_58rS1E4iENkZFzXDQsmnFHixUqsV; https://magenta-controlled-preview.vercel.app
- Ambos builds Next/TypeScript terminaron READY. Las rutas públicas /, /catalogo y /bolsa devolvieron 200 sin placeholders del editor. Login OS y COMU /sell devolvieron 200. Esto no sustituye recertificación operativa completa de OS/POS/COMU.
- HEAD conservado: e11383a1864aee98736834a8ca8c4bb7c7cb7bca. Índice vacío. Sin migraciones ni cambios de stock/precios/propietarios.

### Archivos de esta ampliación
- packages/own-storefront/{contract.ts,design-contract.ts,design.tsx,home.tsx,home.css,catalog.tsx,checkout.tsx}.
- apps/magenta-storefront/app/catalogo/page.tsx; apps/magenta-storefront/lib/checkout-page.tsx.
- src/app/api/pos/online-store/appearance/route.ts.
- src/app/brand/[brandSlug]/pos/online-store/appearance/{appearance-editor.tsx,visual-editor.tsx,media-control.tsx,design-controls.tsx,use-appearance-draft.ts,appearance.css}.
- scripts/{test-appearance-visual-contract.mjs,test-appearance-visual-ui.mjs,test-storefront-m3-contract.mjs,certify-appearance-visual-http.mjs,certify-appearance-browser-live.mjs}.
- Este documento y capturas docs/evidence/appearance-visual/: editor-desktop, editor-desktop-edited, editor-phone-controls, editor-phone-preview, editor-tablet, editor-conflict, editor-crop, editor-missing-content, editor-product-selection, editor-real-magenta-desktop/phone, editor-real-synthetic-desktop/phone, home-desktop/phone.

### Preparación comercial pendiente de MAGENTA
La foto existente ya puede seleccionarse desde la biblioteca. La dueña debe elegir la portada y el logo; preparar fotografías por color y publicar la Ficha web de SHORT DUPE EFECTO BOMBA; seleccionar su canal online en Productos. Apariencia no activa estos pasos ni adivina la asociación entre foto y variante. No se copiaron fotos ilustrativas a MAGENTA. Pagos/envíos/WhatsApp no se activaron.

Resultado final adicional: PASS navegador publicado con selección de foto histórica POS, copia web, original conservado, guardado/recarga/publicación y lectura RPC pública concordantes. El harness corrigió dos condiciones de prueba Windows/Chrome: EBUSY al abrir DevToolsActivePort y espera de Page.loadEventFired tras recarga. No se modificó runtime por estos fallos. Capturas finales reales: editor-real-synthetic-desktop/phone y editor-real-magenta-desktop/phone. Los datos sintéticos permanecen identificados y no pertenecen al storefront MAGENTA. La cortesía temporal fue revocada y el servicio sintético restaurado.
