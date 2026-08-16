# Cometa POS — Self-Service Entry Audit

Fecha de auditoría: 14 de agosto de 2026  
Alcance: inspección estática del repositorio; no se ejecutó SQL ni se modificó producción.

## Veredicto ejecutivo

Cometa POS **no es self-service hoy**. El producto operativo está suficientemente conectado una vez que ya existen una marca y un acceso, pero la cadena pública se corta en sus dos primeros eslabones:

1. `/login` sólo inicia sesión; no existe signup, recuperación de contraseña ni callback de confirmación.
2. Un cliente autenticado sin `user_brand_access` llega a un workspace vacío que le pide contactar al administrador. No puede crear una brand ni convertirse en owner desde la UI.

La inicialización POS, el trial de 15 días, el perfil operativo y las superficies para crear sucursal/caja sí existen. Sin embargo, sólo se vuelven alcanzables después de una provisión manual de usuario, brand y acceso. El blocker principal no es el motor POS: es la creación segura y atómica del tenant.

En la clasificación siguiente, **MISSING** describe una pieza inexistente y **BLOCKER** su impacto en el flujo. Por eso una etapa puede ser `MISSING / BLOCKER`: no sólo falta, sino que su ausencia impide el piloto self-service.

| Etapa | Estado | Evidencia resumida |
|---|---|---|
| Cuenta nueva | **MISSING / BLOCKER** | `/login` usa únicamente `signInWithPassword`; no existe `signUp` ni ruta de registro. |
| Primera sesión sin brand | **PARTIAL / BLOCKER** | `/workspace` renderiza el estado vacío, pero remite al Access Center administrativo. |
| Crear negocio/brand | **MISSING / BLOCKER** | No existe API/UI self-service; `/new-analysis` es una herramienta ORION sólo visible a admin y no asigna ownership. |
| Autorizar al creador | **MISSING / BLOCKER** | La escritura localizada de `user_brand_access` vive en `/api/admin/access` y requiere admin. |
| Inicializar POS | **READY, condicional** | Bootstrap/profile/subscription llaman la RPC idempotente `pos_initialize_brand_setup` después de `requirePosContext`. |
| Trial | **READY, condicional** | La inicialización crea `pos_start`, trial de 15 días y `trial_started`; lifecycle y entitlements ya están integrados. |
| Elegir giro | **READY, condicional** | Wizard POS y `pos_configure_business_profile`; sólo perfiles `live`. |
| Sucursal y caja | **PARTIAL** | Existen UI/APIs, pero no hay defaults automáticos y se configuran después del wizard. |
| Primer producto/inventario | **READY, guiado** | Home POS y páginas operativas ofrecen la ruta natural; no forman parte del wizard. |
| Primera venta | **READY, condicional** | El flujo Retail está preparado, siempre que ya existan producto, stock, sucursal, caja y sesión. |

## 1. Auth y signup

### Lo que existe

- [`src/app/login/page.tsx`](../src/app/login/page.tsx) ofrece email + contraseña y llama `supabase.auth.signInWithPassword`.
- Admite un `next` relativo seguro y, sin él, resuelve la salida entre `/workspace`, `/designer-hub` o la primera `/brand/[brandSlug]` asignada.
- [`src/proxy.ts`](../src/proxy.ts) considera públicas únicamente `/` y `/login`; el resto de páginas pasa por renovación/verificación de sesión.
- [`src/lib/supabase/middleware.ts`](../src/lib/supabase/middleware.ts) redirige a `/login` cuando no hay usuario.
- Los handlers POS vuelven a validar al usuario mediante Supabase Auth; no dependen sólo del proxy.

### Lo que no existe

La búsqueda completa en `src/` no encontró llamadas a `auth.signUp`, `signInWithOtp`, `resetPasswordForEmail`, `verifyOtp` ni `exchangeCodeForSession`. Tampoco existen páginas/rutas de signup, recuperación, reset o callback de auth.

