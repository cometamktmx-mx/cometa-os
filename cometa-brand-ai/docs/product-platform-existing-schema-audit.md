# Product Platform V1A.0B — auditoría del esquema existente

Estado: inventario canónico read-only ampliado. Los valores instalados deben incorporarse a este documento después de ejecutar y exportar todas las secciones.

## Objetivo y límites

Esta auditoría recupera la definición real del subsistema de planes, suscripciones, historial y capacidades de Cometa POS antes de diseñar entitlements. No crea una segunda autoridad ni contiene una migración operacional.

Objetos explícitos:

- `public.pos_plans`
- `public.pos_plan_limits`
- `public.pos_subscriptions`
- `public.pos_subscription_events`
- `public.pos_capability_catalog`
- `public.pos_business_capabilities`
- `public.pos_initialize_brand_setup`
- `public.pos_set_subscription_offer`

También inventaría, sólo como candidatos para revisión, funciones o tablas relacionadas por nombre con plan, subscription, capability, trial u offer.

## Evidencia confirmada

### Separación de responsabilidades

- `pos_plans` es el catálogo comercial actual.
- `pos_plan_limits` conserva límites y flags compatibles con la aplicación existente.
- `pos_subscriptions` es la asignación comercial vigente por marca.
- `pos_subscription_events` existe como historial de suscripción y debe evaluarse como ledger oficial antes de crear otro historial.
- `pos_capability_catalog` y `pos_business_capabilities` representan capacidades operativas aplicables al giro; no son entitlements comerciales.

### Contrato conocido de `pos_subscriptions`

La auditoría anterior confirmó al menos:

- identidad: `id`, `brand_id`, `brand_slug`, `plan_code`;
- estado: `status`, con default `trial`;
- precio: `list_price`, `contracted_price`, `currency`, `billing_interval`, `price_locked`, `promotion_code`;
- ciclo/trial: `trial_ends_at`, `current_period_start`, `current_period_end`, `grace_ends_at`, `started_at`, `cancelled_at`;
- auditoría: `metadata`, `created_by`, `created_at`, `updated_at`.

V1A no debe duplicar esas columnas. V1B deberá extender sus fechas reales, no crear un segundo trial record.

### Autoridad de marca

`src/lib/pos/server.ts` autentica, resuelve la marca y valida `user_brand_access` antes de entregar un cliente service-role. Un futuro endpoint de entitlements debe conservar `requirePosContext`; un `brandSlug` recibido del navegador no es autoridad.

## Consumidores existentes

### API

| Archivo | Contrato observado |
|---|---|
| `src/app/api/pos/bootstrap/route.ts` | Inicializa la marca, lee suscripción, plan, límites y capabilities. |
| `src/app/api/pos/subscription/route.ts` | Lee la suscripción y permite al administrador actualizar oferta/status mediante RPC. |
| `src/app/api/pos/profile/route.ts` | Lee y configura capabilities operativas. |
| `src/app/api/pos/branding/route.ts` | Inicializa la marca POS. |
| `src/app/api/pos/product-config/route.ts` | Inicializa y consume capabilities. |
| `src/app/api/pos/locations/route.ts` | Usa `plan_code`, `status` y `max_locations`. |
| `src/app/api/pos/registers/route.ts` | Usa `plan_code`, `status` y `max_registers`. |
| `src/app/api/pos/products/route.ts` | Valida estado de suscripción antes de crear productos. |
| `src/app/api/pos/inventory-receiving/route.ts` | Valida estado antes de completar recepciones. |

Locations, registers, products e inventory-receiving aceptan actualmente `trial`, `active` y `grace_period`. La extensión de entitlements no debe bloquearlos accidentalmente.

### Frontend

`src/app/brand/[brandSlug]/pos/onboarding/page.tsx` consume:

- estado, precios y promoción;
- plan con código, nombre y descripción;
- límites de locations, registers, users, products y customers;
- `includes_loyalty`, `includes_digital_card`, `includes_basic_insights`;
- catálogo y selección de capabilities.

No existe todavía un contrato general `hasEntitlement`; V1A deberá ser aditivo y mantener estos campos.

## Secciones del inventario

Las secciones 01–17 se preservan. `pos_subscription_events` fue añadido como target completo a las secciones generales de existencia, columnas, constraints, FKs, índices, RLS, ACL, enum y CHECKs.

Secciones específicas nuevas:

