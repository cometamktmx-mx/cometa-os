# COMETA POS CORE-1 — Central Commercial Access Enforcement

Fecha: 2026-08-14.

## Modelo de autorización

```text
AUTH / TENANT
      ↓
SUBSCRIPTION LIFECYCLE
      ↓
ENTITLEMENT
      ↓
OPERATION
```

`requirePosContext` autentica al usuario, resuelve la marca canónica y verifica acceso tenant. `requirePosOperationalAccess` conserva ese paso y consulta, en paralelo y para el slug ya resuelto, las autoridades server-side existentes:

- `pos_get_subscription_lifecycle`: decide `accessAllowed` y `effectiveStatus`.
- `pos_get_brand_entitlements`: devuelve los derechos efectivos del plan y overrides.

TypeScript valida ambos contratos, pero no recalcula lifecycle ni entitlements. No se usan capabilities como autorización comercial.

## Política de estados

| Estado efectivo | Acceso operacional |
|---|---|
| `trial` vigente | Sí |
| `active` | Sí |
| `grace_period` | Sí |
| `trial_expired` | No |
| `past_due` | No |
| `suspended` | No |
| `cancelled` | No |

El guard confía exclusivamente en `lifecycle.accessAllowed`, por lo que la política permanece centralizada en V1B. No existe bypass por rol: un administrador también queda bloqueado en las rutas operacionales.

## Rutas de acceso comercial mínimo

| Ruta | Métodos | Razón |
|---|---|---|
| `/api/pos/bootstrap` | GET | Mantiene identidad, lifecycle y contrato de arranque compatible. |
| `/api/pos/subscription` | GET, POST | Permite consultar estado, reconciliar y ejecutar acciones administrativas de recuperación existentes. |
| `/api/pos/profile` | GET | Proporciona identidad operativa mínima para shell/onboarding. |

Estas rutas siguen usando `requirePosContext`: son accesibles sólo después de autenticación y autorización tenant. Exempt no significa pública. `profile` POST no está exento.

## Rutas operacionales

| Ruta | Entitlement |
|---|---|
| branding | `pos.access` |
| locations | `pos.access` |
| profile POST | `pos.access` |
| sales | `pos.sales` |
| cash-sessions, registers | `pos.cash` |
| categories, product-config, product-images, product-scan, products | `pos.products` |
| inventory, inventory-receiving | `pos.inventory` |
| customers | `pos.customers` |
| loyalty | `pos.loyalty` |
| reports y reports/summary | `pos.reports` |
| reports `view=signals`, generación y reports/signals | `intelligence.signals` |
| reports/pulsar | `intelligence.pulsar` |

El mapa contiene 19 archivos de ruta operacionales, los 19 protegidos y cero rutas sin clasificar. Tanto GET como mutations pasan por el mismo guard.

## Contrato de errores

Los errores preservan el contrato POS existente (`ok`, `error`, `code`, `details`) y responden HTTP 403.

### Lifecycle denegado

```json
{
  "ok": false,
  "error": "La suscripción de Cometa POS no permite acceso operacional.",
  "code": "POS_SUBSCRIPTION_ACCESS_DENIED",
  "details": {
    "effectiveStatus": "trial_expired",
    "requiresActivation": true
  }
}
```

### Entitlement faltante

```json
{
  "ok": false,
  "error": "El plan de Cometa POS no incluye esta función.",
  "code": "POS_ENTITLEMENT_REQUIRED",
  "details": {
    "requiredEntitlement": "pos.inventory"
  }
}
```

No se devuelve información de otra marca. La resolución tenant ocurre antes de consultar lifecycle o entitlements.

## Experiencia bloqueada

`PosShell` no monta los módulos operacionales cuando `accessAllowed=false`. Presenta motivo, estado efectivo, conservación de datos, enlace a suscripción/activación y cambio de marca. La página `/pos/subscription` permanece renderizable.

El estado asociado a marca (`lifecycle`, entitlements, capabilities y perfil) sólo se expone si `loadedBrandSlug` coincide con el slug actual. Al cambiar de marca o fallar una carga se vacía inmediatamente, evitando reutilizar temporalmente datos del tenant anterior.

El locked state es UX; la frontera de seguridad sigue siendo el guard de las APIs.

## Datos y service role

El guard no inserta, actualiza ni elimina datos. Suspensión, cancelación o expiración sólo niegan acceso. Las rutas continúan usando service role únicamente después de autenticar al usuario y autorizar la marca mediante `requirePosContext`.

## Auditoría ejecutable

Ejecutar:

```powershell
node scripts/audit-pos-commercial-access.mjs
```

La auditoría valida el guard, las RPCs canónicas, errores 403, ausencia de bypass admin, no mutación, las rutas exentas, los 19 archivos protegidos, modos de reports/signals/PULSAR, locked state, limpieza por cambio de marca y `unresolved=0`.

## Compatibilidad futura con billing

Un proveedor de pagos futuro debe cambiar el estado mediante las autoridades comerciales existentes. Las APIs operacionales no necesitan conocer Stripe, Mercado Pago u otro proveedor: sólo consumen lifecycle y entitlements resueltos. La superficie de suscripción permanece separada para permitir recuperación de acceso.
