# Cometa Product Platform V1

## Autoridades reutilizadas

`pos_plans` continúa como catálogo comercial; el plan base real es `pos_start` (Cometa POS). `pos_plan_limits` conserva límites y flags legacy. `pos_subscriptions` sigue siendo la única asignación vigente por marca y conserva pricing, trial y periodos. `pos_subscription_events` es el único ledger comercial. Ninguna RPC existente se redefine.

`pos_capability_catalog` y `pos_business_capabilities` siguen describiendo adaptación operativa por giro. Una capability responde “¿aplica a este negocio?”; un entitlement responde “¿esta marca tiene derecho comercial a usarlo?”.

## Objetos V1A

- `pos_entitlements`: catálogo de 23 derechos comerciales versionables.
- `pos_plan_entitlements`: relación mediante el `code` canónico de `pos_plans`.
- `pos_brand_entitlement_overrides`: excepciones comerciales temporales positivas o negativas por marca.
- `pos_get_brand_entitlements`: documento efectivo, plan, status y overrides.
- `pos_brand_has_entitlement`: consulta booleana que consume el documento anterior.
- `pos_set_brand_entitlement_override`: escritura server-side de una excepción.
- `pos_set_subscription_plan`: cambio exclusivo de plan con lock y evento.

## Packaging

`pos_start` recibe los ocho `pos.*` y `intelligence.signals`. No recibe `intelligence.pulsar` ni opportunities. PULSAR puede habilitarse a pilotos mediante override.

Growth y Partner no se insertan todavía. Cuando existan comercialmente, Growth heredará POS y añadirá PULSAR, opportunities y `growth.*`; Partner añadirá `agency.*`.

## Resolución y status

Sólo `trial`, `active` y `grace_period` entregan entitlements. `past_due`, `suspended` y `cancelled` devuelven lista vacía. Esto conserva el comportamiento actual de locations, registers, products e inventory receiving, que excluyen `past_due`.

Se consideran overrides cuyo inicio ya ocurrió y cuyo fin no ocurrió. Para cada entitlement gana el vigente más reciente (`starts_at`, después `created_at`, después `id`). Se permiten varias filas históricas porque el orden define precedencia sin sobrescribir auditoría. Un override `true` agrega; uno `false` quita. Entitlements inactivos nunca se entregan.

La resolución cruza simultáneamente `brand_slug` y el `brand_id` de la suscripción resuelta. Las funciones no están expuestas a `anon` ni `authenticated`; el servidor debe resolver y autorizar la marca antes de invocarlas con `service_role`.

## Cambio de plan e historial

`pos_set_subscription_plan` valida un plan activo, bloquea la suscripción `FOR UPDATE`, es idempotente si el plan no cambia y actualiza únicamente `plan_code`. No modifica pricing, promociones, status, trial ni periodos. Un cambio real inserta `plan_changed` en `pos_subscription_events`, preservando status/precio y guardando `previousPlanCode`/`newPlanCode` en metadata.

`pos_set_subscription_offer` permanece intacta y continúa produciendo `offer_updated`.

## Compatibilidad y seguridad

Bootstrap añade `effectiveEntitlements` sin eliminar propiedades. Los límites y flags existentes permanecen. No existe enforcement masivo en V1A.

Las RPC nuevas son `SECURITY DEFINER`, fijan `search_path=public` y sólo `service_role` puede ejecutarlas. Catálogos son SELECT para authenticated. Overrides sólo pueden leerse mediante acceso de marca y no tienen writes de navegador.

El postflight es de sólo lectura. La suite crea fixtures transitorios y puede actualizar filas dentro de su propia transacción, pero termina siempre con `ROLLBACK`; no debe utilizarse fuera de una sesión capaz de completar ese rollback. Los fingerprints de las RPC canónicas se reportan para cotejo y sus invariantes conocidas se validan sin redefinirlas.

## Trial y roadmap

El trial actual dura 14 días y `pos_initialize_brand_setup` establece `trial_ends_at = now() + interval '14 days'`. V1A no cambia este contrato. V1B decidirá reglas de expiración, grace y posible transición a 15 días. Billing, checkout, pagos y automatización quedan fuera.
