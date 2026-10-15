# V3B — certificación final local

> Estado final aprobado: FUNCTIONALLY CERTIFIED = YES; VISUALLY APPROVED = YES. Los bloqueos descritos abajo son historicos y quedaron resueltos por la [certificacion POS round-trip](comu-v3b-pos-roundtrip-certification.md). Ver [checkpoint V3B](comu-product-editor-v3b-checkpoint.md) para alcance y validaciones finales.


Resultado: **NO cerrado según el criterio integral solicitado**. COMU V3B browser/HTTP PASS; round-trip por API POS principal BLOCKED. No se modificó la UI ni lógica de aplicación durante esta certificación.

## Destino e instalación

- Supabase `http://127.0.0.1:54321`.
- PostgreSQL `127.0.0.1:54322`, contenedor Docker `supabase_db_zhtagqrzyovsrmsicaot`, base `postgres`.
- Config local `project_id = "zhtagqrzyovsrmsicaot"`; puertos Docker inspeccionados antes de SQL.
- Historial confirmado: Buyer Foundation `20260928180000`, Mutation Boundary `20261002121000`, C1 `20261003130000`, C2 `20261003150000`.
- Aplicada únicamente `20261003170000_comu_shared_variant_contract_v1.sql`, transacción dirigida + registro local + recarga de cache PostgREST. Sin reset ni db push.
- RPCs, grants, RLS, constraints y políticas verificados antes/después; solo cambiaron las funciones previstas. Escrituras genéricas de productos/inventario continúan denegadas a authenticated; RPC C2 continúa permitida y anon denegado.
- Evidencia: `docs/visual-evidence/comu-product-editor-v3b/final-certification/local-installation.json`.

## Browser/HTTP real

Auth local existente Seller A. Fixtures nuevos solo de datos locales: Color (Negro/Rosa/Beige), Talla (CH/M/G/XL), producto identificado `LOCAL TEST V3B FINAL …`.
Definiciones persistidas en `pos_product_attribute_definitions`; ningún valor hardcodeado en código de aplicación. No usuarios, memberships ni entitlements POS nuevos.

| Criterio | Resultado |
|---|---|
| variantContract | PASS API real, versión 1 |
| attributeDefinitions | PASS API real, opciones 3+4 |
| Creación desde editor | PASS interacción DOM real en Chromium, sin interceptar APIs |
| 3×4 | PASS 12 variantes generadas con V3A |
| SKU | PASS 12 únicos, CH→C, XL→X; manual conservado al regenerar otro faltante; mismos SKU al reabrir |
| Precio | PASS 499 aplicado a todas, excepción 525 persistida |
| Stock UI | PASS cantidad física 8 en variante individual y ubicación real |
| Stock HTTP | PASS 8→9, mismo requestId repetido continúa en 9; expectedQuantity obsoleto→409; cantidad restaurada a 8 |
| Reservas | Cantidad reservada real del fixture 0 conservada; available derivado comprobado. Reservas positivas/concurrencia/última unidad PASS en PostgreSQL desechable, no se simularon reservas en producción ni principal |
| Retiro | PASS active=false y reapertura, sin DELETE; identidad y SKU conservados |
| Reactivación | PASS reconciliación de combinación existente + acción explícita Reactivar; mismo ID/SKU, 12 totales |
| Imágenes | PASS selección desde editor, upload Storage local, preview y reapertura. Se usó `public/comu/home/hero.jpg` como imagen de fixture; no foto ficticia del mockup |
| Mayoreo | PASS nivel 6 unidades / 450 persistido y reabierto |
| Draft/publicación | PASS guardado borrador, reopen, publicar, reopen PUBLISHED; estado seller preexistente conservado |
| Legacy existente | PASS cambio temporal del nombre desde editor, reopen y restauración; mismo SKU/product_code/attributes/variant IDs/barcode/inventory |
| Fuente POS compartida | PASS lectura canónica del mismo producto y 12 IDs/SKU/atributos en tablas POS |
| POS HTTP principal | BLOCKED GET/PATCH antes de operar: 503 POS_DEVICE_LOOKUP_FAILED |
| POS↔COMU SQL aislado | PASS ambas direcciones mediante funciones reales; no sustituye el recorrido HTTP pendiente |
| Responsive | PASS desktop 1536, tablet 834 y phone 390, sin overflow horizontal |