Respuestas:

- ¿Un usuario completamente nuevo puede crear una cuenta? **No.**
- ¿Dónde? **No existe una ruta.**
- ¿Hay UI real? Hay login real, no signup.
- ¿Hay validación de email? Supabase valida el formato al iniciar sesión, pero el repositorio no implementa alta ni confirmación.
- ¿Existe recovery/reset? **No.**

La configuración remota de Supabase Auth (confirmación obligatoria, URLs permitidas y plantillas) no está versionada en `supabase/config.toml`, que no existe. Por tanto, no es posible confirmar estáticamente si producción exige email confirmado. Si lo exige, tampoco existe el callback de aplicación necesario para una UX controlada.

Estado: **BLOCKER**.

## 2. Estado del primer usuario

Un usuario autenticado sin perfil o acceso se trata como `client`. [`src/app/api/workspace-brands/route.ts`](../src/app/api/workspace-brands/route.ts) consulta `user_brand_access` activo y devuelve cero brands. [`src/app/workspace/page.tsx`](../src/app/workspace/page.tsx) muestra:

> No tienes marcas asignadas. Pide al administrador de Cometa OS que conecte tu usuario con una marca desde el Access Center.

No hay CTA de creación para clientes; “Nueva marca” y `/new-analysis` son `adminOnly`. No se observó un loop técnico: el usuario puede permanecer en `/workspace`, pero es un callejón sin salida de producto.

Estado: **BLOCKER**.

## 3. Creación de business/brand

No existe un comando self-service que cree una marca canónica. La resolución actual, en [`src/lib/brand-resolver.ts`](../src/lib/brand-resolver.ts), busca secuencialmente en:

1. `clients`;
2. `brand_analysis`;
3. `cosmos_memory`.

Esto funciona para resolver marcas existentes, pero no define por sí solo cuál debe recibir el alta comercial. El resolver incluso puede devolver un fallback `exists=false`; `requirePosContext` lo rechaza correctamente.

`/new-analysis` y `/api/analyze-brand` generan análisis ORION y escriben `brand_analysis`/`cosmos_memory`; no constituyen provisión POS porque no crean de forma atómica acceso del usuario, perfil POS, subscription, ubicación y caja. La navegación a “Nueva marca” sólo aparece para admin.

La única escritura encontrada hacia `user_brand_access` está en [`src/app/api/admin/access/route.ts`](../src/app/api/admin/access/route.ts). Requiere administrador, primero exige que el usuario ya exista en Supabase Auth y luego hace upsert separado de `user_profiles` y acceso.

No hay flujo UI para validar nombre/slug, reservar una colisión o asignar owner al creador. Estado: **BLOCKER**.

## 4. Inicialización POS

`pos_initialize_brand_setup` sí está integrada y tiene varios consumidores controlados:

- [`src/app/api/pos/bootstrap/route.ts`](../src/app/api/pos/bootstrap/route.ts), GET;
- [`src/app/api/pos/profile/route.ts`](../src/app/api/pos/profile/route.ts), GET/POST;
- subscription, branding y product-config también aseguran inicialización.

Todos llegan a la RPC después de `requirePosContext`, que resuelve la brand y comprueba que el usuario tenga acceso (salvo admin global). La RPC V1B usa advisory lock, conserva `ON CONFLICT`, crea `trial_started` sólo para una subscription nueva y es idempotente frente a llamadas repetidas.

Una brand válida y autorizada puede existir sin setup POS hasta su primer acceso a estas superficies. El primer GET de bootstrap/profile/subscription lo crea automáticamente. Esto es fiable, aunque una lectura con efecto de escritura es una decisión que conviene conservar sólo como compatibilidad; ENTRY V1 debería inicializar explícitamente durante la transacción de alta.

Estado: **READY, condicional a brand + access**.

## 5. Trial

Para una brand inicializada:

