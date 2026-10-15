# MAGENTA — preparación de preview controlada

## Entrega operativa posterior

La autorización posterior ya se ejecutó: esquema compartido actualizado y aplicaciones publicadas. Consultar [entrega operativa y bloqueos reales](operational-release-20261011.md). Las secciones siguientes son historial de preparación y no representan el estado actual.

## Actualización: reutilizar Preview COMETA OS/POS (11 octubre 2026)

Esta sección reemplaza la propuesta anterior de otro administrador. No se creó ni eliminó ningún recurso en esta continuación. Los dos proyectos de prueba anteriores se conservan; `magenta-admin-controlled-preview` queda sin uso.

### Flujo verificado

- Git remoto: `https://github.com/cometamktmx-mx/cometa-os.git`; rama local `feature/comu-v1`; HEAD `e11383a1864aee98736834a8ca8c4bb7c7cb7bca`.
- Vercel existente: `cometa-os-s-projects/cometa-os`, ID `prj_ecEVtItINKExbKMjTCfterMj1tJy`, Git conectado al repo anterior, rootDirectory **cometa-brand-ai**. No se cambió su configuración.
- Preview READY de la rama: https://cometa-os-git-feature-comu-v1-cometa-os-s-projects.vercel.app . Deployment inmutable: https://cometa-62snuy74q-cometa-os-s-projects.vercel.app . SHA desplegado `e6182fbeac0591d6269bbd4bb889216b4d5f964d`, anterior al trabajo local.
- Login y diez bundles leídos a través de Vercel: destino público compilado **https://zhtagqrzyovsrmsicaot.supabase.co**. No se imprimieron claves. Es el proyecto Cometa BRAND IA, no una base aislada MAGENTA.
- Variables SUPABASE del proyecto tienen targets **production,preview**, sin override de rama en el listado. Esto implica riesgo de base compartida: no aplicar cambios allí como si fueran exclusivos de Preview.
- Los endpoints de variables devolvieron valores ocultos; `env run` desde el repositorio cargó `.env.local`, por lo que ese resultado no se usó para identificar el deployment. La evidencia decisiva es el hostname de los bundles realmente desplegados. No se sobrescribió ningún `.env`.

### Diagnóstico de login local

`.env.local` apunta a `http://127.0.0.1:54321`. Auth local responde 200; la consulta administrativa de usuarios no encontró `cometa.mktmx@gmail.com`. La base remota sí contiene esa identidad y perfil `admin/active`, verificados por SELECT. La contraseña remota no puede autenticar una identidad ausente en otra base. No se probó ni cambió ninguna contraseña, ni se creó usuario automáticamente.

Solución separada: mantener localhost aislado y aprovisionar explícitamente una cuenta local de prueba con rol/permisos autorizados, o usar la Preview existente para la cuenta remota. No cambiar silenciosamente localhost a la base compartida. Diagnóstico de configuración/identidad, no certificación de login interactivo con contraseña.

### Migraciones faltantes y orden propuesto — NO EJECUTADO

Inspección `BEGIN TRANSACTION READ ONLY`: ledger remoto llega a `20260927100000_comu_finance_operational_hardening`. Ninguna de las 16 migraciones siguientes está registrada. También faltan tablas distintivas A1/M1/M2/M3/M6, devices, N1; RPCs O1, B1, catálogo C2 y storefront. C1 no tiene `approval_origin`. Storage `pos-products` sí existe. No basta aplicar solo A1–M6 si se despliega todo el runtime local.

Todas las rutas siguientes tienen prefijo `supabase/migrations/`:

