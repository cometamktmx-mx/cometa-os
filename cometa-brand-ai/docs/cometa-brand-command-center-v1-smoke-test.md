# Cometa Brand Command Center V1 — Smoke Test

## POS y OS activos

1. Abrir `/brand/tienda-morotiendas` con una membership activa.
2. Confirmar Command Center, empresa, sesión, Cometa Core y estado de ecosistema.
3. Confirmar `Cometa OS: Activo` y abrir `/brand/tienda-morotiendas/os`.
4. Confirmar `Cometa POS: Activo`, el CTA `Entrar a Cometa POS` y `2 sistemas activos`.
5. Confirmar que la recarga de la raíz no crea registros POS adicionales.

## Brand sin suscripción POS persistida

1. Abrir la raíz de una brand con membership activa y sin `pos_subscription`.
2. Confirmar que la raíz abre y OS conserva su estado comercial real.
3. Confirmar POS `En preparación` sin CTA normal de cliente.

## POS configurado pero bloqueado

1. Usar una brand de prueba con suscripción persistida y lifecycle bloqueado, o sin entitlement `pos.access`.
2. Confirmar POS `No disponible` sin CTA normal de cliente.
3. Simular una falla de lectura controlada y confirmar el mismo estado fail-closed, sin mostrar `Activo` ni `En preparación`.
4. Recargar la raíz varias veces y confirmar que no se crean suscripciones, locations, registers ni cambios de lifecycle.

## Platform admin

1. Abrir una brand canónica como platform admin.
2. Confirmar que el estado comercial de OS y POS sigue siendo veraz.
3. Confirmar que cualquier enlace de bypass usa la etiqueta `Acceso interno`.
4. Si POS no está activo comercialmente, confirmar el enlace secundario `Abrir entorno POS` con la advertencia de entorno interno.

## Guard y rutas

1. Un usuario normal sin membership activa debe quedar bloqueado en la raíz.
2. Un slug desconocido no debe hacer fallback a otra empresa.
3. Confirmar que `/brand/[brandSlug]/os` y `/brand/[brandSlug]/pos` conservan sus comportamientos actuales.
4. Confirmar que un bookmark con hash OS conocido continúa redirigiéndose a `/os`.

## Responsive

1. A 390px, confirmar que header, identidad de sesión y CTA workspace se mantienen usables.
2. Confirmar core en flujo vertical, tarjetas en una columna y ausencia de scroll horizontal.
