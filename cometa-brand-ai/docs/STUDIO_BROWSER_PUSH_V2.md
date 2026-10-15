# Studio Browser Push V2 — contrato futuro

Este documento no implementa Browser Push. Studio Live Updates V1 funciona únicamente mientras Studio está abierto mediante comprobaciones server-side seguras.

## Requisitos técnicos

- HTTPS en producción; localhost solamente para desarrollo compatible.
- Notification API con consentimiento explícito y contextual del usuario.
- Service Worker versionado, con actualización y retirada controladas.
- Push API para crear una suscripción por usuario y dispositivo.
- claves VAPID almacenadas únicamente en configuración segura del servidor;
- almacenamiento canónico futuro de subscriptions por `user_id` y dispositivo;
- revocación al cerrar sesión, retirar permiso, invalidarse el endpoint o desactivar al usuario;
- preferencias por tipo de evento, canal y horario cuando el producto las defina.

## Seguridad y privacidad

Toda suscripción deberá crearse tras autenticar al usuario y comprobar su perfil Team activo. Un endpoint push nunca será autoridad de marca o usuario. Antes de enviar, el servidor deberá volver a comprobar membresía activa, asignación operativa y `assigned_to`.

El payload push debe ser mínimo: tipo de evento, título humano y ruta interna opaca. No debe incluir comentarios completos, briefs, notas privadas, snapshots, signed URLs, tokens, emails ni contenido sensible. Las subscriptions y claves deberán cifrarse o protegerse conforme a su sensibilidad, con eliminación y rotación documentadas.

## Eventos candidatos

- `client_change`
- `internal_change`
- `new_assignment`
- `client_approved`
- `urgent_review`, únicamente cuando exista una señal canónica real

No enviar push por guardados triviales, timers de Operación, navegación, filtros administrativos o cualquier actualización sin valor de atención.

## Click routing

El Service Worker deberá validar una ruta allowlisted antes de abrir o enfocar Studio. Rutas sugeridas: detalle de pieza asignada, `/studio/changes` o `/studio`. La aplicación volverá a autorizar usuario, marca y pieza server-side; la ruta del push nunca concede acceso.

## Entrega y operación

V2 necesitará deduplicación e idempotencia, caducidad, manejo de endpoints `410/404`, límites de reintento, observabilidad sin secretos y protección contra fan-out cross-tenant. El historial persistente, preferencias y subscriptions requerirán un diseño de datos y migración aprobados por separado.