- plan: `pos_start`;
- status persistido: `trial`;
- duración: 15 días;
- evento único: `trial_started`;
- lifecycle efectivo y expiración server-authoritative;
- entitlements efectivos disponibles en bootstrap/subscription;
- pantalla `/brand/[brandSlug]/pos/subscription` disponible para activación.

Por tanto el trial no requiere intervención administrativa **después** de que el usuario tenga una brand autorizada. Hoy sí requiere intervención antes, para crear/asignar esa brand.

Estado: **READY, condicional**.

## 6. Perfil y tipo de negocio

[`src/app/brand/[brandSlug]/pos/onboarding/page.tsx`](../src/app/brand/[brandSlug]/pos/onboarding/page.tsx) implementa un wizard real:

1. **Giro**: selecciona un registro `live` de `pos_profile_catalog`.
2. **Funciones**: parte de `pos_profile_capability_defaults` y permite ajustar capabilities live.
3. **Identidad**: guarda branding/ticket/loyalty copy existente.
4. **Operación**: confirma la configuración inicial y envía a Settings.

El POST de [`src/app/api/pos/profile/route.ts`](../src/app/api/pos/profile/route.ts) conserva `pos_configure_business_profile`; no escribe una taxonomía paralela. Los perfiles `fashion` y `retail` dependen de que su `launch_status` instalado sea `live`; la API rechaza cualquier perfil no disponible. El usuario puede volver a cambiar el perfil mediante el mismo contrato canónico.

La inicialización parte de `unconfigured`. Bootstrap calcula `onboardingRequired`, pero `PosShell` no fuerza una redirección al wizard. El usuario puede navegar por el shell y recibir errores de precondición al intentar crear recursos que requieren perfil.

Estado: **PARTIAL** por falta de conducción obligatoria/recuperable, no por falta de persistencia.

## 7. Pasos y marcadores de onboarding

| Paso real | Escritura | Requerido | Marcador |
|---|---|---:|---|
| Inicialización | `pos_initialize_brand_setup` | Sí | profile/subscription/branding existentes |
| Giro + capabilities | `POST /api/pos/profile` → `pos_configure_business_profile` | Sí | `profile_code`, capabilities, `onboarding_step` |
| Identidad | `POST /api/pos/branding` | Sí en el wizard | branding y avance del step |
| Sucursal | `POST /api/pos/locations` | Sí para operar | cambia onboarding a `in_progress`, step 4 |
| Caja | `POST /api/pos/registers` | Sí para vender | marca `onboarding_status=completed` |
| Producto | `/pos/products` | Sí para venta | bootstrap cuenta productos; no es completion marker del wizard |
| Inventario | `/pos/inventory` | Según producto/regla | bootstrap cuenta stock; no es completion marker del wizard |
| Sesión de caja | `/pos/cash` | Sí según regla actual | sesión abierta, fuera del onboarding marker |

El estado persiste entre refresh porque profile y branding se recargan desde servidor. Puede revisarse el wizard. Puede saltarse visualmente porque no hay guard de routing; las APIs sí preservan precondiciones. El wizard termina antes de crear producto, recibir inventario o abrir caja.

## 8. Primer producto

No se crea durante onboarding. El home POS mantiene una checklist y enlaza a Products cuando falta catálogo; Products presenta un empty state para crear el primero. La ruta natural actual es:

`onboarding → settings (sucursal/caja) → POS home → products`.

Es funcional, pero tiene más cambios de contexto de los necesarios para self-service. Estado: **PARTIAL** como experiencia de entrada; **READY** como módulo.

## 9. Primera sesión de caja y defaults

La inicialización POS no inserta `pos_locations` ni `pos_registers`, y no se localizaron seeds automáticos de esos recursos en las migraciones. Bootstrap sólo los consulta.

Sí existen formularios reales en `/brand/[brandSlug]/pos/settings` y APIs tenant-scoped:

