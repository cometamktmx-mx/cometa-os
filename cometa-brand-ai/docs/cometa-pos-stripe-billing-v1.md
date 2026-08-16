# Cometa POS — Stripe Billing V1

Stripe es la autoridad de billing. Cometa conserva la autoridad de acceso mediante lifecycle nativo, entitlements y commercial grants.

## Aislamiento Test/Live

Las identidades externas se almacenan en `pos_stripe_billing_links`, separadas por `brand_slug + livemode`. `pos_subscriptions` conserva plan, status, lifecycle y acceso nativos; sus columnas Stripe anteriores quedan legacy durante el cutover.

`sk_test_*` sólo consulta mappings Test (`livemode = false`) y `sk_live_*` sólo consulta mappings Live (`livemode = true`). El webhook rechaza eventos cuyo `event.livemode` no coincide con el runtime. La proyección nativa Live tiene prioridad: un webhook Test no sobrescribe `pos_subscriptions` cuando ya existe una Subscription Live.

## Configuración

Configurar server-side, sin `NEXT_PUBLIC_*`:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_START
STRIPE_PRICE_PRO
STRIPE_PRICE_MULTI
APP_ORIGIN
```

Crear manualmente en Stripe Test Mode los Prices mensuales MXN de Start (399), Pro (499) y Multi (899). El código sólo consume sus IDs por environment.

## Flujo

- Owner inicia Checkout desde `/api/pos/billing/checkout`.
- El Checkout usa `subscription` mode y cobra inmediatamente.
- El webhook `/api/stripe/webhook` valida firma, deduplica eventos y sincroniza `pos_subscriptions`.
- Customer Portal se abre mediante `/api/pos/billing/portal`.
- El redirect de éxito nunca concede acceso por sí solo.

## Estados

`trialing → trial`, `active → active`, `past_due → past_due`, `unpaid/paused → suspended`, `incomplete → past_due`, `incomplete_expired/canceled → cancelled`. Estados desconocidos fallan cerradamente.

`stripe_cancel_at_period_end` permite mostrar cancelación futura sin marcar Cometa como cancelada antes del fin del periodo.

## Grants

Un grant activo bloquea Checkout y continúa independiente de Stripe. El webhook sólo actualiza billing truth; nunca revoca ni modifica grants. El acceso efectivo continúa resolviéndose mediante `pos_get_effective_commercial_access`.

## Portal V1

El Portal puede gestionar métodos de pago, invoices y cancelación al final del periodo. Los cambios de plan custom y prorration no forman parte de V1.

## Producción

Configurar webhook HTTPS con los seis eventos documentados en el smoke test, repetir variables en Vercel Preview/Test y Production/Live, y verificar primero el flujo completo en Test Mode.