| Orden | Archivo | Impacto / dependencia |
| --- | --- | --- |
| 1 | 20261002120000_pos_device_foundation_v1.sql | Dispositivos, sesiones staff y actor Food; revisar operaciones POS existentes |
| 2 | 20261002121000_pos_mutation_api_boundary_v1.sql | Revoca mutaciones SQL directas; consumidores deben usar API autorizada |
| 3 | 20261003130000_comu_seller_approval_v1.sql | C1, estados/constraints y guardas Seller; marca registros anteriores como LEGACY |
| 4 | 20261003150000_comu_seller_catalog_v1.sql | C2, catálogo y comandos idempotentes; requiere C1 |
| 5 | 20261003170000_comu_shared_variant_contract_v1.sql | Reemplaza RPCs C2 para contrato compartido; no es un nuevo inventario |
| 6 | 20261005120000_comu_order_contract_state_safety_v1.sql | O1, pago/autorización/transiciones/tracking/lecturas e índices |
| 7 | 20261005150000_comu_notifications_v1.sql | N1, outbox/notificaciones/triggers/cutover; no activar worker/email |
| 8 | 20261005170000_comu_buyer_order_read_privacy_v1.sql | B1, reduce grants y añade lecturas seguras; coordinar versión de consumidores |
| 9 | 20261010120000_comu_reservation_lifecycle_m0.sql | Reemplaza protocolo de reservas/órdenes/pago; alto impacto transaccional compartido |
| 10 | 20261010160000_brand_online_store_access_a1.sql | Autoridad independiente, auditoría y CAS; servicio apagado por ausencia de fila |
| 11 | 20261010180000_pos_product_sales_channels_m1.sql | Selecciones de canales; online no se activa automáticamente |
| 12 | 20261010200000_pos_product_web_content_m2.sql | Contenido por producto, borrador/publicado y CAS |
| 13 | 20261011100000_brand_storefront_appearance_m3.sql | Apariencia y lectura pública filtrada; requiere A1/M1/M2 |
| 14 | 20261011120000_storefront_catalog_m4.sql | Catálogo público y validación de configuración |
| 15 | 20261011140000_storefront_product_m5.sql | Ficha/validación de bolsa y configuración Producto |
| 16 | 20261011160000_storefront_checkout_m6.sql | Órdenes, quotes, ledger de inventario y RPCs; configuración ausente bloquea pagos |

Faltante en ledger no equivale por sí solo a ausencia de cada función histórica que la migración reemplaza. Se comprobaron objetos distintivos; antes de ejecutar se deben comparar definiciones/grants completos contra los archivos certificados y detectar aplicaciones parciales. No se propone reaplicar Finance.

Plan para aprobación: (1) confirmar que se acepta modificar el esquema compartido con Production, o elegir otro destino; (2) respaldo/recuperación verificables y evaluación de consumidores activos; (3) ensayo sobre copia desechable del esquema real sin datos privados, preflight de constraints y reservas pendientes; (4) aplicar archivo original por archivo, en orden, detener ante fallo, registrar ledger separadamente después de éxito; (5) verificar grants/RPCs/PostgREST y regresiones POS/COMU, sin cobros/envíos; (6) solo entonces cargar marca sintética y desplegar Preview. El rollback debe preservar órdenes/reservas; no borrar tablas para deshacer. No se afirma que el plan tenga aprobación de ejecución.

### Copia actual preparada para el flujo existente

`scripts/prepare-magenta-preview.mjs` ahora conserva la estructura del repositorio remoto: `cometa-os/cometa-brand-ai`, compatible con rootDirectory existente. Copia independiente del storefront conservada. Incluye contratos compartidos y dependencias JSON transitivas de POS sin copiar la aplicación Mobile completa. No enlaza `.vercel` ni cambia proyectos.

Copia final: `.next/magenta-preview-preparation/source-1791766058789`, 654 entradas, 13,472,131 bytes; `targets.json` registra proyecto/raíz/Preview/rama, y `manifest.json` registra hashes. Incluye `apps/pos-mobile/src/updates.ts`, parser puro que importan dos componentes existentes del POS; no se cambió su contenido. No contiene `.env`, secretos, cron, datos de bases ni fixtures privados. Copias previas intactas. Noindex únicamente en las copias.