- `POST /api/pos/locations`, protegido por lifecycle + `pos.access`;
- `POST /api/pos/registers`, protegido por lifecycle + `pos.cash`, y valida que la ubicación activa pertenezca a la misma brand.

Crear register completa el onboarding persistido. La página Cash guía apertura/cierre y Register exige sesión cuando corresponde. Por tanto un usuario puede progresar sin conocer IDs internos, pero debe crear manualmente “Sucursal” y “Caja” en dos formularios antes de vender.

Estado: **PARTIAL**. Es fricción severa, no un blocker técnico después de recibir acceso.

## 10. Rol y ownership

`requirePosContext` distingue `admin` global de `client`; para client obtiene slugs activos de `user_brand_access`. El Access Center maneja `access_role`, con vocabulario que incluye `owner`, pero no existe asignación automática del creador.

Hoy el flujo real es:

1. un administrador crea al usuario en Supabase Authentication;
2. un administrador usa Access Center;
3. se hace upsert de `user_profiles` y `user_brand_access`.

No existe una operación donde el usuario autenticado cree la brand y reciba owner sin poder elegir otro `user_id`. Estado: **BLOCKER** para self-service.

## 11. Routing real

```text
anonymous
  ├─ /                         landing pública
  ├─ /login                    login público
  └─ cualquier otra página → /login

usuario autenticado existente
  └─ /login submit
       ├─ admin activo          → /workspace
       ├─ asignación Mercury    → /designer-hub
       ├─ primera brand activa  → /brand/[slug]
       └─ sin acceso            → /workspace (vacío, sin salida self-service)

usuario con brand autorizada
  ├─ /brand/[slug]             Brand OS
  └─ /brand/[slug]/pos         PosShell
       ├─ profile/subscription GET inicializan POS idempotentemente
       ├─ unconfigured          → no hay redirect automático
       ├─ /pos/onboarding       giro + capabilities + identidad
       ├─ /pos/settings         sucursal + caja
       ├─ /pos/products         primer producto
       ├─ /pos/inventory        primera recepción
       └─ /pos/cash + register  apertura y primera venta
```

No se detectó loop de redirección para un usuario válido. Sí hay una incoherencia UX menor: si un usuario ya autenticado intenta `/login`, el middleware lo manda a `/`, no a su workspace/brand.

## 12. Workspace

El workspace es un Command Center orientado a Cometa OS y administración de cartera. Para cliente filtra correctamente sus marcas y redirige automáticamente cuando sólo tiene una. Con cero marcas, describe explícitamente un modelo gestionado por administrador.

Conclusión: sigue siendo útil para brand switching y usuarios multi-brand, pero no es la mejor primera pantalla para alta POS. Un signup POS debería aterrizar en un flujo de creación; después de crearse una sola brand, debería ir directo a `/brand/[slug]/pos/onboarding`. Workspace queda como selector posterior.

## 13. Landing y propuesta de entrada comercial

[`src/app/page.tsx`](../src/app/page.tsx) está posicionada como “agencia + sistema operativo”. Sus CTA principales “Solicitar demo” abren un `mailto:`; el CTA secundario lleva a `/login`. No existe CTA de signup.

Arquitectura comercial recomendada:

- **CTA primario:** “Probar Cometa POS gratis” → nueva ruta `/signup?product=pos`.
- **CTA secundario:** “Conocer Cometa OS / Solicitar demo” → mantener el flujo comercial gestionado.
- **Cometa OS:** plataforma madre y experiencia multi-producto.
- **Cometa POS:** puerta self-service con trial.
- **Growth/agencia:** upgrade gestionado, no requisito para empezar POS.

No se recomienda apuntar el CTA nuevo a `/login`: esa ruta no crea cuentas y produciría una promesa rota.

## 14. Email, verificación y recuperación

La política remota de confirmación no puede inferirse del repo. ENTRY V1 debe soportar ambos resultados de Supabase:

