# COMU C1 + C2 — certificación local, 2026-10-03

FUNCTIONALLY READY FOR SELLERS: **NO**. VISUALLY CERTIFIED: **NO**.

## Destino y migraciones

Supabase/Auth/Storage/REST: `http://127.0.0.1:54321`. PostgreSQL: `127.0.0.1:54322`. Next: `http://localhost:3000`.
`supabase/config.toml`: project_id `zhtagqrzyovsrmsicaot`. Este identificador no seleccionó un proyecto remoto.

Se enumeró y aplicó únicamente esta cadena a la base local existente, sin reset ni db push:

1. `20260928180000_comu_buyer_experience_v1.sql`: tablas de solicitudes/Buyer requeridas por C1.
2. `20261002121000_pos_mutation_api_boundary_v1.sql`: revocación de escrituras genéricas autenticadas; la base local aún las permitía. Dependencia de seguridad de C2.
3. `20261003130000_comu_seller_approval_v1.sql`.
4. `20261003150000_comu_seller_catalog_v1.sql`.

Las bases COMU/Connect/catálogo/Storage previas ya estaban presentes. No se necesitó instalar device foundation. Se verificaron cinco RPC, RLS, constraints, triggers, grants y políticas Storage. No se creó ninguna migración. Se habilitó solamente `COMU_BUYER_FOUNDATION_ENABLED=true` en `.env.local`.

## Evidencia integrada real

| Área | Resultado |
|---|---|
| Auth | PASS: usuarios GoTrue locales reales; password login, sesión y cookies SSR contra Next |
| Solicitud/aprobación/rechazo | PASS por APIs reales; reintentos de aprobación |
| Acceso seller | PASS: página propia PREPARING; marca ajena denegada |
| Catálogo desde cero | PASS: vacío inicial, 10 productos, variantes, publicación por HTTP |
| Variantes/stock | PASS: precio editado a 125 y cantidad física 21 persistidos en tablas compartidas |
| Mayoreo | PASS: regla CUSTOM, cantidad 6, precio unitario 100 |
| Storage | PASS: PNG real subido, metadata persistida, descarga pública 200 con bytes exactos; modificación/eliminación/upload cruzados denegados |
| Diez publicaciones | PASS: progreso central 10/10; permanece PREPARING |
| Elegibilidad completa | PENDIENTE: `COMU_CONNECT_REQUIRED` |
| Activación HTTP | PASS del bloqueo administrativo 409 por Connect incompleto; transición real a ACTIVE pendiente |
| Seguridad | PASS: autoaprobación, autoactivación, buyer/rechazado/cross-seller, API POS y escrituras genéricas directas denegadas; cero user_brand_access POS |
| Connect TEST | MANUAL CERTIFICATION REQUIRED; cuenta Express TEST y enlace reales creados por APIs, estado RESTRICTED |
| Pedido | API seller 200, lista vacía. Recibir/preparar pedido no certificado, depende de completar Connect y ACTIVE |
| Ledger/settlement | 0 ledger entries y 0 settlements del seller fixture. No cobros ni transfers ejecutados; liquidación TEST sin certificar |
| Desktop/mobile visual | Sin recorrido visual; no se declara PASS |

Auth HTTP no certifica por sí mismo el formulario visual ni el comportamiento completo de cookies en navegador. La imagen de prueba es un PNG de 1 píxel real; no certifica la presentación visual del uploader o el catálogo. Algunas respuestas de error de páginas llegan con HTTP 200 por streaming de Next: se verificó también el error de acceso dentro del contenido.

## Connect: límite real

Stripe TEST devolvió `details_submitted=false`, `charges_enabled=false`, `payouts_enabled=false`, `transfers_enabled=false`; requiere `business_type`, `external_account`, `tos_acceptance.date`, `tos_acceptance.ip`.
No se aceptaron términos en nombre del usuario ni se simuló COMPLETE en la base. No se usó Stripe live. La única interacción externa fue la creación de la cuenta y enlace de onboarding TEST autorizados; datos, migraciones y fixtures de aplicación permanecen locales.

## Bugs demostrados y corregidos

- El join único `comu_storefronts` llega como objeto; SellerDashboard esperaba array. Se normalizan ambas formas sin cambiar contrato API ni diseño.
- Los tres enlaces de pedidos desde el seller C1 apuntaban a `/comu/seller/{brandSlug}/orders`, que produce `NEXT_HTTP_ERROR_FALLBACK;404` dentro de HTTP 200. Ahora apuntan a la superficie existente `/comu/seller/orders`. Se conserva el destino previo para dashboards de Brand OS.

