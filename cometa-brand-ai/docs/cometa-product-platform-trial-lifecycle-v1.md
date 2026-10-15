# Cometa Product Platform V1B — Trial y lifecycle

## Autoridades comerciales

`pos_subscriptions` conserva el estado actual y todos los datos comerciales. `pos_subscription_events` continúa como ledger único. V1B no crea tablas de lifecycle, no altera pricing y no integra proveedores de pago.

El inicializador público conserva su firma y envuelve el cuerpo V1A auditado. El cuerpo existente mantiene profile, branding, `pos_start` y sus `ON CONFLICT`; V1B cambia exclusivamente el intervalo de trial de 14 a 15 días. Una suscripción realmente nueva registra `trial_started`. La inicialización repetida no crea otro evento.

## Estado almacenado y estado efectivo

Los estados persistidos siguen siendo `trial`, `active`, `past_due`, `grace_period`, `suspended` y `cancelled`. `trial_expired` no se persiste: es un `effectiveStatus` calculado cuando una fila aún tiene `status = trial` y `trial_ends_at <= now()` —o carece de fecha final—. Así, la falta de un cron nunca extiende acceso gratuito.

`pos_get_subscription_lifecycle` devuelve plan, estado almacenado, estado efectivo, acceso, trial, periodo, cancelación, necesidad de activación y razón. Los días y horas restantes usan `ceil` sobre el tiempo positivo: cualquier fracción cuenta como una unidad y nunca se devuelven negativos. `expiringSoon` se activa cuando quedan como máximo 72 horas.

## Política de acceso

| Estado efectivo | Acceso operacional |
| --- | --- |
| `trial` vigente | Permitido |
| `trial_expired` | Denegado |
| `active` | Permitido |
| `grace_period` | Permitido |
| `past_due` | Denegado, preservando V1A |
| `suspended` | Denegado |
| `cancelled` | Denegado |

La resolución de entitlements consume el mismo helper interno de lifecycle y entrega una lista vacía cuando `accessAllowed` es falso. La superficie mínima de cuenta y activación no depende de un entitlement `platform.account`; usa el contexto de marca autorizado y el lifecycle server-side. No se añade ese entitlement en V1B.

Esta fase centraliza el estado efectivo en bootstrap, subscription API y `PosShell`. No añade comprobaciones divergentes a cada route handler operacional. La aplicación detallada por módulo queda para una fase de enforcement dedicada.

## Transiciones explícitas

| Desde | Hacia |
| --- | --- |
| trial | active, suspended, cancelled |
| active | past_due, suspended, cancelled |
| past_due | grace_period, active, suspended, cancelled |
| grace_period | active, suspended, cancelled |
| suspended | active, cancelled |
| cancelled | ninguna en V1B |

Una transición al mismo estado es idempotente. `active` inicializa periodo sólo si falta y limpia `cancelled_at`. Entrar a grace asigna tres días únicamente cuando `grace_ends_at` es nulo. Cancelar fija `cancelled_at` sólo si falta. No se permite volver a trial ni reactivar directamente una cancelación.

## Eventos

- `trial_started`: una vez al crear una suscripción mediante inicialización.
- `trial_expired`: una vez por suscripción, materializado por reconcile.
- `activated`: trial a active.
- `reactivated`: past_due, grace o suspended a active.
- `grace_started`, `suspended`, `cancelled`: cuando ocurre la transición correspondiente.
- `trial_expiring`: reservado; V1B calcula `expiringSoon` sin crear este evento.
- `offer_updated` y `plan_changed`: preservados sin redefinir sus RPCs.

La transición `active → past_due` actualiza la fuente de verdad sin inventar un event type adicional fuera del catálogo V1B confirmado.

## Reconcile y preservación

`pos_reconcile_subscription_lifecycle` bloquea la suscripción, calcula lifecycle y registra `trial_expired` si falta. No cambia `status = trial`. La lectura bloquea acceso aun si reconcile nunca se ejecuta.

Expirar, suspender o cancelar no elimina ventas, clientes, productos, inventario, loyalty, reportes, señales ni snapshots. Una reactivación recupera acceso a los mismos datos.

## Compatibilidad y pagos futuros

`pos_set_subscription_offer` permanece como vía administrativa legacy y sigue registrando `offer_updated`; la UI/runtime nueva debe preferir `pos_transition_subscription_status`. `pos_set_subscription_plan` permanece intacta. No existe reset público de trial, checkout, wallet, Stripe ni Mercado Pago. La activación V1B es administrativa y no implica cobro.