- sesión inmediata: continuar a crear negocio;
- confirmación requerida: mostrar “revisa tu correo”, procesar callback seguro y retomar el paso pendiente.

Debe añadirse recuperación de contraseña antes del piloto público. No se recomienda desactivar confirmación como atajo; se recomienda configurar `emailRedirectTo`, allow-list de redirects y una pantalla de reanudación clara.

## 15. Errores y estados parciales

| Caso | Comportamiento actual | Riesgo |
|---|---|---|
| Email duplicado/alta inválida | No hay signup | Sin UX ni mapping de errores. |
| Slug existente | No hay reserva self-service | No hay contrato seguro de sugerencia/reintento. |
| Falla al crear brand | No hay flujo | Sin recuperación. |
| Brand existe pero access falla | Posible en procesos manuales separados | Brand huérfana para el usuario. |
| Access existe pero resolver no encuentra brand | `requirePosContext` devuelve 404 | Acceso inútil. |
| Setup POS falla parcialmente | RPC idempotente y transaccional en su propio alcance | Reintento seguro, pero separado de creación de brand/access. |
| Refresh en onboarding | Recarga profile/branding/subscription | Recuperable. |
| `unconfigured` | Shell accesible; APIs clave rechazan precondición | Confusión, no corrupción. |
| Sin sucursal/caja | Home muestra pendientes y Settings permite crearlas | Recuperable manualmente. |

## 16. Atomicidad

No existe una transacción de “crear negocio”. Las piezas actuales están repartidas:

- Auth user: operación de Supabase Auth/manual;
- `user_profiles` y `user_brand_access`: Access Center, en escrituras secuenciales;
- brand: distintas fuentes históricas (`clients`, `brand_analysis`, `cosmos_memory`);
- POS profile/branding/subscription: una RPC idempotente separada;
- location/register: dos APIs separadas.

Esto significa que el flujo ideal no puede construirse de forma segura sólo encadenando fetches desde el navegador. Antes de ENTRY V1 debe confirmarse la tabla canónica para una brand self-service. Después, una RPC/service operation transaccional debe reservar slug, crear brand, asignar al usuario autenticado y ejecutar la inicialización POS. Ubicación/caja pueden incluirse como defaults en esa misma operación o crearse en un segundo paso idempotente claramente recuperable.

Estado: **BLOCKER P0**.

## 17. Seguridad para el futuro endpoint

La seguridad POS actual es sólida una vez creado el acceso: `requirePosContext` normaliza slug, resuelve una brand real y exige `user_brand_access`; CORE-1 añade lifecycle + entitlement a rutas operativas.

El alta futura debe garantizar:

- obtener `user_id` de la sesión verificada, nunca del body;
- no aceptar `brand_id`, role ni owner arbitrarios del browser;
- reservar slug bajo una constraint única en la autoridad canónica;
- no “adoptar” una brand existente por coincidencia de slug/nombre;
- insertar únicamente `owner` para el creador de la brand recién reclamada;
- no exponer service role al cliente;
- mantener toda reclamación dentro de una transacción DB-level;
- hacer retry idempotente con una operation key estable;
- devolver conflicto seguro sin revelar datos de otra marca.

No se observó hoy una vulnerabilidad self-service porque el endpoint no existe. El riesgo aparecería si se reutilizara ingenuamente el Access Center o `pos_initialize_brand_setup`: la primera es administrativa y la segunda presupone que la brand y autorización ya son válidas.

## 18. Readiness scores

| Dimensión | Score | Lectura |
|---|---:|---|
| AUTH readiness | **30%** | Login/sesión sólidos; signup, callback y recovery ausentes. |
| BUSINESS CREATION readiness | **10%** | Hay resolver y tooling admin, no alta ni ownership self-service. |
| POS INITIALIZATION readiness | **90%** | RPC idempotente, trial/eventos y consumidores integrados; falta orquestarla con el alta. |
| ONBOARDING readiness | **70%** | Wizard y persistencia reales; no fuerza entrada y separa operación en Settings. |
| FIRST SALE readiness | **80% condicional** | Retail funciona tras configuración; desde cero aún exige varios pasos manuales. |
| SELF-SERVICE overall readiness | **25%** | Dos blockers de entrada impiden probar el producto sin intervención. |

