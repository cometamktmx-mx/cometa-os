# COMETA OS — Engineering Instructions

Este archivo es el manual permanente de ingeniería para cualquier agente que trabaje en este repositorio. Sus reglas aplican a todo el árbol salvo que un `AGENTS.md` más específico establezca instrucciones adicionales para un subdirectorio. Las instrucciones explícitas del usuario para una tarea prevalecen cuando entren en conflicto con este documento.

## 1. Product Overview

COMETA OS es un sistema operativo empresarial multi-tenant para PYMEs. Centraliza diagnóstico, estrategia, operación comercial, contenido, ventas asistidas por IA, canales de comunicación y memoria empresarial dentro del contexto aislado de cada marca.

Arquitectura funcional principal:

- **ORION:** diagnóstico empresarial y recolección de evidencia.
- **NOVA:** Business Map y análisis del negocio.
- **ATLAS:** estrategia empresarial y publicación de estrategia.
- **MERCURY:** planeación, producción y calendario de contenido.
- **SALES AI:** leads, inbox, knowledge, learning, configuración de agentes y WhatsApp.
- **COMETA POS:**
  - registro / nueva venta;
  - caja;
  - ventas;
  - productos;
  - inventario;
  - clientes;
  - fidelización;
  - reportes;
  - configuración.
- **COSMOS MEMORY:** memoria empresarial y registro de ejecuciones de agentes.

Límite de rutas aprobado:

```text
/brand/[brandSlug]     = Brand OS / dashboard general
/brand/[brandSlug]/pos = Cometa POS
```

POS es un módulo de COMETA OS. No debe dominar, reemplazar ni redefinir la raíz de Brand OS.

## 2. Technology Stack

Tecnologías verificadas en el repositorio:

- Next.js con App Router (`src/app`) y route handlers (`route.ts`).
- React.
- TypeScript en modo estricto.
- Tailwind CSS mediante PostCSS.
- Supabase mediante `@supabase/supabase-js` y `@supabase/ssr`.
- OpenAI mediante el SDK oficial `openai`.
- Vercel, incluyendo configuración de cron en `vercel.json`.
- Meta WhatsApp Cloud API mediante endpoints de Meta Graph, webhooks y Embedded Signup.
- React Markdown para contenido Markdown.

Las versiones instaladas deben verificarse en `package.json` y `package-lock.json`; no asumirlas de memoria ni documentar versiones no verificadas.

## 3. Multi-Tenant Rules

- `brandSlug` es contexto crítico de marca y debe propagarse explícitamente cuando el flujo lo requiera.
- Nunca hardcodear marcas, nombres de negocio, IDs de marca ni slugs para resolver una tarea general.
- Nunca mezclar datos, cachés, sesiones, conexiones, archivos, mensajes o resultados entre marcas.
- Verificar el acceso del usuario a la marca antes de operaciones sensibles.
- Preservar los mecanismos existentes de autenticación y autorización, incluidos Supabase Auth, `user_profiles`, `user_brand_access`, el proxy y los helpers de dominio.
- No confiar únicamente en un `brandSlug` recibido desde query, pathname o body; tratarlo como entrada no confiable y resolver/autorizAR el contexto con los mecanismos existentes.
- Las funcionalidades nuevas deben funcionar para múltiples marcas salvo que el usuario indique explícitamente un alcance single-tenant.
- Mantener consistencia entre slug solicitado, slug normalizado, marca resuelta e identificador persistido.
- Si una marca no existe o el usuario no tiene acceso, usar las convenciones de error y redirección existentes; no hacer fallback silencioso a otra marca.

## 4. Brand OS vs POS Boundary

