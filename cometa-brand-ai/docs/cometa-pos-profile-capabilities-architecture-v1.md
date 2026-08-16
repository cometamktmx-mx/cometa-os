# Cometa POS — Profile y capabilities

## Cuatro conceptos separados

- `profile_code` es la identidad operativa detallada y persistida del negocio.
- `profile_family` es una agrupación derivada para experiencia macro; nunca se almacena.
- capability indica una función operativa aplicable y configurada para la marca.
- entitlement indica un derecho comercial contratado.

Ninguno sustituye a otro. Una experiencia futura puede usar la familia para elegir UX, el profile para especialización, capabilities para comportamiento operacional y entitlements para autorización comercial.

## Autoridades existentes

V2A conserva sin cambios:

- `pos_profile_catalog` como catálogo de perfiles;
- `pos_business_profiles.profile_code` como selección por marca;
- `pos_profile_capability_defaults` como recomendaciones de configuración;
- `pos_capability_catalog` como catálogo operativo;
- `pos_business_capabilities` como estado materializado y personalizado por marca;
- `pos_configure_business_profile` como único writer canónico;
- `/api/pos/profile` y el onboarding como flujo de configuración.

Los defaults no se recalculan durante una lectura. `effectiveCapabilities` contiene únicamente filas materializadas con `enabled=true` cuyo registro de catálogo tiene `launch_status=live`. Un override materializado en `pos_business_capabilities`, incluido `enabled=false`, conserva precedencia.

## Mapping derivado

| profile_code | profile_family |
| --- | --- |
| fashion | retail |
| retail | retail |
| pharmacy | retail |
| coffee_shop | restaurant |
| restaurant | restaurant |
| services | services |
| mixed | generic |
| unconfigured | generic |
| desconocido o null | generic |

`pos_profile_family(text)` es la única fuente del mapping. TypeScript valida el valor server-side pero no replica la tabla de decisión.

## Contrato de lectura

Bootstrap y `GET /api/pos/profile` agregan de forma aditiva:

- `profileCode`;
- `profileFamily`;
- `effectiveCapabilities`.

Los contratos legacy `profile`, `capabilities`, `capabilityRows`, defaults, entitlements y lifecycle permanecen. El shell conserva estos tres valores en su contexto y los limpia al cambiar de marca para evitar fuga temporal entre tenants.

## Compatibilidad y navegación

El POS retail actual no cambia. V2A no oculta navegación: los enlaces existentes representan módulos core o no tienen una equivalencia suficientemente inequívoca con un único capability legacy. Las fases verticales posteriores podrán aplicar condiciones explícitas una vez definidos contratos de módulo.

No se crean shells separados, tablas industry, columna `profile_family`, códigos namespaced, defaults paralelos ni un segundo configurador.

## Futuras verticales

- `profile_family=restaurant` define una experiencia macro compartida.
- `profile_code=coffee_shop` o `restaurant` mantiene el subtipo.
- capabilities como `recipes`, `ingredients`, `modifiers`, `combos`, `tables` y `kitchen_tickets` determinan las funciones reales de cada marca.

El mismo patrón permitirá retail y services sin separar codebases ni perder personalizaciones existentes.
