# Cometa POS Commercial Grants V1

## Propósito

Commercial Grants permite que Cometa cubra temporalmente el costo de Cometa POS para una marca concreta. No es un cupón público, no tiene aplicación self-service y no modifica la verdad de billing.

Ejemplo administrativo futuro, fuera de esta migration:

```text
COMETA-AGENCY-6M
plan: pro
type: complimentary
duration: 6 calendar months
```

La foundation no inserta grants para ninguna brand.

## Cuatro capas separadas

```text
pos_subscriptions
  = verdad de billing y contrato persistido

pos_get_subscription_lifecycle
  = lifecycle nativo de trial/suscripción

pos_commercial_grants
  = beneficio temporal concedido por Cometa

pos_get_effective_commercial_access
  = acceso y plan efectivos para operar POS
```

Un grant nunca actualiza `pos_subscriptions.status`, `trial_ends_at`, periodos, precios ni estado de cobro. Un trial de 15 días continúa expirando normalmente; si existe un grant efectivo, la capa efectiva mantiene el acceso hasta `ends_at`.

## Authority y seguridad

`public.pos_commercial_grants` tiene una fila por grant económico:

- `brand_slug` referencia `public.brands(slug)`;
- `plan_code` referencia `public.pos_plans(code)`;
- el único `grant_type` V1 es `complimentary`;
- los únicos estados físicos son `active` y `revoked`;
- una expiración es derivada, no persistida;
- la revocación es soft (`status`, `revoked_at`, `revoked_by`);
- los campos económicos son inmutables después de crear el grant.

No hay políticas browser. RLS está habilitado, `PUBLIC`, `anon` y `authenticated` no tienen privilegios y `service_role` obtiene solamente `SELECT`, `INSERT` y `UPDATE`. No hay `DELETE` para la operación normal.

Los solapamientos activos de una misma brand se rechazan DB-side. La migration usa un advisory transaction lock por `brand_slug` y una verificación de rangos; no depende de `btree_gist` ni incorpora extensiones nuevas.

## Grant efectivo

Un grant es efectivo cuando:

```sql
status = 'active'
and starts_at <= now()
and ends_at > now()
```

Además, su plan debe continuar `active` en `pos_plans`. Si el plan concedido se desactiva posteriormente, el registro histórico se conserva pero no concede acceso.

`pos_get_effective_commercial_access(brand_slug)` devuelve, para uso server-side:

- lifecycle nativo separado;
- `effective.accessAllowed`;
- `effective.accessSource`: `trial`, `subscription`, `commercial_grant` o `none`;
- plan y fuente de plan efectivos;
- resumen seguro del grant efectivo, sin `reason` ni actor administrativo.

La ausencia de una suscripción no convierte una brand en pagada. El resolver SQL puede reconocer un grant válido sin suscripción como acceso comercial efectivo; la inicialización operativa POS continúa siendo el flujo existente de Bootstrap y no es provocada por el resolver pasivo.

## Planes, entitlements y límites

El grant no copia límites ni entitlements. Resuelve el plan desde el catálogo existente.

Un grant sólo eleva capacidades. La comparación usa límites de `pos_plan_limits` y el conjunto de entitlements activos de `pos_plan_entitlements`; no codifica una jerarquía textual `start < pro < multi`.

Ejemplos:

| Plan persistido | Grant | Plan efectivo |
| --- | --- | --- |
| Start | Pro | Pro |
| Pro | Pro | Pro |
| Multi | Pro | Multi |
| Pro | Start | Pro |

`pos_get_brand_entitlements` mantiene el motor actual de plan + overrides, pero toma su plan desde la resolución efectiva. Locations, registers, Team y las RPCs de invitación usan los límites del plan efectivo. Por eso Start + Pro grant obtiene los cinco asientos de Pro, incluidos pending invitations.

## CORE-1 y disponibilidad pasiva

`requirePosOperationalAccess` conserva el lifecycle nativo para diagnóstico, pero bloquea o permite por `effectiveCommercialAccess.effective.accessAllowed` y luego valida el entitlement solicitado.

`getPassivePosProductAvailability` sigue siendo lectura pura: no llama Bootstrap ni `pos_initialize_brand_setup`. Un grant activo sobre una suscripción cuyo lifecycle nativo esté bloqueado puede resolver Cometa POS como activo; errores o derechos ausentes siguen fallando cerrado como `unavailable`.

Bootstrap devuelve tres capas distintas:

- `subscription`: plan y datos de billing persistidos;
- `lifecycle`: lifecycle nativo;
- `effectiveCommercialAccess`: authority efectiva;
- `commercial`: plan, límites y usage efectivos para la operación.

PosShell usa la capa efectiva para no bloquear la operación durante un grant válido; no presenta el banner de activación nativo como si el beneficio no existiera.

## Expiración y revoke

No hay cron de enforcement. Al llegar a `ends_at`, o al revocar, el resolver deja de considerar el grant y el lifecycle nativo vuelve a decidir el acceso inmediatamente.

Para corregir o renovar un beneficio se debe revocar el grant y crear uno nuevo. No se reescriben brand, código, plan, ventana ni razón de una fila existente.

## Stripe futuro

Commercial Grant no es un Stripe trial. La estrategia prevista es no crear una Stripe subscription hasta la conversión o cercanía al fin del beneficio. Si posteriormente existe una suscripción Stripe, seguirá siendo billing truth y el resolver coexistirá con el grant hasta su expiración.

## Ejecución SQL

Después de revisar el diff, ejecutar en este orden:

1. `supabase/migrations/20260816_pos_commercial_grants_v1.sql`
2. `supabase/tests/pos_commercial_grants_v1_postflight.sql`
3. `supabase/tests/pos_commercial_grants_v1_suite.sql`

No aplicar un grant administrativo hasta que postflight y suite indiquen `all_checks_passed = true`.

El siguiente bloque, no incluido aquí, puede aplicar manualmente `COMETA-AGENCY-6M` a una brand aprobada y construir la comunicación customer-facing del beneficio.