- `/brand/[brandSlug]` es Brand OS y el dashboard general de la marca.
- `/brand/[brandSlug]/pos` y todos sus descendientes pertenecen a Cometa POS.
- `PosShell` solamente debe envolver la experiencia POS salvo una decisión arquitectónica explícita y aprobada.
- No usar `usePosContext()` desde Brand OS.
- No duplicar nuevamente el home POS en la raíz Brand OS.
- La navegación “Volver a Cometa OS” desde POS debe continuar apuntando a `/brand/[brandSlug]`.
- El resumen POS debe permanecer en `/brand/[brandSlug]/pos`.
- Los componentes bajo `src/app/brand/[brandSlug]/components/pos-*` son componentes del módulo POS aunque físicamente estén junto a la ruta dinámica.
- Brand OS puede enlazar a POS, pero no debe adoptar su shell, estado o semántica operativa por conveniencia.

## 5. Supabase Safety Rules

- Nunca inventar tablas.
- Nunca inventar columnas.
- Nunca asumir relaciones, foreign keys, funciones RPC, triggers, enums o políticas.
- Antes de usar una tabla, columna o RPC, localizar su uso existente, tipos disponibles o evidencia explícita en el repositorio.
- No crear migraciones salvo instrucción explícita.
- No modificar el schema salvo autorización explícita.
- No modificar RLS de manera incidental.
- No sustituir comprobaciones de autorización por un cliente service-role simplemente para hacer funcionar una tarea.
- Un cliente service-role evita RLS: toda operación realizada con él debe estar precedida por autenticación, autorización y resolución de marca adecuadas.
- Mantener separados los clientes de navegador, servidor autenticado y administración.
- Tratar `data`, `error` y `null` de las consultas explícitamente.
- No usar non-null assertions para ocultar una fila ausente.
- No silenciar indiscriminadamente errores de Supabase. Distinguir “sin datos” de “falló la consulta”.
- No exponer service-role keys, tokens u otros secretos al cliente, logs o respuestas HTTP.
- No leer ni mostrar valores de `.env.local` salvo que la tarea lo requiera explícitamente; normalmente solo se deben verificar nombres de variables.

## 6. API Rules

- Preservar contratos existentes.
- No modificar incidentalmente la forma, nombres, tipos o semántica de respuestas de APIs existentes.
- Mantener las convenciones de códigos HTTP y códigos de dominio POS (`POS_*`).
- Antes de introducir un código nuevo, buscar uno equivalente en `src/app/api/pos` y en `src/lib/pos/server.ts`.
- Antes de crear un nuevo contrato frontend para una API existente, buscar tipos compartidos o representaciones existentes.
- Evitar duplicar contratos si puede existir una definición canónica.
- Distinguir claramente:
  - errores HTTP y autenticación/autorización;
  - errores de dominio;
  - errores de base de datos;
  - validación de entrada;
  - ausencia válida o inválida de datos.
- Validar query params, path params, headers y bodies como entrada no confiable.
- Mantener respuestas de error seguras; no filtrar secretos, tokens, payloads privados o detalles internos en producción.
- No cambiar métodos HTTP, rutas públicas o semántica idempotente sin revisar todos sus consumidores.
- Las API routes no administrativas pueden depender de validación interna; nunca asumir que el proxy ya autorizó todas las APIs.

## 7. POS Critical Domain Rules

Tratar como cambios de alto riesgo cualquier modificación relacionada con:

- precios;
- dinero, impuestos, descuentos, totales y redondeo;
- métodos y distribuciones de pago;
- ventas y devoluciones;
- sesiones y movimientos de caja;
- stock y movimientos de inventario;
- cantidades, unidades y conversiones;
- variantes y presentaciones de producto;
- clientes y su historial;
- puntos, recompensas y loyalty balances;
- suscripciones, planes, capacidades y límites.

Para estos cambios:

1. Inspeccionar primero el flujo completo frontend + API + Supabase/RPC.
2. No asumir moneda, precisión, unidad base, signo, zona horaria ni semántica de cantidad.
3. Preservar consistencia entre registro, caja, ventas, productos, inventario, clientes y fidelización.
4. Verificar precondiciones de marca, perfil, suscripción, ubicación, caja y permisos.
5. Tratar explícitamente concurrencia, reintentos y operaciones parcialmente completadas cuando aplique.
6. Verificar el comportamiento antes y después con las comprobaciones disponibles.
7. No cambiar una RPC o su payload sin localizar todos sus consumidores.