## Pruebas

```text
node scripts/certify-comu-sellers-http-local.mjs --inspect
node scripts/certify-comu-sellers-http-local.mjs --apply
node scripts/certify-comu-sellers-http-local.mjs --run
node scripts/certify-comu-sellers-http-local.mjs --verify
node scripts/test-comu-seller-approval-local.mjs
node scripts/test-comu-seller-catalog-local.mjs
node scripts/test-comu-seller-approval-postgres-local.mjs
node scripts/test-comu-seller-catalog-postgres-local.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node node_modules/eslint/bin/eslint.js src/app/comu/seller/seller-dashboard.tsx
git diff --check
```

Node C1/C2 y PostgreSQL aislado PASS. PostgreSQL adicional cubre concurrencia, reservas, última unidad, retry, legacy y activación con condición Connect de fixture: **no sustituye certificación Stripe TEST integrada**.
TypeScript sin emisión, ESLint dirigido a SellerDashboard, sintaxis del script y `git diff --check`: PASS. Git únicamente informó conversiones LF/CRLF del working tree existente; ningún error de whitespace.
`--verify` es la comprobación reutilizable sin crear otra cuenta Stripe. `--run` está preparado para el estado PREPARING actual; no ejecutarlo como continuación después de activar, porque afirma explícitamente el bloqueo por Connect. No contiene un recorrido pagado posterior a ACTIVE.

## Fixtures y revisión manual (máximo 10 pasos)

Tag: `comu-local-cert-1791047112826`. Cinco usuarios (`a`, `b`, `buyer`, `rejected`, `admin`) identificados por email y metadata LOCAL TEST. Seller A tiene 10 productos; B tiene su producto e imagen de prueba.
Credenciales generadas y manifiesto de IDs: `.env.comu-certification-fixture.json`, ignorado por Git. Consultar `users.a.email/password` y `users.admin.email/password`. No copiar este archivo a commits ni documentación pública.

1. En este equipo, abrir `http://localhost:3000/comu/login` y entrar con `users.a`.
2. Abrir `http://localhost:3000/comu/seller/comu-5209da4630154bd092add62e1fd20a07/products`; confirmar PREPARING y catálogo 10/10.
3. Editar un producto; revisar variante, precio, stock, imagen, guardar y recargar.
4. Abrir la ruta hermana `/store`, guardar un campo y recargar para verificar persistencia visual.
5. Abrir la ruta hermana `/wholesale` y comprobar la regla del primer producto.
6. Abrir la ruta hermana `/settings`, iniciar/continuar Connect; completar exclusivamente onboarding TEST y volver a COMU. El enlace TEST previo queda en el manifiesto privado y puede expirar; regenerarlo desde la UI.
7. Actualizar estado de pagos. Si continúa restringido, revisar requisitos TEST; no alterar flags en SQL.
8. Entrar con `users.admin` en `http://localhost:3000/brand/admin/comu`; cuando el chequeo sea eligible, activar explícitamente el seller A. Verificar ACTIVE con `users.a`.
9. Abrir `http://localhost:3000/comu/seller/orders`; tras ejecutar un pedido TEST válido, verificar recepción/preparación y estados. Este pedido aún no fue creado ni certificado.
10. Repetir los controles visuales con viewport mobile en el mismo navegador. Un teléfono físico no resuelve el localhost de este equipo: acceso LAN/HTTPS y callbacks móviles no fueron configurados ni certificados en este bloque.

## Retención / cleanup

Se conservan fixtures claramente identificados para revisión manual. No se borraron fixtures previos. El manifiesto privado relaciona usuarios, solicitudes, seller/brand, catálogo y assets; las filas de catálogo usan `LOCAL TEST`. La cuenta Stripe TEST también permanece pendiente de onboarding. Cualquier limpieza posterior debe limitarse a esos IDs, eliminar primero objetos propios de Storage y respetar dependencias/FKs; nunca resetear la base ni borrar por un prefijo genérico compartido.

## Bloqueos restantes

1. Completar y certificar onboarding Connect TEST real.
2. Certificar elegibilidad total y activación administrativa HTTP real a ACTIVE.
3. Crear pedido TEST válido; certificar recepción, preparación y ledger/settlement TEST.
4. Revisión visual desktop/mobile pendiente, independiente de la certificación funcional.

No commit, push, deploy, migración remota, cambios POS/Mobile ni otro bloque iniciado. El estado completo del working tree está en `docs/comu-seller-certification-git-status.txt`.
