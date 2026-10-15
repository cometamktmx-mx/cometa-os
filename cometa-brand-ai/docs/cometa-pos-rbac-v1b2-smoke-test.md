# COMETA POS — RBAC V1B.2 Smoke Test

Ejecutar con marcas de prueba y sin alterar datos productivos no autorizados.

## Owner

1. Entrar a `/brand/[brandSlug]/pos/team`.
2. Confirmar plan, Activos, Pendientes, Límite y Disponibles.
3. Invitar Admin, Encargado, Cajero e Inventario; comprobar que Propietario no aparece como rol inicial.
4. Ver una invitación pendiente y revocarla; comprobar que el asiento vuelve a estar disponible.
5. Cambiar Encargado a Cajero y comprobar que se actualiza mediante refresh.
6. Promover un miembro canónico a Propietario desde la confirmación separada.
7. Con un único Owner, comprobar que no se muestran revocar acceso ni bajar el rol; forzar una operación equivalente por API sólo en entorno de prueba y comprobar `POS_LAST_OWNER_REQUIRED`.
8. Revocar a un empleado y comprobar que la membresía pasa a inactiva sin borrar su cuenta Auth.

## Admin

1. Abrir Equipo y confirmar acceso.
2. Comprobar que puede invitar Encargado, Cajero e Inventario.
3. Comprobar que Administrador y Propietario no aparecen como opciones de invitación.
4. Intentar abrir acciones sobre Owner/Admin y comprobar que no se ofrecen; verificar que el API también rechaza la acción.

## Roles sin gestión de equipo

Para Encargado, Cajero, Inventario y Editor legacy:

1. Abrir manualmente `/brand/[brandSlug]/pos/team`.
2. Confirmar la superficie humana de permiso denegado.
3. Solicitar `GET /api/pos/team` con su sesión y comprobar `403`.
4. Confirmar que no aparece la entrada Equipo en el sidebar.

## Legacy y multi-brand

1. En `nash-mood`, confirmar que el valor almacenado `editor` no cambia y se muestra como legacy/equivalente a Encargado.
2. Confirmar que Viewer, si existe, se muestra como Consulta legacy y no está disponible al invitar.
3. Con un usuario multi-brand, confirmar que las acciones, plan y asientos provienen únicamente de la marca de la URL autorizada.

## Límites e invitaciones

1. Con `activos + pendientes = límite`, intentar invitar otra persona.
2. Confirmar `POS_USER_LIMIT_REACHED`, ningún correo adicional y ningún asiento reservado.
3. Confirmar que invitaciones vencidas no cuentan en el resumen.
4. Confirmar que las invitaciones V1B.1 siguen llevando al flujo de aceptación y al POS de la marca invitada, nunca a onboarding de negocio.

## Móvil

En 390 px, comprobar que summary, filas de miembros, invitaciones, selectores, modales y confirmaciones se apilan sin overflow horizontal y mantienen objetivos táctiles utilizables.
