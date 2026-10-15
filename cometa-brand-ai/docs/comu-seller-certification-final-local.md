# COMU — Seller certification final (LOCAL), 2026-10-03

FUNCTIONALLY READY FOR SELLERS: **YES**, bajo el criterio operativo acordado.
VISUALLY CERTIFIED: **NO**; esta continuación certificó contratos HTTP/SQL, sin recorrido visual de navegador.

Destino: Next `http://localhost:3000`, Supabase `http://127.0.0.1:54321`, PostgreSQL local. Se reutilizaron Seller A, Buyer, Seller B y Admin del manifiesto privado `.env.comu-certification-fixture.json`. No se creó otra cuenta Connect ni otro usuario. Ninguna migración ni deploy.

## Connect TEST y activación

Cuenta Connect existente consultada directamente en Stripe TEST:

- `details_submitted=true`, `charges_enabled=true`, `payouts_enabled=true`.
- `capabilities.transfers=active`.
- `currently_due=[individual.verification.document]`.
- `past_due=[]`, `pending_verification=[]`, `disabled_reason=null`.
- Clasificación global **PARTIAL** por documento pendiente; capacidad operativa TEST suficiente **PASS**. No se afirma verificación documental completa.

`GET /api/comu/seller/connect/status` refrescó y persistió `COMPLETE`, con los mismos flags y requisito pendiente. Se verificó igualdad entre respuesta y fila persistida. No se certificó entrega automática de webhook Connect: se usó el refresh existente.

`comu_seller_activation_check_v1`: `ok=true`, `reason=null`, `minimumListings=10`, `publishedListings=10`. C1 válido, storefront configurado y `financial_suspended=false`. Se comprobó PREPARING antes de activar por PATCH real autenticado como Admin COMETA. Seller y storefront quedaron ACTIVE. El intento de autoactivación devolvió 403. Sigue habiendo cero filas `user_brand_access` para Seller A.

## Pedido y dinero reales TEST

- Master order: `fb3d161d-527e-4275-8bf0-657444f078a9`.
- Suborder A: `ad62e527-68d3-42d5-8c3a-41c197d8aad7`.
- Producto: MXN 125; envío del provider LOCAL_TEST: MXN 180; pago total: MXN 305.
- Carrito y reserva por APIs reales. La reserva antigua de fixture sin snapshot de precio fue rechazada correctamente y se canceló únicamente esa reserva.
- PaymentIntent real Stripe TEST confirmado con `pm_card_visa`: `succeeded`, cargo pagado. Sin Live.
- Evento real `payment_intent.succeeded` obtenido de Stripe y retransmitido al webhook local con firma de prueba. Procesamiento PASS y duplicado sin nuevos efectos PASS. **No equivale a entrega automática Stripe → localhost**.
- API usada por Seller Center devuelve el pedido completo, suborder y artículos; aislamiento de lectura/escritura contra B PASS.
- Transiciones autenticadas: PAID → PREPARING → READY_FOR_HUB. Eventos guardan actor Seller A. Salto a DELIVERED denegado 409.
- Stock físico: 21 → 20. `reserved_quantity=0`. Reserva COMMITTED. Reintento de webhook no consume otra unidad.
- Ledger: `SALE_HELD=12500` centavos, allocation HELD. No holds adicionales de disputa; entrega y vencimiento de garantía aún nulos.

| Área | Estado |
|---|---|
| PAYMENT TEST | PASS: PaymentIntent/cargo y confirmación local real |
| Inventario | PASS: consumo único y reserva liberada |
| LEDGER | PASS: asiento inicial SALE_HELD; neto financiero final pendiente |
| HOLD | PASS: retención inicial; garantía posterior a entrega no ejecutada |
| SETTLEMENT | NOT EXECUTED: ninguna liquidación creada |
| PAYOUT | NOT EXECUTED: ningún transfer/payout solicitado |

## Bug demostrado corregido

`transitionSuborder` validaba al usuario HTTP pero llamaba la RPC mediante service-role. La función SQL valida `auth.uid()` y rechazaba al seller autorizado. Cambio acotado: usar cliente Supabase autenticado para esa RPC; conservar comprobación de identidad y validaciones de pertenencia/estados. No se cambió SQL, permisos ni contratos.

## Pendientes BUYER / finanzas

1. **Conciliación incompleta demostrada**: Stripe ya tiene balance transaction y comisión real TEST de 1799 centavos; COMU conserva `stripe_processing_fee_cents=null`, `stripe_fee_finalized_at=null`, y cero filas de `comu_payment_economics`. Repetir el webhook devuelve duplicate. El handler permite FINANCE_PENDING y luego marca processed; debe certificarse/corregirse su recuperación antes de compradores/liquidación. No se reparó dentro de este bloque.
2. Cancelación de este pedido READY_FOR_HUB devuelve 409 correctamente sin tocar dinero/stock. Refund pagado y restock coherente no certificados aquí. La inspección de `cancelBuyerOrder` muestra que cancelar/restock y refund financiero son caminos distintos; no se afirma coherencia integral sin prueba dedicada.
3. Entrega automática de webhooks TEST, shipping Production y checkout Buyer completo permanecen fuera de esta certificación Seller.
4. Connect mantiene el documento pendiente señalado arriba.

## Regresiones

PASS:

- `test-comu-seller-approval-local.mjs` (C1).
- `test-comu-seller-catalog-local.mjs` (C2).
- `test-comu-account-capabilities-http-local.mjs`: Auth local real, ambos contextos, selector multi-store temporal restaurado, aislamiento y logout/login.
- `test-comu-connect-settings-local.mjs` y `test-comu-connect-webhook-mode-local.mjs`: regresión de contratos con mocks; la evidencia Connect real está descrita arriba.
- `test-comu-seller-orders-local.mjs`: contratos de UI; no certificado visual.
- `test-comu-fulfillment-local.mjs`: contrato PostgreSQL local.
- `certify-comu-seller-final-local.mjs --order`: HTTP real, Stripe TEST existente, webhook y pedido; modo --inspect consulta sin crear pago. --activate solo acepta PREPARING.
- TypeScript sin emisión, lint dirigido y `git diff --check`.

Archivos de este bloque: este informe, `scripts/certify-comu-seller-final-local.mjs`, `src/lib/comu/fulfillment.ts`. El manifiesto privado ignorado se actualizó con IDs/evidencia para reutilización. No se modificaron POS, Mobile, proxy ni otros cambios ajenos. Sin commit/push/deploy.

## git status --short

```text
 M scripts/test-comu-buyer-visual-local.mjs
 M scripts/test-comu-stripe-checkout-e2e-testmode.mjs
 M scripts/test-comu-stripe-dispute-testmode.mjs
 M scripts/test-pos-food-access-server-v1.mjs
 M scripts/test-pos-food-configurator-v1.mjs
 M scripts/test-pos-food-modifiers-v1.mjs
 M scripts/test-pos-food-operations-v1.mjs
 M scripts/test-pos-food-pilot-hardening-v1.mjs
 M scripts/test-pos-mobile-m1.mjs
 M scripts/test-pos-multirole-cash-v1.mjs
 M src/app/api/comu/buyer/experience/route.ts
 M src/app/api/pos/devices/route.ts
 M src/app/brand/[brandSlug]/components/pos-food-modifiers.tsx
 M src/app/brand/[brandSlug]/components/pos-food-operations.tsx
 M src/app/brand/[brandSlug]/components/pos-food-receipt.tsx
 M src/app/comu/account/buyer/buyer-account.tsx
 M src/app/comu/account/buyer/page.tsx
 M src/app/comu/account/page.tsx
 M src/app/comu/cart/page.tsx
 M src/app/comu/components/commerce.tsx
 M src/app/comu/layout.tsx
 M src/app/comu/page.tsx
 M src/app/comu/products/[slug]/add-to-cart.tsx
 M src/app/comu/seller/finance/page.tsx
 M src/app/comu/seller/seller-dashboard.tsx
 M src/lib/comu/buyer-experience.ts
 M src/lib/comu/buyers.ts
 M src/lib/comu/fulfillment.ts
 M src/lib/comu/public-routes.ts
 M src/lib/pos/device-server.ts
 M src/lib/pos/server.ts
 M src/lib/pos/staff-server.ts
 M src/proxy.ts
 M tsconfig.json
?? apps/
?? config/
?? docs/cometa-pos-mobile-m1-5-certification.md
?? docs/cometa-pos-mobile-m2-5.md
?? docs/cometa-pos-mobile-m2-6-1.md
?? docs/cometa-pos-mobile-m2-6.md
?? docs/cometa-pos-mobile-m2-7b.md
?? docs/cometa-pos-mobile-m2-scope.json
?? docs/cometa-pos-mobile-m2.md
?? docs/comu-buyer-auth-v1.md
?? docs/comu-seller-certification-final-local.md
?? docs/comu-seller-certification-git-status.txt
?? docs/comu-seller-certification-local.md
?? public/comu/
?? scripts/certify-comu-seller-final-local.mjs
?? scripts/certify-comu-sellers-http-local.mjs
?? scripts/pos-beta-download-preview.mjs
?? scripts/prepare-pos-beta-schema.mjs
?? scripts/test-comu-account-capabilities-http-local.mjs
?? scripts/test-comu-auth-local.mjs
?? scripts/test-comu-finance-lifecycle-local.mjs
?? scripts/test-pos-mobile-m2-http-local.mjs
?? src/app/android/
?? src/app/api/comu/admin/finance/
?? src/app/api/pos/mobile/
?? src/app/brand/admin/comu/finance/
?? src/app/comu/account/buyer/account-icon.tsx
?? src/app/comu/account/buyer/buyer-account.css
?? src/app/comu/auth/
?? src/app/comu/components/auth-boundary.tsx
?? src/app/comu/components/auth-editorial.tsx
?? src/app/comu/components/auth-entry.tsx
?? src/app/comu/components/auth-form.tsx
?? src/app/comu/components/home-image.tsx
?? src/app/comu/forgot-password/
?? src/app/comu/home.css
?? src/app/comu/login/
?? src/app/comu/register/
?? src/app/comu/reset-password/
?? src/app/comu/seller/finance/connect-card.tsx
?? src/app/dev/
?? src/app/mobile/
?? src/components/pos-mobile-download.tsx
?? src/lib/comu/account-access.ts
?? src/lib/comu/auth-navigation.ts
?? src/lib/pos/beta-policy.ts
?? src/lib/pos/beta-release.ts
?? src/lib/pos/client-transport.tsx
?? src/lib/pos/transport-server.ts
?? supabase/.branches/
?? ../cometa-hotfix-recovery/
```
