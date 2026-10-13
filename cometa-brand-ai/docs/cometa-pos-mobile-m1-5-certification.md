# COMETA POS Mobile M1.5 — certificación local

Fecha: 2026-10-02. Commit certificado: `78a5998d33317e1e91f79b4952a481263eafca42`.

## Estado y alcance

**Certificación local COMPLETA. Rollout remoto PENDIENTE de identificar el destino y revisar su schema.**

Se certificó el código del commit mediante HTTP real contra Next.js, Supabase Auth y PostgREST locales y PostgreSQL persistente con fixtures sintéticos. No se utilizaron datos de Macca. No se modificó código de aplicación, migraciones ni archivos previos del working tree. Este informe es el único archivo nuevo fuera de `.next`. No hubo commit, push, deploy, instalación de paquetes ni M2.

## Entornos identificados

| Entorno | Evidencia | Resultado |
| --- | --- | --- |
| LOCAL compartido | `.env.local`: `http://127.0.0.1:54321`; Docker `supabase_db_zhtagqrzyovsrmsicaot` | Destino local confirmado. Su base `postgres` sigue sin `pos_devices`; no se le aplicó M1. |
| LOCAL certificación | Base nueva `food_integration_20261002183632530` en ese contenedor; gateway `127.0.0.1:58130`; Next `127.0.0.1:3105` | M1 persistido y certificado. Auth/PostgREST de prueba detenidos al finalizar. |
| PREVIEW/TEST remoto | `.env.vercel.local` contiene etiquetas `preview`, sin URL HTTP utilizable de Supabase | Captura local insuficiente para identificar un deployment actual. |
| PRODUCTION | CLI enlazado a referencia `zhtagqrzyovsrmsicaot`; falta confirmar URL desplegada del piloto y su configuración efectiva | La referencia enlazada no acredita entorno ni destino del POS desplegado. No consultado/migrado remotamente. |

El sufijo compartido entre el contenedor y la referencia del CLI no convierte una conexión loopback en una conexión remota. Las herramientas de certificación fijaron el socket Docker local y una base sintética explícita, sin fallback remoto.

## Migraciones

Orden obligatorio:

1. `20261002120000_pos_device_foundation_v1.sql`.
2. `20261002121000_pos_mutation_api_boundary_v1.sql`.

La primera depende de `auth.users`, `brands`, `pos_locations`, `pos_staff`, `pos_staff_sessions`, `pos_business_profiles` y del contrato `pos_food_actor_v1(text,uuid,uuid) RETURNS pos_staff`. Se comprobó su compatibilidad contra el esquema reconstruido del commit. Crea terminales, agrega el vínculo de sesión, triggers y revocación atómica, y sustituye el actor Food preservando el contrato. No es repetible sin historial de migraciones: sus CREATE/ADD COLUMN se ejecutan una sola vez. La RPC de revocación sí es idempotente.

La segunda modifica ACL de 13 familias RPC y 20 tablas POS. Se verificó la presencia de las 13 familias y la ausencia de EXECUTE para anon/authenticated. La repetición de esta migración fue exitosa. Conserva el acceso backend; no cambia políticas SELECT/RLS existentes. `TRUNCATE` aparece como permiso revocado, no como operación ejecutada.

No hay DROP/TRUNCATE de datos en las migraciones M1. Una comparación antes/después confirmó que las ACL/RLS de tablas COMU y definiciones/ACL de sus funciones permanecieron iguales. No se ejecutó un E2E COMU ni se certificaron consumidores externos desconocidos.

## Resultados

### E2E HTTP real: PASS

- Cuenta Supabase sintética → marca Food autorizada → terminal enrolada → PIN → sesión vinculada al dispositivo → creación de mesa permitida.
- Enrolamiento anónimo: 401. Credencial HttpOnly/SameSite=Lax; la base conserva un hash de 64 caracteres.
- Terminal enrolada sin PIN: 401. Operador desconocido: 404. PIN incorrecto: 401.
- ADMIN puede entrar en modo administrativo y operar Food.
- Cambio de operador conserva la cuenta anfitriona y el dispositivo.
- WAITER puede crear un cliente; inventario con `role=ADMIN`, permiso y staffId falsificados: 403.
- KITCHEN no puede crear un cliente: 403.
- Mutación API anónima: 401. Marca ajena y membresía revocada: 403.
- Escritura directa de clientes vía PostgREST rechazada tanto con anon como con JWT autenticado.
- Desenrolado propio: terminal REVOKED, cero sesiones PIN activas y orden de limpiar contexto local; cookies operativas eliminadas.
- Terminal revocada sin cookie y replay de credenciales previas: 403 `POS_DEVICE_REVOKED`.
- Logout anfitrión: limpieza de cookies/contexto y acceso posterior 401.
- POS-only con una marca → `/brand/[slug]/pos`; acceso OS activo → `/workspace`; `next` interno válido respetado.

### PostgreSQL: 18/18 PASS

