# Cometa OS Routing Restructure V1 — Fase B

## Rutas y alcance

La ruta oficial de Cometa OS es ahora `/brand/[brandSlug]/os`. La raíz `/brand/[brandSlug]` es un launcher temporal de empresa: muestra identidad y accesos de producto, sin métricas, dashboards, ventas, leads ni datos de equipo. No es todavía Brand Home V1.

La migración no modifica POS. El launcher enlaza a `/brand/[brandSlug]/pos` sin inicializar POS para comprobar disponibilidad; la autoridad comercial definitiva se resuelve dentro de POS.

## Acceso

`/brand/[brandSlug]/os` aplica el guard de servidor antes de renderizar. Un usuario normal necesita una membership activa en `user_brand_access` y `brand_os_access.status = active`. Los estados `paused`, `inactive` y la ausencia de fila (`not_configured`) muestran una superficie humana con retorno al inicio.

Un platform admin activo puede abrir OS como bypass interno sin crear membership, ownership, seats o una fila de producto. El launcher mantiene visible el estado comercial real y distingue ese acceso interno de `OS activo`.

El launcher usa `requireBrandAccess`: exige autenticación y una brand canónica más membership activa, o platform admin, pero no exige OS activo. Así, una empresa con POS válido y OS `not_configured` sigue pudiendo abrir su empresa y POS.

## Command Center

`os-dashboard-client` hace una sola petición a `GET /api/brand-dashboard` y distribuye su payload a:

- command bar;
- navegación específica de OS;
- executive overview;
- next best actions;
- system readiness;
- system map de módulos.

La UI usa datos reales o derivados explícitos. `dataAvailability` se añadió de manera aditiva a Brand Dashboard para estas fuentes falibles:

- conteos: leads, respuestas listas, knowledge sources, catálogo, reglas, FAQs y señales internas pendientes/aplicadas;
- derivados: knowledge, readiness, autonomía, riesgo y siguiente acción.

Los consumidores nuevos muestran `No disponible` cuando una fuente falló; no convierten un error de consulta en el valor operativo `0`. Los campos numéricos existentes se conservan para consumidores anteriores.

Readiness se presenta una sola vez, con score, desglose y siguiente mejora. Las acciones sólo aparecen cuando existen señales disponibles. Los módulos representan destinos actuales o estados transparentes; no inventan activity, integraciones u oportunidades.

## Compatibilidad

Los anchors OS heredados continúan en `/os`:

`#resumen`, `#cuenta-digital`, `#trabajo-realizado`, `#estrategia-mes`, `#calendario-contenido`, `#conexiones`, `#reportes`, `#inventario` y `#oportunidades`.

`BrandHomeHashRedirect` redirige únicamente esos hashes conocidos desde la raíz a `/brand/[brandSlug]/os#...`. Hashes desconocidos no se redirigen y no generan loops.

## Límite explícito

Esta fase no mueve Mercury, Sales AI ni otras superficies externas de OS: esos enlaces y su enforcement completo siguen pendientes para Fase C. Tampoco implementa Brand Home completo, Stripe, Billing, RBAC V1C ni cambios de POS.
