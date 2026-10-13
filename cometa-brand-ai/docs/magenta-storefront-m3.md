# M3 — Home y Apariencia de tienda propia

Implementación local sobre HEAD `e11383a1864aee98736834a8ca8c4bb7c7cb7bca`, rama `feature/comu-v1`. Sin commit, despliegue ni migración sobre bases existentes.

## Arquitectura y autoridad

- Aplicación Next independiente: `apps/magenta-storefront`. Renderer y contrato puros: `packages/own-storefront`. El POS y la aplicación pública usan el mismo componente y CSS, con consultas de contenedor para la preview móvil.
- Marca resuelta exclusivamente mediante `STOREFRONT_BRAND_SLUG` del servidor del despliegue. No acepta cambiar de marca desde host, query o body públicos. La API administrativa resuelve y autoriza `brandSlug` con el contexto POS existente.
- La aplicación pública utiliza `STOREFRONT_SUPABASE_URL` y `STOREFRONT_SUPABASE_ANON_KEY`: nunca service-role. Estas variables no tienen prefijo público ni se envían al navegador. No se agregaron valores ni credenciales.
- RPC pública `brand_storefront_home_m3`: exige marca activa, A1 habilitado y Apariencia publicada. Devuelve exclusivamente documento publicado y tarjetas acotadas.
- Tarjetas: producto activo, sellable, físico, inventario directo, M1 online seleccionado, M2 publicado y variantes activas de la misma marca. Stock cero conserva la tarjeta como Agotado. No hay dependencia de listings, Stripe Connect, comisiones o HUB de COMU.
- Precios mínimos de variantes activas y moneda de sucursales existentes; si hay múltiples monedas, se omite el precio formateado. La disponibilidad es informativa y agregada sobre sucursales de la marca, no una promesa de disponibilidad de checkout. La selección de sucursal y reserva transaccional corresponden al próximo bloque.
- Fotografías: primera foto publicada M2 asociada a una variante activa; sin reconstrucción desde borradores. No salen costos, cantidades reservadas, configuración comercial, usuarios ni payloads administrativos.

## Persistencia y permisos

Migración aditiva `supabase/migrations/20261011100000_brand_storefront_appearance_m3.sql`.

`brand_storefront_appearance` almacena una fila por marca: draft, published, revision, published_revision, actor y timestamps. RLS activado; sin SELECT directo para anon/authenticated. Service-role tiene lectura y ejecución de funciones, no escritura directa sobre la tabla. La RPC pública solo permite lectura proyectada; la función interna de tarjetas no está concedida a clientes públicos.

`brand_storefront_save_m3` verifica perfil activo y administrador global o membresía owner/admin activa, Retail, pertenencia de productos e imágenes, y revisión esperada. Serializa con bloqueo de marca compatible con A1/M1/M2. Un conflicto no sobrescribe contenido. El guardado normal no altera la versión publicada. Publicar exige A1 habilitado y marca activa; no habilita el servicio ni crea dominio, pedidos o membresías. Suspender A1 conserva todos los documentos y bloquea la lectura pública. Borradores siguen editables por administradores autorizados.

La API privada `/api/pos/online-store/appearance` reutiliza guardas POS/M2, validación allowlist y `private, no-store`. La preview administrativa no tiene ruta anónima ni token. No realiza consultas a proveedores al abrir. Los errores de guardado bloquean posteriores guardados hasta recargar para verificar el estado.

## Experiencia implementada

Ruta POS: `/brand/{brandSlug}/pos/online-store/appearance`, entrada Retail en sidebar; Food no recibe la entrada. La API rechaza Food aunque se escriba la URL manualmente.

Editor: orden/activación de las once secciones, textos, imágenes por carga autorizada M2, URLs HTTPS de archivos de video, enlaces, productos reales, logo, cuatro colores, tipografía editorial/moderna, espaciado y movimiento. Encabezado, anuncios, navegación y pie configurables. Borrador/publicar separados y preview de cambios sin guardar. Móvil alterna Editar/Vista previa; escritorio mantiene dos columnas.

Home: encabezado, hero, franja, categorías, destacados, look, videos, testimonios, beneficios, mayoreo, FAQ, newsletter y pie. Las secciones parten vacías y desactivadas. Los productos seleccionados que pierden elegibilidad desaparecen del resultado público sin borrar la selección guardada. El selector permite búsqueda por nombre; cada consulta considera hasta 100 coincidencias y conserva los IDs seleccionados.

No hay reseñas, promesas o cifras precargadas. El editor advierte que solo deben publicarse testimonios reales autorizados. Newsletter solo ofrece un enlace a un destino externo configurado: sin destino no aparece y no hay formulario que simule captación. Videos usan archivos HTTPS con controles, sin autoplay ni iframes. No hay iconos de pago al no existir métodos propios configurados. WhatsApp, si se configura, es solo un enlace HTTPS de contacto.

Entrada M de 700 ms, configurable y sin interceptar interacción. Movimiento reducido desactiva entrada/franja. Logos con `object-fit: contain`, sin filtros o mezcla que introduzcan fondo negro. Texto React escapado; no HTML, Liquid, metafields, CSS libre ni JavaScript del comerciante.

## Referencia visual y evidencia

Se inspeccionaron `templates/index.json`, header/hero y secciones del ZIP `referencias-magenta/MAGENTA-Atelier-Shopify-v0.6.zip`, más `magenta.css`, `atelier.css` y `atelier-v4.css`. Se conservan vino/rosa/marfil, serif editorial grande, fotografía protagonista, categorías verticales, selección en grid, look dividido y pie vino. No se copió el motor comercial Shopify.

