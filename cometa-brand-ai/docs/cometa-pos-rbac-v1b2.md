# COMETA POS — RBAC V1B.2

## Alcance

V1B.2 entrega la superficie de Equipo de Cometa POS. No crea una segunda autoridad de membresías ni cambia las APIs operativas del POS.

- Membresías efectivas: `public.user_brand_access`.
- Invitaciones pendientes: `public.pos_user_invitations`.
- Cambios sensibles: RPCs transaccionales de RBAC V1A, invocadas exclusivamente desde rutas server-side.
- Invitación y aceptación: delivery y aceptación explícita de RBAC V1B.1.

## Acceso

`GET /api/pos/team` y todas las mutaciones de Equipo siguen esta secuencia:

`auth → brand context → CORE-1 / pos.access → membership activa → pos.team.manage → RPC V1A`

Solamente `owner` y `admin` reciben `pos.team.manage`. La página también maneja un `403` explícito para accesos directos de Encargado, Cajero, Inventario y roles legacy.

El sidebar añade únicamente la entrada **Equipo** cuando el bootstrap resuelve `membership.permissions` con `pos.team.manage`. Esto es una mejora de navegación, no la barrera de seguridad.

## Team API

`GET /api/pos/team?brandSlug=…` devuelve sólo datos tenant-scoped de la marca autorizada:

- marca;
- plan y límite de usuarios desde el catálogo comercial;
- miembros activos;
- invitaciones `pending` no vencidas;
- uso efectivo (`activos + pendientes`), disponibles y límite;
- permisos y acciones disponibles para el actor.

Los correos y nombres se resuelven en servidor: primero `user_profiles` en lote y, sólo para miembros sin correo, `Auth Admin` por `user_id`. El navegador nunca consulta `auth.users` ni recibe metadata cruda de Auth.

## Acciones de equipo

La UI reutiliza `POST /api/pos/team/invitations` de V1B.1 para reservar y entregar invitaciones. Los roles iniciales siguen la autoridad del servidor:

- Owner: Administrador, Encargado, Cajero, Inventario.
- Admin: Encargado, Cajero, Inventario.
- Nunca Propietario en la invitación inicial.

Las mutaciones nuevas son:

- `DELETE /api/pos/team/invitations/[invitationId]` → `pos_revoke_user_invitation_v1`;
- `PATCH /api/pos/team/members/[userId]` → `pos_change_brand_membership_role_v1`;
- `DELETE /api/pos/team/members/[userId]` → `pos_revoke_brand_membership_v1`.

No existen escrituras directas desde navegador a `user_brand_access` ni `pos_user_invitations`.

## Roles y seguridad

- Owner puede administrar roles canónicos y promover explícitamente a un miembro existente a Propietario.
- Admin sólo administra Encargado, Cajero e Inventario; no puede invitar, modificar ni promover Admin/Owner.
- La promoción a Propietario es una acción separada con confirmación.
- La UI no permite revocación propia.
- El último Owner no muestra opciones para bajar de rol o revocar acceso. El trigger/RPC DB-side de V1A sigue siendo la autoridad ante carreras.
- `editor` y `viewer` permanecen almacenados como legacy. Editor se muestra como equivalente a Encargado para POS; ambos siguen fuera de roles de invitación nuevos.

## Asientos

La pantalla muestra Activos, Pendientes, Límite y Disponibles. Una invitación sólo cuenta mientras sea `pending` y `expires_at > now()`. El límite real sigue siendo validado por la RPC V1A durante la reserva; la UI no es autoridad comercial.

## Fuera de alcance

V1B.2 no implementa Stripe, Billing, asignación por sucursal/caja, audit log enterprise ni enforcement masivo RBAC de productos, inventario, ventas, caja, clientes, reportes, fidelización o intelligence. Esas superficies pertenecen a RBAC V1C o fases posteriores.
