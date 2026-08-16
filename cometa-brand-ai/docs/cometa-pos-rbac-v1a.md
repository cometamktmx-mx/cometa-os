# COMETA POS RBAC V1A Foundation

## Autoridades

`user_brand_access` sigue siendo la única membership efectiva. `access_role` es por `(user_id, brand_slug)` y sólo `status=active` concede permisos. `user_profiles.role` continúa representando administración global de plataforma y no define RBAC POS.

Roles canónicos nuevos: `owner`, `admin`, `manager`, `cashier`, `inventory`. `editor` y `viewer` se conservan como legacy: editor se resuelve como Manager únicamente dentro de POS; viewer recibe home y lectura mínima de productos/inventario. Ningún valor legacy es reescrito.

## Permisos

La matriz vive en `src/lib/pos/rbac.ts`. Los entitlements del plan y los permisos del usuario son capas distintas:

```text
auth → membership activa → lifecycle → entitlement → role permission → action
```

V1A expone `requirePosPermission`, pero no lo aplica a las APIs operativas. V1C hará el enforcement por método/acción después de probar el flujo Cashier completo.

## Owner invariant

Un trigger transaccional protege cualquier owner activo que sea degradado, desactivado o eliminado. Usa advisory lock por brand, bloquea memberships y exige otro owner activo. Una brand histórica sin memberships no recibe owners artificiales. El error estable es `POS_LAST_OWNER_REQUIRED`.

Owner puede asignar roles canónicos, incluido promover otro owner. Admin sólo puede administrar manager/cashier/inventory; no puede modificarse a sí mismo, administrar owners/admins ni promover owner/admin. Revocar es soft-disable (`inactive`), nunca borrado de `auth.users`.

## Invitation foundation

`pos_user_invitations` es workflow pendiente, no membership. Roles iniciales: admin/manager/cashier/inventory. Estados: pending/accepted/revoked/expired. Email se guarda normalizado y existe una única pending por brand/email.

La reserva y acceptance usan advisory lock por brand. Usage efectivo es memberships activas más pendientes no vencidas; owner cuenta. Acceptance vuelve a comprobar invitation, brand, status, expiración, email real de `auth.users`, membership existente y `max_users`. Así un downgrade o una carrera no puede sobreasignar asientos. Una membership inactive puede reactivarse; una activa produce conflicto.

RLS está habilitado. Browser no tiene acceso directo a la tabla ni EXECUTE sobre RPCs. Las funciones mutativas son `SECURITY DEFINER`, `search_path=public` y sólo `service_role` puede ejecutarlas.

## Bootstrap

El payload añade de forma compatible:

```json
{"membership":{"role":"editor","effectiveRole":"manager","permissions":[],"legacy":true}}
```

Un platform admin sin membership recibe `membership: null`; no se sintetiza Owner. V1A no cambia su acceso actual. V1C deberá decidir si los operadores internos requieren membership explícita antes de activar enforcement masivo.

## Pendiente V1B

- Team UI y API autenticada.
- Delivery para usuarios nuevos/existentes.
- `/auth/confirm` con `type=invite`.
- Acceptance UI y redirección directa a la brand.
- Audit trail de cambios de rol/revocación.

## Pendiente V1C

- Navegación y home por rol.
- Enforcement server-side por método/acción.
- Subscription owner-only.
- Pruebas directas de ataque Cashier/Inventory.
- Decisión operativa para administradores globales de Cometa.
