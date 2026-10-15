# COMETA POS Plans & Entitlements V1

## Autoridades

- `pos_plans`: catálogo comercial server-side.
- `pos_plan_limits`: límites configurables por plan.
- `pos_subscriptions.plan_code`: oferta asignada a una brand.
- lifecycle: determina si la suscripción puede operar.
- entitlements: determina qué superficies comerciales puede usar.
- business profile: determina cómo opera fashion o retail.

COMETA OS no es un plan POS. Es una oferta managed independiente.

## Catálogo

| Plan | Precio mensual MXN | Sucursales | Cajas | Usuarios |
|---|---:|---:|---:|---:|
| Cometa POS Start | 399.00 | 1 | 1 | 2 |
| Cometa POS Pro | 499.00 | 1 | 2 | 5 |
| Cometa POS Multi | 899.00 | 4 | 8 | 10 |

`list_price` utiliza pesos MXN en `numeric`; no utiliza centavos. Los tres planes admiten trial de 15 días. Las altas self-service sin selección explícita empiezan en Pro.

El owner cuenta en `max_users`: Start permite owner + 1 miembro, Pro owner + 4 y Multi owner + 9.

## Entitlements

- Start: acceso, ventas, caja, productos/variantes, inventario, clientes y reportes.
- Pro: todo Start, fidelización, Signals y PULSAR.
- Multi: todo Pro y `platform.multi_location`.

No se crean claves para variants ni para basic/full reports. No se otorgan automáticamente `intelligence.opportunities`, `platform.advanced_users`, reportes consolidados o intelligence multi-location.

## Compatibilidad

`pos_start` permanece como plan legacy. La migración cambia sólo subscriptions `pos_start` en estado `trial` a Pro y registra `plan_changed`. No modifica `started_at`, `trial_ends_at`, periodos ni snapshots históricos de precio.

El initializer interno sigue siendo la autoridad del trial de 15 días. El wrapper transaccional asigna Pro y el precio de catálogo a una suscripción nueva antes de emitir `trial_started`. Su advisory lock e idempotencia permanecen.

## Límites y usage

Locations y registers continúan contando todos los registros configurados para impedir bypass por desactivar/reactivar. Sus endpoints conservan `POS_LOCATION_LIMIT_REACHED` y `POS_REGISTER_LIMIT_REACHED`.

El bootstrap expone `commercial.plan`, `commercial.limits` y `commercial.usage`. Usuarios son memberships activas de `user_brand_access`, tenant-scoped e incluyendo owner. `max_users` todavía no se fuerza porque invitations/RBAC no forma parte de V1.

`includes_digital_card` permanece `false` para Start/Pro/Multi. La columna legacy se conserva, pero Wallet/digital card no se promociona ni activa en esta fase.

## Pendiente

- RBAC V1: invitaciones, roles y enforcement de `max_users`.
- Gating granular de reportes cuando exista separación real basic/full.
- Experiencia consolidada multi-location.
- Stripe Billing V1 y selección segura de plan.