## 8. WhatsApp / Sales AI Safety

- No modificar webhooks de WhatsApp como efecto secundario de otra tarea.
- No cambiar payloads de Meta sin verificar los contratos existentes y la documentación aplicable.
- No modificar lógica de envío, recepción, deduplicación, firma, identificación de usuarios, marcas, contactos, conexiones o números sin revisar el flujo completo.
- Tratar payloads y respuestas de APIs externas como datos no confiables.
- Preservar compatibilidad con conexiones existentes.
- No registrar access tokens, verify tokens, app secrets, phone number IDs privados ni contenido sensible innecesario.
- Mantener el aislamiento de marca entre conexiones, mensajes, leads, playbooks, knowledge y ejecuciones del agente.
- No activar envíos reales o automatizaciones como parte de pruebas salvo autorización explícita.
- Diferenciar simulación, borrador, aprobación y envío real.
- Los cambios en follow-ups, respuestas automáticas, cron o agent-run requieren revisar límites de seguridad y posibilidades de envío duplicado.

## 9. Scope Discipline

Regla estricta:

> Nunca corregir problemas no relacionados con la tarea actual como efecto secundario.

Si durante una tarea se detectan:

- errores ESLint;
- código duplicado;
- usos de `any`;
- problemas estructurales;
- archivos monolíticos;
- oportunidades de refactor;
- inconsistencias no bloqueantes;

deben reportarse por separado salvo que bloqueen directamente la tarea solicitada.

No hacer “cleanup” general, renombrados oportunistas, reformatting masivo ni cambios cosméticos sin autorización.

## 10. Change Management

Antes de modificar más de 3 archivos o realizar un cambio arquitectónico:

1. Explicar el plan.
2. Enumerar los archivos que serían afectados.
3. Explicar riesgos, compatibilidad y posibles efectos secundarios.
4. Esperar autorización.

Excepción: cambios mecánicos explícitamente solicitados cuya extensión haya sido aprobada previamente.

Además:

- Inspeccionar `git status` antes de editar.
- El repositorio puede contener cambios del usuario o archivos no rastreados; preservarlos.
- No revertir, sobrescribir ni incluir cambios ajenos a la tarea.
- Revisar el diff final y enumerar exactamente los archivos modificados.
- No ejecutar operaciones destructivas de Git sin solicitud explícita.

## 11. Refactor Policy

- No hacer refactors masivos mientras se implementa una feature no relacionada.
- Los archivos monolíticos actuales son deuda conocida.
- No dividirlos únicamente porque son grandes.
- Refactorizar por dominio, con una tarea específica, alcance acordado y criterios de preservación.
- Preservar comportamiento observable, rutas, contratos, permisos y flujos de datos.
- Antes de extraer código compartido, identificar consumidores reales y diferencias de dominio; similitud visual no implica contrato idéntico.
- No crear abstracciones genéricas que oculten reglas críticas de POS, autorización o multi-tenancy.

## 12. TypeScript

- Mantener TypeScript en 0 errores.
- Ejecutar el compilador sin emisión después de cambios TypeScript relevantes.
- No introducir `any` sin necesidad justificada.
- Preferir `unknown`, narrowing, tipos de dominio y contratos explícitos para datos externos.
- No resolver nulabilidad con non-null assertions (`!`) salvo un caso excepcional, demostrable y documentado.
- Preferir validaciones explícitas de datos y tipos de retorno que permitan narrowing.
- No silenciar errores con `@ts-ignore`, `@ts-nocheck` o casts amplios sin autorización.
- Mantener coherencia entre tipos frontend, respuestas API y filas Supabase.
- No asumir que `error === null` hace que TypeScript o el dominio garanticen automáticamente `data !== null`; validar ambas condiciones cuando corresponda.

