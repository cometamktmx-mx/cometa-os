# Cometa OS Routing Restructure V1 — Smoke Test

## Acceso y launcher

1. Con una membership activa de `tienda-morotiendas`, abrir `/brand/tienda-morotiendas`.
2. Confirmar launcher mínimo: identidad, tarjeta Cometa POS y tarjeta Cometa OS; no métricas de negocio.
3. Confirmar estado comercial `Activo` para Cometa OS y abrir `/brand/tienda-morotiendas/os`.
4. Verificar command bar, overview, acciones, readiness, módulos y navegación móvil.

## OS no configurado y POS

1. Con una membership activa en otra brand sin fila `brand_os_access`, abrir `/brand/[brandSlug]`.
2. Confirmar que el launcher carga y Cometa OS muestra `Disponible`, sin declararlo activo.
3. Abrir directamente `/brand/[brandSlug]/os`; confirmar el bloqueo humano de `not_configured` y el CTA al inicio.
4. Abrir `/brand/[brandSlug]/pos`; confirmar que POS mantiene su comportamiento normal.

## Otros estados y bypass

1. Con una fila OS `paused`, confirmar el mensaje de pausa en `/os`.
2. Con una fila OS `inactive`, confirmar el mensaje de inactividad en `/os`.
3. Con platform admin activo y sin membership de la brand, confirmar que launcher y `/os` abren por bypass interno, sin presentar falsamente el estado comercial como activo.
4. Con slug desconocido, confirmar que no existe fallback a otra brand.

## Compatibilidad y datos

1. Abrir `/brand/tienda-morotiendas#estrategia-mes` y confirmar redirección a `/brand/tienda-morotiendas/os#estrategia-mes`.
2. Repetir con cada anchor heredado: resumen, cuenta-digital, trabajo-realizado, calendario-contenido, conexiones, reportes, inventario y oportunidades.
3. Probar un hash desconocido: debe permanecer en launcher y no entrar en loop.
4. Simular una fuente de conteo no disponible y confirmar `No disponible`, no un cero presentado como métrica válida.

## Responsive

1. A 390px, confirmar que launcher y OS no tienen overflow horizontal.
2. Confirmar que la navegación OS se puede recorrer horizontalmente y que acciones primarias permanecen accesibles.

## Límites de la fase

Verificar que las rutas externas de Mercury y Sales AI conservan su comportamiento actual: el rollout de links externos y protección de esas superficies pertenece a Fase C.