| Sección | Contenido |
|---|---|
| `18_subscription_events_structure` | Owner, RLS, persistencia, tamaño y conteo estimado. |
| `19_subscription_events_constraints` | PK, UNIQUE, CHECK, FK y exclusiones completas. |
| `20_subscription_events_indexes` | Índices constraint-backed e independientes. |
| `21_subscription_events_rls` | Políticas completas. |
| `22_subscription_events_acl` | Privilegios efectivos, con `PUBLIC` inspeccionado como grantee 0. |
| `23_subscription_event_type_distribution` | Conteo agregado por `event_type`, sin datos tenant. |
| `24a_subscription_event_type_contract` | Tipo, domain/base type y default de `event_type`. |
| `24b_subscription_event_type_enum_labels` | Labels si el tipo es enum. |
| `24c_subscription_event_type_domain_checks` | Constraints si usa domain. |
| `24d_subscription_events_triggers` | Triggers y definición de sus funciones. |
| `25_subscription_offer_semantics` | Definición completa e indicadores semánticos por overload. |
| `26_initialize_brand_setup_semantics` | Definición e indicadores de plan/status/trial/capabilities/eventos/idempotencia. |
| `27_related_function_semantic_markers` | Ayudas para identificar helpers que cambien plan/status/trial o creen eventos. |

Los indicadores regex de 25–27 son ayudas de navegación. Una coincidencia no demuestra que exista una mutación; siempre debe leerse la definición completa devuelta por las secciones 08, 10, 25 y 26.

## Recuperación canónica pendiente

### Plan codes

`13a_pos_plans_sample` devuelve el catálogo actual ordenado por `code`, con límite 50. Después de ejecutarlo, registrar aquí sin inferencias:

| code | name | active/status | PK/unique relevante |
|---|---|---|---|
| Pendiente | Pendiente | Pendiente | Secciones 02–03 |

Esto confirmará si existen `pos_start`, `pos_pro`, `pos`, `growth`, `partner` u otros. V1A no debe mapear un código no observado.

### FK plan/subscription

Las secciones 02–04 recuperan tipo/default y FK expandida de `pos_subscriptions.plan_code`, incluyendo tabla/columna destino y acciones `ON UPDATE`/`ON DELETE`. `13b_pos_plan_limits_sample` y la misma FK audit confirman cómo se vinculan límites y planes.

Resultado pendiente:

- tipo de `plan_code`: pendiente;
- referencia: pendiente;
- `ON UPDATE`: pendiente;
- `ON DELETE`: pendiente.

### Contrato de subscription events

Después de ejecutar 02–07 y 18–24, registrar:

- PK y uniques;
- FK de `subscription_id` y acciones;
- enum/CHECK/domain real de `event_type`;
- índices y orden cronológico esperado;
- políticas y ACL;
- triggers que validan o enriquecen eventos;
- tipos actualmente usados según distribución agregada.

## Auditoría semántica de RPC

### `pos_set_subscription_offer`

La sección 08 devuelve todos los overloads y su metadata de seguridad. La sección 25 facilita revisar si cada definición:

A. referencia o modifica `plan_code`;
B. modifica `status`;
C. modifica pricing (`list_price`, `contracted_price`, `price_locked`);
D. modifica `promotion_code`;
E. modifica fechas de trial/ciclo/grace/cancelación;
F. inserta directamente en `pos_subscription_events`;
G. invoca un helper candidato.

Conclusiones canónicas pendientes hasta leer la salida. El hecho de que la API no envíe `plan_code` sugiere que el overload consumido puede no cambiar plan, pero no es prueba del contrato SQL.

### `pos_initialize_brand_setup`

La sección 26 permite documentar:

- plan inicial literal o consulta que lo resuelve;
- status inicial;
- cálculo de `trial_ends_at`;
- relación con `pos_plan_limits`;
- capabilities creadas;
- inserción de subscription events;
- idempotencia mediante `ON CONFLICT`, locks o comprobaciones.

No debe diseñarse V1A/V1B hasta leer la definición completa.

### Related functions

Las secciones 10 y 27 encuentran candidatos y resaltan referencias a `plan_code`, status, trial/grace y `pos_subscription_events`. La relevancia se decide leyendo cada función; el nombre por sí solo no basta.

## History readiness

`pos_subscription_events` es el candidato oficial y debe reutilizarse si sus columnas/constraints admiten los eventos requeridos.