## 19. Blockers y prioridades

### P0 — impiden o comprometen el alta

| ID | Blocker | Evidencia | Impacto | Dificultad |
|---|---|---|---|---|
| ENTRY-P0-1 | No existe signup | Sólo `signInWithPassword` en `/login`; no hay `/signup`. | Un prospecto no puede crear cuenta. | M |
| ENTRY-P0-2 | No existe creación self-service de brand | Workspace cliente no ofrece CTA/API; `new-analysis` es admin/ORION. | Usuario nuevo no obtiene tenant. | L |
| ENTRY-P0-3 | No existe autoasignación owner segura | `user_brand_access` se escribe sólo desde Access Center admin. | La brand no sería accesible por su creador. | M |
| ENTRY-P0-4 | No hay transacción canónica de alta | Brand/access/POS/defaults viven en operaciones separadas y hay tres fuentes de brand. | Fallas parciales pueden dejar tenant huérfano o inconsistente. | XL |
| ENTRY-P0-5 | Autoridad de brand para self-service no está formalizada | `brand-resolver` consulta `clients`, `brand_analysis`, `cosmos_memory`. | No se puede diseñar constraint de slug/ownership sin decisión de fuente de verdad. | M |

### P1 — fricción seria

| ID | Issue | Impacto | Dificultad |
|---|---|---|---|
| ENTRY-P1-1 | Sin recuperación/reset de contraseña | Usuarios bloqueados requieren soporte. | S/M |
| ENTRY-P1-2 | Callback/confirmación de email no implementado | La política Supabase puede cortar o hacer confusa la prueba. | M |
| ENTRY-P1-3 | `onboardingRequired` no gobierna routing | Un usuario puede entrar a módulos antes de configurar perfil. | S |
| ENTRY-P1-4 | Wizard no crea sucursal/caja | Dos formularios adicionales antes de cobrar. | M |
| ENTRY-P1-5 | No hay CTA directo a “primer producto” al completar onboarding | El siguiente paso depende de descubrir la checklist/home. | XS |
| ENTRY-P1-6 | Usuario autenticado que abre `/login` vuelve a landing | Reanudación menos directa. | XS |

### P2 — polish

- sugerencia y preview de slug antes de confirmar;
- progreso compacto “cuenta → negocio → producto → primera venta”;
- checklist celebratoria de primera operación;
- instrumentación de abandono por etapa;
- prellenado de ubicación principal con timezone/moneda, siempre editable.

## 20. Flujo ideal Retail

```text
Landing
  ↓ Probar Cometa POS gratis
/signup?product=pos
  ↓ email + contraseña (o confirmación + callback)
/start/pos
  ↓ nombre del negocio + slug sugerido + Fashion/Retail
operación transaccional server-side
  ├─ brand canónica
  ├─ owner access para auth.uid()
  ├─ pos_initialize_brand_setup (trial 15 días)
  └─ ubicación principal + Caja 01 (defaults explícitos)
  ↓
/brand/[slug]/pos/onboarding
  ↓ confirmar giro/capabilities + identidad mínima
/brand/[slug]/pos/products?first=1
  ↓ crear primer producto
/brand/[slug]/pos/inventory
  ↓ recibir inventario
/brand/[slug]/pos/cash
  ↓ abrir caja
/brand/[slug]/pos/register
  ↓ primera venta
```

Para minimizar pasos, nombre de negocio y giro se capturan una sola vez. El wizard debe reutilizarlos, no pedirlos de nuevo. La ubicación principal y Caja 01 pueden crearse con defaults seguros (MX, zona horaria seleccionada/inferida y tax rate explícitamente confirmado), y editarse después.