Destino futuro admin: proyecto **cometa-os**, Preview con metadata `feature/comu-v1`; nunca `--prod`, sin push/commit y sin alterar rootDirectory. Storefront: proyecto independiente existente **magenta-controlled-preview**. El otro proyecto admin no se elimina. El frontend MAGENTA no llama al administrador para checkout: tiene handlers propios; ambos dependerán del destino Supabase aprobado. No configurar credenciales remotas en la tienda antes de resolver el gate de base compartida.

No se desplegó ni aplicó migración remota en esta continuación. No hay sesión administrativa ni producto sintético nuevo. Pagos, logística y mensajería permanecen fuera de esta preparación.

Verificación de esta continuación: TypeScript de la copia administrativa final `--noEmit --incremental false --pretty false` PASS; lint del preparador PASS; `git diff --check` PASS. La primera copia detectó el parser Mobile faltante y se corrigió exclusivamente la lista de empaquetado. No se ejecutó un build administrativo con servicios remotos ni se afirma certificación de login interactivo. Los 1,411 archivos del baseline anterior permanecen idénticos; en esta continuación solo cambiaron el preparador y este documento, más artefactos ignorados de inspección/copia. HEAD e índice intactos.

## Registro histórico de la preparación anterior (reemplazado por la actualización superior)

Estado de aquella fase: **PREPARADA PARCIALMENTE / SIN DESPLIEGUE**. Se propuso Supabase remoto exclusivo de pruebas; la instrucción posterior cambia la preparación al flujo Preview existente y exige aprobación previa para modificar la base compartida.

## Recursos verificados

- Vercel: sesión disponible, equipo `cometa-os-s-projects`, plan Hobby.
- Proyectos nuevos, sin Git conectado ni despliegues: `magenta-controlled-preview` (`prj_MOOHfmywnzMF83PxRtqpDk1fvAqE`) y `magenta-admin-controlled-preview` (`prj_BduILOhofMNPcp8A3DlS408VTquO`). Protección Vercel Authentication presente en ambos. No configurar dominios comerciales.
- Proyectos previos `cometa-os` y `nahuitech-quotes`: no modificados.
- Supabase: sesión disponible; proyectos visibles PTM App MVP (inactivo), Nahuitech-Quotes y Cometa BRAND IA (activos). Ninguno se verificó como dedicado a esta prueba. No se reutilizó, pausó, reactivó ni modificó ninguno.
- No se pudo determinar el plan/cupo gratuito de las organizaciones mediante los listados CLI. Tener acceso no autoriza cargos. Se solicitó únicamente crear/identificar un proyecto vacío MAGENTA PRUEBAS con costo autorizado o cupo gratuito; no enviar secretos por chat.
- Espacio: C: 580,263,936 bytes libres; D: 311,881,162,752 bytes libres. Copias/build en D:, sin borrar archivos.

## Copia revisable

`node scripts/prepare-magenta-preview.mjs` crea un destino nuevo bajo `.next/magenta-preview-preparation/source-<timestamp>`; no sobrescribe copias anteriores ni modifica Git. Copia desde el working tree incluyendo archivos nuevos por lista permitida, rechaza patrones de credenciales embebidas y emite manifest SHA-256. Es una comprobación defensiva, no una garantía de auditoría universal de secretos.

Copia actual: `.next/magenta-preview-preparation/source-1791699378075`, 648 entradas, 13,450,658 bytes de fuentes/assets. El manifiesto está fuera de las raíces desplegables. No se copiaron `.env`, vínculos Vercel, datos de bases, respaldos, fixtures privados, ZIP, sesiones, APK ni builds. El cron del repositorio no se copió. Configuración de ambas copias incluye `X-Robots-Tag: noindex, nofollow, noarchive`.

- Storefront: `apps/magenta-storefront`, `packages/own-storefront`, contrato compartido `src/lib/pos/product-web-contract.ts`, package/lockfile raíz. Vercel root directory `apps/magenta-storefront`; verificar instalación desde raíz y acceso a dependencias externas al directorio antes del primer deploy.
- Administrador: fuentes actuales `src` salvo `src/app/dev`, renderer compartido, configuración y assets COMU permitidos. No se extrajo otro administrador. El build y revisión de assets del administrador siguen pendientes; no declarar esta copia certificada.
- Junctions node_modules solo para build local, excluidos por `.vercelignore`; no subirlos. También se excluyen builds generados después de preparar la copia.