Matriz por completar con `event_type` canónico y definiciones RPC:

| Necesidad futura | Soportada hoy | Evidencia |
|---|---|---|
| plan changed | Pendiente | 19, 23–27 |
| status changed | Pendiente | 19, 23–27 |
| trial started | Pendiente | 19, 23–27 |
| trial extended | Pendiente | 19, 23–27 |
| trial expired | Pendiente | 19, 23–27 |
| activated | Pendiente | 19, 23–27 |
| grace started | Pendiente | 19, 23–27 |
| suspended | Pendiente | 19, 23–27 |
| cancelled | Pendiente | 19, 23–27 |
| pricing changed | Pendiente | 19, 23–27 |
| promotion changed | Pendiente | 19, 23–27 |

No se añadirán nuevos tipos hasta completar esta matriz.

## Trial readiness

Confirmado:

- existe status `trial` en los consumidores;
- existen `trial_ends_at`, `started_at`, `grace_ends_at`, `current_period_start`, `current_period_end` y `cancelled_at`.

Pendiente:

- CHECK/enum real de status;
- constraints temporales;
- defaults/cálculo de fechas;
- transiciones implementadas;
- eventos de trial existentes;
- helper responsable de expiración/extensión.

Las secciones 03, 10, 12, 17 y 23–27 determinan la preparación exacta para V1B.

## Mapa de diferencias

| Área | Existing | Target | Gap pendiente | Extensión recomendada |
|---|---|---|---|---|
| Plans | `pos_plans`, `pos_plan_limits` | POS/Growth/Partner | Códigos reales y PK | Extender filas/mapping existentes. |
| Subscriptions | `pos_subscriptions` | Una autoridad comercial por marca | FK/status/access semantics | Reutilizar sin tabla paralela. |
| History | `pos_subscription_events` | Ledger de plan/status/trial/pricing | `event_type` y writers reales | Reutilizar y ampliar sólo si el contrato lo exige. |
| Entitlements | Flags específicos | Catálogo y mappings normalizados | No confirmado | Añadir catálogo/mapping ligados a planes reales. |
| Capabilities | Catálogo + asignación por marca | Aplicabilidad operativa | Separación conceptual | Preservar; no convertir en entitlements. |
| Overrides | No confirmados comercialmente | Add/remove temporal | Tabla comercial ausente | Añadir override separado de capabilities. |
| Trial | Status y fechas existentes | Trial Engine V1B | Transiciones/eventos | Extender columnas y ledger actuales. |
| PULSAR | Producto técnico existente | Growth por defecto, piloto por override | Entitlement ausente | Mapear después de confirmar plan codes. |

## Decisión recomendada para V1A

Sujeta a los resultados canónicos:

1. conservar `pos_plans` como catálogo;
2. conservar `pos_subscriptions` como asignación vigente;
3. conservar `pos_subscription_events` como ledger;
4. conservar `pos_business_capabilities` para aplicabilidad operativa;
5. añadir únicamente catálogo de entitlements, mapping al identificador real de plan y overrides comerciales;
6. resolver entitlement desde suscripción vigente + mapping + override vigente;
7. mantener `pos_plan_limits` y sus flags durante la transición;
8. mapear PULSAR sólo después de identificar códigos reales.

## Seguridad

- El inventory usa una transacción `READ ONLY` y termina con `ROLLBACK`.
- `PUBLIC` se inspecciona con `aclexplode` y `grantee = 0`; nunca se resuelve como rol real.
- Para ACL nulo se usa `acldefault('r', owner)` o `acldefault('f', owner)` según el objeto.
- No se listan marcas ni eventos individuales.
- Las distribuciones son agregadas.

## Procedimiento de captura V1A.0B

1. Abrir Supabase SQL Editor en el proyecto correcto.
2. Cargar `supabase/tests/product_platform_v1a0_schema_inventory.sql`.
3. Confirmar que inicia con `BEGIN TRANSACTION READ ONLY` y termina con `ROLLBACK`.
4. Ejecutar el archivo completo una vez.
5. Exportar todos los result sets 01–27 conservando la columna `section`.
6. Compartir especialmente 02–04, 08, 10, 12–13b y 18–27.
7. Incorporar los valores reales en las tablas “pendiente” de este documento.
8. No ejecutar todavía Product Platform V1A ni V1B.