La primera ejecución del harness de retiro eligió otra fila por orden del catálogo; se corrigió el selector a SKU exacto y se restauraron las variantes de ese producto de prueba antes de repetir. No fue un bug del editor.

## Bloqueo POS demostrado

Admin COMETA local existente, rol admin/active, autenticación real:

- GET `/api/pos/products?brandSlug=…`: HTTP 503, `POS_DEVICE_LOOKUP_FAILED`.
- PATCH `/api/pos/products`: mismo HTTP 503 antes de escritura.
- SQL de inspección: `to_regclass('public.pos_devices') IS NULL`.
- M1 `20261002120000_pos_device_foundation_v1.sql` no está en historial local.
- La marca del Seller A COMU no tiene fila en `pos_subscriptions`.

No se instaló M1 ni se creó suscripción POS: la autorización actual permite aplicar exclusivamente V3A. No se evitó el control usando service-role ni se concedió acceso POS al seller.
Para cerrar el round-trip HTTP hace falta un entorno/fixture POS autorizado con sus dependencias y acceso comercial operativo. Esto exige una decisión/autorización adicional; no es un bug visual ni requiere una nueva migración V3B.

## Evidencia

Conservadas todas las capturas V3B anteriores. Nuevas:

- `docs/visual-evidence/comu-product-editor-v3b/final-certification/product-editor-variants-12-desktop.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/product-editor-variants-12-phone.png`
- `docs/visual-evidence/comu-product-editor-v3b/final-certification/product-editor-variants-12-tablet.png`
- `browser-results.json`, `legacy-results.json`, `stock-http-results.json`, `pos-http-blocker.json`.
- Regresiones visuales en subdirectorios nuevos `regression-v1` y `regression-v2`.

Los IDs de fixture se guardan localmente en `.env.comu-v3b-final-fixture.json`, ignorado por Git; sin credenciales en evidencia/documentación. El producto final permanece PUBLISHED exclusivamente local para revisión. El producto legacy conserva su nombre original. No se eliminaron fixtures ajenos.

## Regresiones

- `node scripts/test-product-variants-v3a.mjs`: PASS caracterización POS antes/después y motor compartido.
- `node scripts/test-comu-seller-catalog-local.mjs`: PASS C2 y componente V3B.
- `node scripts/test-comu-product-media-v3b.mjs`: PASS reintentos de imágenes controlados.
- `node scripts/test-product-variants-postgres-v3a.mjs`: PASS C1/C2/V3A, reservas/concurrencia/idempotencia, legacy y round-trip SQL real. Base desechable `comu_v3a_1791213766320` eliminada.
- `node scripts/certify-comu-v3b-regressions-local.mjs`: PASS scripts Seller Visual V1 y Productos V2, ACTIVE/PREPARING en desktop/tablet/phone.
- TypeScript `--noEmit --incremental false --pretty false`: PASS, 0 errores.
- ESLint dirigido: PASS, 0 errores/advertencias finales.
- `git diff --check`: PASS.

## Archivos de esta certificación

Nuevos scripts:

- `scripts/certify-comu-v3b-local-setup.mjs`
- `scripts/certify-comu-v3b-browser-local.mjs`
- `scripts/certify-comu-v3b-legacy-browser-local.mjs`
- `scripts/certify-comu-v3b-roundtrip-local.mjs`
- `scripts/certify-comu-v3b-regressions-local.mjs`

Documentación: este informe, enlace desde el informe V3B anterior y snapshot Git final. Evidencias indicadas arriba.
Archivos de aplicación modificados por bugs: **ninguno**. Checkpoint V3A intacto; cambios anteriores COMU/POS/Mobile preservados. Sin commit, push, deploy, remoto ni siguiente bloque.