Capturas de componentes reales en Chrome headless:

- `docs/evidence/m3/home-desktop.png`
- `docs/evidence/m3/home-phone.png`
- `docs/evidence/m3/appearance-desktop.png`
- `docs/evidence/m3/appearance-phone-edit.png`
- `docs/evidence/m3/appearance-phone-preview.png`

Las capturas usan fixtures explícitos y recursos del ZIP ya presentes en evidencia M2. **No representan productos de producción, una sesión autenticada Next/Supabase ni una tienda operativa.** Secciones sin contenido real/integración aparecen ocultas. El catálogo de muestra tiene un producto agotado; no se agregaron productos artificiales para llenar la cuadrícula. El editor mantiene identidad verde/marfil; la preview conserva MAGENTA. Se corrigió una colisión inicial de tipografía del administrador sobre la preview.

## Verificaciones ejecutadas

- `node scripts/test-storefront-m3-local.mjs`: PostgreSQL real desechable + HTTP loopback. PASS para A1/M1/M2, propietario/marca, borrador/publicado, cero stock, CAS concurrente, suspensión/retención, grants, imágenes/precios y ausencia de efectos en catálogo/inventario/movimientos/COMU.
- `scripts/test-storefront-m3-http.mjs`, invocado por el anterior: handlers reales y persistencia SQL real; sesión/contexto comercial y transporte Supabase inyectados. PASS autorización, no-store, recarga, conflicto, suspensión, enlaces inseguros y referencias de otra marca.
- `node scripts/test-storefront-m3-contract.mjs`: PASS límites, enlaces, aislamiento de medios, duplicados, inyección CSS y descarte de claves desconocidas.
- `node scripts/test-storefront-m3-ui.mjs`: PASS componentes React reales, cambios sin guardar, guardado/publicación con transporte simulado, FAQ, stock cero, reducción de movimiento y ausencia de overflow en 1440/820/390 px. Capturas desktop/phone.
- `node scripts/test-product-channels-m1-local.mjs`: PASS SQL/HTTP, canales, SKU/escáner, Food, permisos e invariancia POS/COMU.
- `node scripts/test-product-web-m2-local.mjs` y `node scripts/test-product-web-m2-contract.mjs`: PASS SQL/HTTP/contrato, M2 draft/publicado, medios/autorización, concurrencia y conservación de inventario. Storage del harness está simulado.
- `node node_modules/next/dist/bin/next build apps/magenta-storefront --webpack`: PASS compilación, TypeScript y generación de aplicación independiente.
- TypeScript raíz `--noEmit --incremental false --pretty false`: PASS inicial y final.
- ESLint dirigido: 0 errores, 1 advertencia de `<img>` en renderer compartido. Se conserva imagen estándar para funcionar también en preview sin un optimizador/remoto nuevo.
- `git diff --check`: PASS; Git avisa conversión LF/CRLF en archivos existentes, sin errores de whitespace.

El runner verifica el contenedor Supabase local con puerto 54322, crea `cometa_m3_<timestamp>`, copia únicamente esquema (no datos) y aplica archivos SQL literalmente solo allí. Base final M3 `cometa_m3_1791684045217`, M1 `cometa_m1_1791684003647`, M2 `cometa_m2_1791683988780`: eliminadas al finalizar. No se aplicó esta migración en `postgres` ni remoto.

## Ejecución local y límites

Con las dependencias del repositorio instaladas, `npm --prefix apps/magenta-storefront run dev` sirve la aplicación separada en 3100. Configurar las tres variables del servidor para un entorno autorizado; no usar service-role. Para compilación independiente desde este monorepo, usar la raíz/lockfile existentes y ejecutar el script build de esa aplicación. No se instalaron dependencias nuevas. `.next`, variables locales y tipos generados de esta aplicación están ignorados.

La migración M3 todavía NO existe en la base principal. Por eso una sesión habitual contra ella no podrá guardar Apariencia hasta una aplicación posterior expresamente autorizada. No se certificó cookie/session real, PostgREST remoto, subida real de medios ni despliegue. Las pruebas SQL sí verifican roles/grants efectivos, y las pruebas HTTP usan SQL real.

Catálogo completo, ficha pública, bolsa, checkout, reservas de tienda propia, pagos, WhatsApp pedidos y dominios permanecen fuera de este bloque. Las tarjetas no aparentan comprar ni abrir fichas inexistentes. Newsletter no almacena correos. No se declara producción ni compatibilidad nativa.

## Archivos M3

- `apps/magenta-storefront/{.gitignore,package.json,tsconfig.json,next.config.ts,app/layout.tsx,app/page.tsx}`
- `packages/own-storefront/{contract.ts,home.tsx,home.css}`
- `src/app/api/pos/online-store/appearance/route.ts`
- `src/app/brand/[brandSlug]/pos/online-store/appearance/{page.tsx,appearance-editor.tsx,appearance.css}`
- `src/app/brand/[brandSlug]/components/pos-sidebar.tsx`: únicamente tipo/entrada Retail/filtro Food.
- `supabase/migrations/20261011100000_brand_storefront_appearance_m3.sql`
- `scripts/test-storefront-m3-{contract,http,local,ui}.mjs`
- Este documento y `docs/evidence/m3/`.

Se compararon SHA-256 de los 219 archivos pendientes iniciales: todos intactos, incluidos M0/M0.1/A1/M1/M2. No cambió el índice. El sidebar estaba limpio antes de M3 y es la única modificación M3 a un archivo ya versionado. El resto son archivos nuevos del bloque; el trabajo ajeno permanece pendiente exactamente como estaba.
