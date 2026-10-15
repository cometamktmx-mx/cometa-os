# Activación MAGENTA — 12 octubre 2026

**Actualización posterior:** el bloqueo POS documentado abajo quedó resuelto mediante cortesía revocable sin vencimiento automático. Guardado/recarga HTTP real de Ficha web y Apariencia por el propietario PASS. Véase `pos-workspace-courtesy-v1.md`; se conserva abajo el diagnóstico inicial como historia, no como estado vigente.

Identidad confirmada expresamente por el usuario: `magenta-fitwear`, marca `70880b54-b6fe-4775-bb39-c9ff19c47c39`; cuenta Auth `493f2651-9690-42f0-afe8-e34c8848754e`, `guiasmagenta@gmail.com`.

## Cambios realizados

- Perfil faltante creado con rol `client`, estado `active`, email obtenido de Auth. No se concedió rol global admin ni se cambió contraseña.
- Membresía canónica existente `owner/active` preservada, sin reasignaciones.
- A1 activado por `brand_online_store_set_access_a1`, con actor administrador canónico activo y evento persistido. No se modificó la suscripción POS ni OS/COMU.
- Storefront existente vinculado a `magenta-fitwear` en variables de servidor. No se configuraron Stripe, tarifas, workers ni WhatsApp.
- Apariencia publicada mediante RPC M3 con autoridad administrativa: nombre confirmado, paleta/layout existentes, Inicio y Catálogo. Sin fotos, beneficios, productos ni promesas inventadas. Las secciones comerciales sin contenido permanecen desactivadas.
- Ningún producto se seleccionó automáticamente para online; ninguna Ficha web se publicó automáticamente.

## Verificación y bloqueo encontrado

Se obtuvo una sesión real del propietario mediante enlace OTP generado administrativamente y consumido localmente: no se envió email ni se almacenaron tokens, y se cerró únicamente esa sesión temporal al terminar. Esto NO certifica que el cliente haya ingresado manualmente su contraseña.

- Páginas POS, Productos y Apariencia: HTTP 200; esto por sí solo no certifica sus operaciones.
- API administrativa global: 403 para el propietario.
- API de productos de `magenta-fit-wear`: 403; aislamiento preservado.
- API Apariencia: **403 POS_SUBSCRIPTION_ACCESS_DENIED**, `trial_expired`, `accessSource=none`. La suscripción comercial POS vencida bloquea también Ficha web/Apariencia. No se evitó esa guarda ni se simuló una suscripción pagada.
- Se solicitó al usuario la decisión concreta de plan/vigencia o cortesía mediante el mecanismo comercial existente. Hasta resolverla, guardado/recarga mediante sesión del propietario NO están certificados.
- Publicación administrativa M3 y lectura pública posterior: PASS, identidad MAGENTA y cero productos elegibles.
- Comparación de productos, variantes, existencias, sucursales, perfiles de negocio y membresías de ambas marcas: sin cambios durante la publicación. Respaldo acotado previo en el directorio privado de entrega, fuera de Git.

## Contenido que debe cargar el propietario cuando se desbloquee POS

1. `/brand/magenta-fitwear/pos/products`: abrir SHORT DUPE EFECTO BOMBA → Ficha web. Asociar fotos reales a cada color/variantes, configurar portada y muestra de color, descripción/cuidados y guía de tallas verificadas. Guardar borrador y publicar únicamente contenido aprobado.
2. En el mismo editor, Canales de venta: conservar Tienda física y seleccionar Tienda online cuando el producto esté autorizado. Guardado de canales separado del contenido.
3. `/brand/magenta-fitwear/pos/online-store/appearance`: cargar logo/hero y recursos comerciales aprobados, seleccionar productos ya elegibles; guardar y publicar. No hay fotografías comerciales aprobadas persistidas en M2/M3 para esta marca.

## Pedidos pendientes

Confirmar sucursal de despacho y política comercial/precios online; configurar cuenta Stripe propia, cotización real de envío y certificación de pago. WhatsApp no está operativo como canal de pedidos: falta política y flujo persistente previo a abrir conversación. Ningún clic de contacto debe declararse pago ni volver a descontar inventario.

Sin migraciones, commits, staging, push ni modificaciones de `magenta-fit-wear`. Los cambios de esta continuación son el runner de activación y esta documentación; configuración/datos remotos limitados a la marca confirmada y su perfil faltante.

## Despliegue y URLs comprobadas

Despliegue READY: `https://magenta-controlled-preview-a22rhfk61-cometa-os-s-projects.vercel.app`; alias `https://magenta-controlled-preview.vercel.app`. Build independiente y TypeScript PASS, Next 16.4.0.

HTTP real: home, catálogo, bolsa y checkout devuelven 200 con identidad MAGENTA. El producto no publicado no expone nombre ni contenido al entrar por URL directa (su pantalla de indisponibilidad devuelve 200; no se afirma 404). Catálogo sin productos elegibles, sin compra certificada. Login OS y solicitud/login COMU continúan 200. No se modificó el despliegue OS en esta activación.

Acceso propietario: `https://app.cometaos.com/login`, después `https://app.cometaos.com/brand/magenta-fitwear/pos`. Productos y Apariencia conservan las rutas existentes y la guarda de suscripción descrita arriba.

Pruebas fueron HTTP/Auth/PostgREST reales y RPC persistida; no se certificó un recorrido manual de navegador ni un pago. HEAD `e11383a1864aee98736834a8ca8c4bb7c7cb7bca`, índice vacío preservado, diff-check y sintaxis del runner PASS.