Incluye RLS, privilegios, unicidad de vínculo por sesión Supabase, identidad inmutable, aislamiento host/brand/branch, operador global limitado a la sucursal de terminal, revocación atómica e idempotente, rechazo de operación/sesión nueva/reactivación tras revocación.

### Pruebas dirigidas: 23/23 entradas Node PASS

Comando ejecutado desde la copia aislada del commit:

```text
node --test scripts/test-pos-mobile-m1.mjs scripts/test-pos-food-access-server-v1.mjs scripts/test-workspace-empty-routing-v1.mjs scripts/test-pos-offline-foundation-v1.mjs
```

Las suites incluyen los cinco roles, lockout de cinco intentos/cinco minutos, routing, server-only/import graph, limpieza de IndexedDB/cache, aislamiento de identidades y prohibición de fallback offline ante 401/403. El harness Food con `staff-shared` pasó.

La limpieza de almacenamiento del navegador y el service worker se verificaron por las pruebas dirigidas, no mediante navegador interactivo. El E2E descrito es HTTP, no una certificación visual/UI ni Android/iOS. No se repitió la batería completa de 72 pruebas ni TypeScript/build: no cambió código de aplicación.

## Reproducción y artefactos locales

Se extrajo el commit con `git archive` a `.next/m1-certification/source`, con junction a dependencias ya instaladas. No se copiaron `.env` ni cambios sin commit. Los JWT de prueba se generaron en memoria para servicios locales; no se incluyeron credenciales en este informe.

Artefactos temporales, ignorados por Git:

- `.next/m1-certification/source/certify-http.mjs`: harness HTTP derivado del existente, casos específicos M1.
- `.next/m1-certification/source/postcheck.mjs` y `postgres-result.txt`: comprobaciones SQL y evidencia.
- `.next/m1-certification/source/certification-next.log`: log Next local.
- `bootstrap-m1.mjs`, `resume-schema.mjs`, `build-http.mjs`, `http-cases.txt`: preparación local y casos.

La reproducción completa desde cero encontró problemas del harness histórico: CRLF/BOM del SQL, política Storage ya copiada por schema-only dump y necesidad de transacción en una migración histórica. Se resolvieron únicamente en los scripts temporales, sin editar los SQL del repo. El fixture de membresía incorporó un segundo owner para respetar `POS_LAST_OWNER_REQUIRED`; el fixture SQL Auth utilizó el rol local de bootstrap tras asignar ownership a Auth. Las expectativas de redirección aceptan el Location relativo correcto de Next. Ninguno de estos ajustes modificó M1.

Quedan conservadas las bases locales de bootstrap incompleto `food_integration_20261002183036120` y `food_integration_20261002183147749`, además de la base certificada. No se borraron automáticamente. Son fixtures locales, no copias de datos de clientes. La preparación reprodujo el esquema histórico en bases nuevas; no modificó objetos COMU de bases existentes.

## Condiciones para Production

La certificación local no requiere migrar Production. No se emite aprobación incondicional `READY FOR PRODUCTION MIGRATION`: falta identificar el deployment del piloto y su Supabase efectivo, y comprobar drift/historial remoto. No se presupone que Production tenga el mismo schema local.

Antes de solicitar autorización de escritura:

1. Confirmar URL del POS, deployment/entorno y referencia Supabase efectiva sin revelar secretos.
2. Comparar historial y objetos dependientes, incluidas firmas RPC, ACL, roles, tablas y columnas. Evitar aplicar otras migraciones pendientes junto con M1.
3. Asegurar backup/recuperación y ventana controlada. Aplicar exclusivamente las dos migraciones indicadas, en orden, tras autorización explícita.
4. El schema M1 debe existir antes de desplegar su código: `requirePosContext` consulta `pos_devices` también en sesiones web legacy y falla cerrado si falta.
5. Repetir smoke con fixtures autorizados: enrollment/PIN/operación, denegaciones, revocación, logout, routing POS-only/OS y comportamiento web legacy; verificar permisos y logs sin secretos.

Impacto esperado: tablas/metadatos de terminal y revocación; cliente obligado a usar las APIs para las escrituras POS protegidas. Riesgos: consumidores directos no identificados, drift remoto y locks breves de DDL. No se demostró un rollback inverso completo; cada migración es transaccional. Si falla una, detener el rollout y comprobar cuál quedó registrada. Ante fallo posterior, priorizar bloqueo controlado/forward-fix manteniendo revocaciones y ACL, sin reabrir privilegios ni eliminar tombstones para recuperar servicio. Un rollback de aplicación requiere revisar compatibilidad; no debe asumirse que código anterior respeta dispositivos revocados.

## M2

**Sí puede comenzar desarrollo local contra el entorno certificado, tras la instrucción correspondiente.** La foundation pasó seguridad y recorrido HTTP sin migrar Production. Habilitar una app contra el piloto remoto requiere primero resolver los pendientes anteriores. No se inició M2 ni se instaló Capacitor.