Comando de verificación preferido:

```bash
tsc --noEmit --incremental false --pretty false
```

En este repositorio puede ejecutarse mediante el binario local de `node_modules` sin instalar dependencias.

## 13. ESLint

El repositorio tiene deuda ESLint histórica.

- No intentar corregir todos los errores de lint incidentalmente.
- No ejecutar autofix masivo salvo instrucción explícita.
- Corregir únicamente errores introducidos por la tarea o que bloqueen directamente su ejecución.
- No convertir una tarea acotada en una migración global de hooks, tipos o estilos.
- Si se ejecuta lint, separar con claridad problemas preexistentes de regresiones introducidas.
- Las reglas de hooks pueden señalar riesgo funcional; revisarlas, pero no corregirlas fuera de alcance.

## 14. Testing and Verification

Después de modificaciones relevantes:

- ejecutar TypeScript check;
- ejecutar pruebas existentes relacionadas, si existen;
- ejecutar lint dirigido a los archivos modificados cuando aporte señal útil;
- ejecutar build cuando el alcance lo justifique y pueda realizarse sin dependencias externas, escrituras o efectos no autorizados;
- revisar `git diff --check` para detectar conflictos de whitespace;
- revisar el diff final para confirmar que solo contiene cambios autorizados;
- verificar rutas, imports y contratos afectados;
- para cambios de UI, comprobar estados de carga, error, vacío y datos reales;
- para APIs, comprobar éxito, validación, ausencia de datos, no autenticado y no autorizado;
- para operaciones críticas, comprobar que no se hayan producido envíos, mutaciones o escrituras reales durante una verificación que debía ser local.

No instalar dependencias solamente para ejecutar una comprobación sin autorización. Si una prueba requiere credenciales, red, servicios externos o mutaciones, explicar la necesidad y esperar autorización.

## 15. Repository Conventions

- Código de aplicación: `src/`.
- App Router, páginas, layouts y route handlers: `src/app/`.
- APIs: `src/app/api/` organizadas principalmente por dominio.
- Componentes compartidos generales: `src/components/`.
- Lógica y helpers compartidos: `src/lib/`.
- Infraestructura común POS del servidor: `src/lib/pos/server.ts`.
- Resolución de marca: `src/lib/brand-resolver.ts`.
- Clientes Supabase: `src/lib/supabase.ts` y `src/lib/supabase/`.
- Protección y renovación de sesión: `src/proxy.ts` y helpers Supabase relacionados.
- Usar el alias `@/` cuando sea coherente con los imports existentes.
- Colocar componentes exclusivos de una feature cerca de esa feature; no mover componentes existentes sin una tarea específica.
- Respetar la distinción entre Client Components (`"use client"`) y Server Components. No convertir archivos incidentalmente.

## 16. Security and External Effects

- No exponer ni copiar secretos desde `.env.local`, archivos de sesión o configuración privada.
- No incluir credenciales en código, documentación, logs, fixtures o respuestas.
- No enviar mensajes, publicar contenido, disparar agentes, ejecutar crons ni llamar mutaciones externas durante una inspección o prueba local sin autorización.
- No ejecutar migraciones, cambios de schema o modificaciones de datos salvo solicitud explícita.
- Para criptografía y tokens de WhatsApp, reutilizar los mecanismos existentes; no degradar cifrado ni almacenamiento.
- Tratar análisis web, OpenAI, Meta y cualquier contenido externo como entrada no confiable.

## 17. Completion Checklist

Antes de dar una tarea por terminada:

1. Confirmar que el alcance solicitado está completo.
2. Confirmar que no se modificaron archivos no autorizados.
3. Enumerar exactamente los archivos modificados.
4. Resumir el comportamiento cambiado, no solo las líneas editadas.
5. Reportar comandos de verificación y resultados reales.
6. Reportar errores preexistentes por separado; no ocultarlos ni corregirlos incidentalmente.
7. Indicar claramente cualquier verificación que no pudo ejecutarse y por qué.