## 21. Plan propuesto: ENTRY V1 — Self-Service Registration & Business Creation

Este plan es propuesta, no implementación. Requiere primero una decisión explícita sobre la autoridad canónica de brand.

### Fase A — contrato y base de datos

Archivos propuestos:

1. `supabase/migrations/202608xx_pos_entry_v1_self_service_business.sql`
   - RPC transaccional service-role-only para crear/reanudar una brand self-service;
   - constraint real de slug en la tabla canónica confirmada;
   - idempotency key tenant-creation scoped;
   - owner access ligado al usuario autenticado/verificado por el servidor;
   - llamada a `pos_initialize_brand_setup` sin duplicar su lógica;
   - defaults de ubicación/caja sólo si la política fiscal/timezone queda aprobada.
2. `supabase/tests/pos_entry_v1_self_service_business_postflight.sql`.
3. `supabase/tests/pos_entry_v1_self_service_business_suite.sql`.

Pruebas mínimas: slug collision, retry, concurrency, user isolation, owner assignment, trial_started único, rollback completo ante fallo, brand existente no reclamable, misma key/payload replay, key/payload conflict y defaults operativos.

### Fase B — auth y orquestación server-side

Archivos propuestos:

4. `src/app/signup/page.tsx` — signup POS y estados de confirmación.
5. `src/app/auth/callback/route.ts` — intercambio de código y redirect allow-listed.
6. `src/app/forgot-password/page.tsx` y `src/app/reset-password/page.tsx` — recuperación.
7. `src/app/start/pos/page.tsx` — nombre, slug sugerido y `fashion|retail`.
8. `src/app/api/pos/self-service/route.ts` — autentica sesión, ignora IDs/roles del browser, llama la RPC y devuelve el destino.
9. `src/lib/pos/self-service.ts` — contratos/validadores compartidos, sin duplicar reglas SQL.

### Fase C — conducción aditiva

Archivos a modificar después de cerrar backend:

10. `src/app/login/page.tsx` — enlaces signup/recovery y retorno correcto.
11. `src/app/workspace/page.tsx` — empty state con “Crear negocio” para clientes sin brand.
12. `src/app/brand/[brandSlug]/components/pos-shell.tsx` — dirigir `unconfigured` al onboarding, preservando subscription/activation.
13. `src/app/brand/[brandSlug]/pos/onboarding/page.tsx` — CTA final directo a primer producto; evitar recaptura de datos.
14. `src/app/page.tsx` — sólo al final, CTA primario “Probar Cometa POS gratis”.

### Riesgos y decisiones previas

1. **Fuente de verdad de brand:** confirmar schema/constraints de `clients` y decidir si será autoridad self-service; no escribir en las tres tablas.
2. **Atomicidad Auth vs DB:** Supabase Auth no comparte transacción con Postgres de negocio. El alta debe ser reanudable: cuenta confirmada primero, luego operación DB idempotente.
3. **Defaults fiscales:** no asumir IVA, timezone o precios con impuesto sólo por país; pedir/confirmar lo mínimo.
4. **Email:** verificar configuración real de Supabase Auth y dominios de redirect antes del release.
5. **Abuso:** rate limits, captcha/bot protection y límites de creación por usuario requieren política de lanzamiento.
6. **Compatibilidad:** conservar login/workspace/Access Center para clientes administrados y multi-brand.

## Conclusión

La inversión para self-service debe concentrarse en ENTRY V1, no en rehacer POS. Una vez creada una cuenta, brand y relación owner de forma segura, el repositorio ya dispone de inicialización POS idempotente, trial automático, onboarding operativo, configuración de sucursal/caja y el flujo Retail. El criterio de salida correcto es que un email nuevo llegue a su primer producto sin intervención administrativa y que cualquier retry deje exactamente una brand, un owner, una subscription y un evento `trial_started`.
