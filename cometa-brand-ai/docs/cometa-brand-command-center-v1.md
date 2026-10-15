# Cometa Brand Command Center V1

## Jerarquía de producto

```text
Cometa Brand Command Center
├── Cometa OS — cerebro estratégico
└── Cometa POS — motor operativo
```

`/brand/[brandSlug]` es la puerta principal de una empresa dentro de Cometa. No es un dashboard operativo, de OS, de POS ni de configuración. Su objetivo es explicar qué empresa se está viendo y qué sistemas existen dentro de su ecosistema.

## Authority de acceso

La raíz reutiliza `requireBrandAccess(brandSlug)`:

```text
usuario autenticado
→ brand canónica
→ membership activa
  o platform admin activo
```

No exige Cometa OS activo ni disponibilidad comercial POS. La raíz puede abrirse para una empresa con OS `not_configured` y POS no habilitado.

## Estado de productos

El estado comercial de Cometa OS proviene únicamente de `brand_os_access`:

- `active`: muestra `Activo` y permite entrar a `/brand/[brandSlug]/os`;
- `paused`: muestra `Pausado`;
- `inactive`: muestra `No activo`;
- ausencia de fila: muestra `Disponible` (`not_configured`).

Un platform admin conserva bypass técnico de OS, pero el Command Center mantiene visible el estado comercial real. Cuando aplique, el enlace se etiqueta como `Acceso interno`.

El estado customer-facing de Cometa POS usa **passive product availability**: una resolución server-side de solo lectura. No consulta `/api/pos/bootstrap`, `/api/pos/subscription` ni llama `pos_initialize_brand_setup`; por tanto, no crea suscripciones, locations, registers ni muta lifecycle o plan.

- `Activo`: existe una `pos_subscription` persistida, su lifecycle permite acceso y sus entitlements efectivos incluyen `pos.access`.
- `En preparación`: no existe una suscripción POS persistida para la brand.
- `No disponible`: existe configuración POS, pero el lifecycle bloquea el acceso, falta `pos.access` o la verificación no pudo completarse. El estado falla cerrado y no muestra CTA cliente.

Esta resolución es una señal pasiva de disponibilidad de producto, no una authority de Billing o Commercial Grants. Cuando exista una authority de Commercial Grants, se integrará dentro del mismo resolver normalizado; el Command Center no necesitará cambiar su UI ni su regla de presentación.

Cuando POS está `Activo`, cualquier usuario autorizado en la raíz recibe el CTA normal `Entrar a Cometa POS`. Un platform admin puede conservar el enlace secundario `Abrir entorno POS` sólo cuando el estado comercial no está activo. Es un acceso interno a la ruta existente, no una señal comercial; al abrirla se conserva el comportamiento actual de inicialización de POS.

## Diseño

La composición se limita a:

1. header de empresa y sesión;
2. visual `Cometa Core` que conecta empresa, OS y POS;
3. superficies de producto diferenciadas;
4. estado compacto del ecosistema.

No muestra ventas, tickets, caja, inventario, leads, readiness, knowledge, usuarios ni métricas globales. Cometa OS conserva su lenguaje técnico y denso en `/brand/[brandSlug]/os`; POS conserva su shell operacional en `/brand/[brandSlug]/pos`.

## Compatibilidad y límites

El redirect de hashes legacy hacia `/os` permanece intacto. `Cambiar empresa` usa el workspace existente; no se introduce un selector ni se altera el login.

Este bloque no modifica OS, POS, APIs operativas, RBAC V1C, Stripe, Billing, checkout ni rutas externas de Mercury y Sales AI.