## Dependencias y configuración pendiente

La tienda no llama handlers del administrador: consulta Supabase desde sus propios handlers. El administrador separado sí es necesario para edición, publicación y carga de imágenes.

| Componente | Variables Preview / requisito |
| --- | --- |
| Storefront público | STOREFRONT_BRAND_SLUG=magenta-pruebas; STOREFRONT_SUPABASE_URL; STOREFRONT_SUPABASE_ANON_KEY |
| Checkout invitado | STOREFRONT_SUPABASE_SERVICE_ROLE_KEY exclusivamente servidor; STOREFRONT_ORIGIN igual al origen HTTPS de la preview usada |
| Administrador | NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY del proyecto nuevo; SUPABASE_SERVICE_ROLE_KEY solo servidor; Auth redirects acotados a URL administrativa |
| Storage | Bucket pos-products, namespace magenta-pruebas/web; objetos sintéticos cargados por API autorizada |
| Pagos | Sin claves Stripe, sin cotizaciones verificadas, sin configuración comercial aprobada: pago bloqueado por contrato existente |
| Automatizaciones | Sin cron, Resend, WhatsApp, OpenAI ni credenciales comerciales. No ejecutar envíos |

La sesión administrativa Auth y la cookie HttpOnly del checkout invitado son mecanismos distintos. No compartir ni copiar cookies. No exigir registro al comprador. No usar wildcard de orígenes; no modificar el control M6.2.

## Base y datos pendientes

No se aplicó SQL remoto. Antes de hacerlo, verificar ref nuevo y Database/Auth/Storage vacíos. Preparar baseline reproducible de esquema sin datos (el runner M6 obtiene esquema local, no demuestra por sí mismo un bootstrap desde cero en remoto). Revisar dependencias y aplicar archivos originales A1/M1/M2/M3/M4/M5/M6 y M0 cuando corresponda, sin db push general ni SQL sobre proyectos existentes. No enviar una copia indiscriminada de datos o credenciales locales.

Crear únicamente MAGENTA PRUEBAS, usuario administrativo sintético, marca/sucursal Retail, productos/variantes e inventario de ejemplo; habilitar A1 y permisos solo allí. Cargar fotos de prueba autorizadas, publicar M1/M2/Apariencia y mantener configuración de pago ausente. El seed remoto y su aplicación quedan pendientes; no usar el harness M6.2 con Stripe simulado para aparentar integración remota.

## Verificación realizada

- Build Next independiente de la copia storefront con webpack: PASS, compilación y TypeScript; rutas home, catálogo, producto, bolsa, checkout, pedido y APIs presentes. Sin variables de servicios externos, no prueba contenido ni conectividad.
- Lint del script de preparación: PASS.
- Hashes de los 1,411 archivos previos: intactos. HEAD `e11383a1864aee98736834a8ca8c4bb7c7cb7bca` e índice intactos. Implementación/evidencia M6.1/M6.2 y cualquier trabajo anterior preservados.
- No se ejecutó nuevamente la matriz SQL.
- Pendiente remoto: login admin, edición/upload/publicación, Home/Catálogo/Producto, variantes, bolsa y recarga, checkout bloqueado, consulta privada y pruebas desktop/móvil. Sin capturas remotas porque no hay deployment.

## Continuación

1. Confirmar proyecto Supabase nuevo y costo/cupo autorizado; recuperar configuración por herramientas autenticadas, nunca por chat.
2. Preparar y verificar esquema/seed solo en ese destino; Storage y Auth reales.
3. Revisar/build administrador; configurar exclusivamente variables Preview y URL exacta, preservando protección Vercel.
4. Desplegar copias a Preview explícito, nunca `--prod`; no conectar repositorio ni modificar proyectos previos.
5. Ejecutar el recorrido remoto y documentar URLs/capturas/resultados. Stripe/logística permanecen bloqueados mientras falte integración real.
