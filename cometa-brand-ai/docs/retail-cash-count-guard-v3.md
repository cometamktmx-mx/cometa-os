Caja Retail: vigencia del conteo y candidato de publicación

Continuación de `508cbc5` en `feature/retail-cash-handover-release-20261102`. Sin despliegue, acceso a producción ni corrección de cortes históricos. QZ permanece separado. Next 16.4.4 y el build webpack no cambian.

**Fallo demostrado.** En PostgreSQL aislado, `508cbc5` permitió guardar contado500 después de registrar un cobro cash100 sobre apertura500: persistió esperado600 y diferencia−100. No había una referencia al inicio del conteo. La reproducción se conserva en [before-508cbc5.json](../../verification/retail-cash-count-v3/before-508cbc5.json).

**Comportamiento corregido.** Antes de habilitar la captura, la pantalla llama `start-count`. El servidor crea un UUID opaco que identifica turno, anfitrión, operador/PIN y revisión interna de actividad. Devuelve únicamente `countId`, `cashSessionId` y `startedAt`: no devuelve revisión, esperado, importes ni diferencias. El cajero sigue sin recibir el desglose monetario del turno abierto. La supervisión explícita autorizada por el PIN conserva su funcionamiento.

Cada modificación que afecta el efectivo —pagos cash de venta, pagos cash de órdenes y movimientos manuales— cambia una revisión privada mediante triggers. Los cambios y el cierre usan el mismo bloqueo de fila de caja. Se contemplan también cambios/eliminaciones de pagos y reasignaciones de ventas; las operaciones cerradas no aceptan modificaciones de efectivo. Un anticipo cash puede generar pago y depósito ligado: ambos cambios invalidan el conteo, pero el cálculo monetario continúa usando la fuente canónica una sola vez. La revisión es técnica, no se interpreta como número de cobros ni como importe.

Al confirmar, el servidor bloquea caja y turno, valida el PIN y compara la revisión con la capturada. Si cambió, responde `409 POS_CASH_CHANGED_RECOUNT_REQUIRED` antes de guardar cierre, diferencia, asignación, reserva, documento o solicitud financiera. La respuesta solo pide recontar, sin revelar cuánto cambió ni cuál es el esperado. La pantalla descarta contado, reserva y token, vuelve al inicio y exige una acción explícita de recuento. No actualiza silenciosamente el token conservando los valores viejos. Un PIN distinto o una nueva sesión PIN requieren otro inicio de conteo.

No se pausa automáticamente el cobro mientras se cuenta. Se detecta su cambio y se rechaza el borrador desactualizado; el equipo debe seguir coordinando el corte físico. Un movimiento neto cero también invalida el conteo: comparar únicamente el esperado no habría detectado ese caso. Los pagos no efectivos no cambian el dinero físico ni se añaden al esperado cash. Ningún control de software demuestra un cambio físico que nunca se registró.

**Reintentos y atomicidad.**

- Reintentar `start-count` con la misma clave devuelve el token original, aunque haya cambiado la caja; no lo transforma en un conteo nuevo.
- Reintentar un cierre rechazado con su token viejo sigue fallando y no crea una solicitud financiera guardada.
- Tras un recuento explícito se usa un token nuevo y una nueva solicitud de cierre.
- Una respuesta de red incierta conserva el borrador y su clave, para poder recuperar el resultado original. Un cierre ya confirmado se recupera antes de comprobar el estado actual del token; el motor sigue validando anfitrión, operador, acción y payload completo. No cierra ni reserva dos veces.
- Los cobros/abonos/movimientos reintentados con su clave previa no insertan otra operación ni cambian otra vez la revisión. Por eso tampoco invalidan un recuento posterior si solo se recupera el resultado de una operación anterior.

**Migración y turno abierto.** Se añade [20261103020000_pos_retail_cash_count_guard_v3.sql](../supabase/migrations/20261103020000_pos_retail_cash_count_guard_v3.sql) después de la migración de asignación `20261103010000`. Esta última no se reescribe. La nueva columna de revisión tiene default técnico0; no hay UPDATE/backfill de importes ni de documentos históricos. Los registros de conteo viven en una tabla privada con RLS y sin lectura directa del navegador/service_role. Solo las RPC autorizadas operan sobre ellos. El motor de asignación v2 queda interno sin ejecución directa service_role para que el cierre Retail no eluda el control nuevo.

El ensayo preparó un turno ABIERTO antes de AMBAS migraciones con apertura500 y una venta cash100. Después de aplicar los dos archivos, su apertura, estado, fechas e importes seguían idénticos; inició conteo y cerró correctamente con contado600, reserva500 y entrega100, diferencia0. Los componentes de apertura no registrados permanecieron NULL en el documento, sin inferir origen ni aporte. Se compararon también todos los balances y snapshots históricos sintéticos previos: permanecieron iguales.

El contrato `pos_retail_cash_contract_v2()` ahora devuelve3. La aplicación comprueba esa versión antes de abrir, iniciar conteo o cerrar; una base sin las dos migraciones se rechaza antes de la operación financiera. Los snapshots de ticket siguen en formato v2 y las reimpresiones antiguas conservan su documento; no necesitan iniciar un conteo.

Listado exacto desde508cbc5: [changed-files-from-508cbc5.txt](../../verification/retail-cash-count-v3/changed-files-from-508cbc5.txt).

**Resultados.**

| Verificación | Resultado |
|---|---|
| Reproducción anterior a la corrección | Conteo desactualizado aceptado en508cbc5, demostrado solo con datos sintéticos |
| Ensayo completo PostgreSQL y compatibilidad de turno abierto | 37 comprobaciones aprobadas |
| Regresión de asignación/reserva/recepción y rollback de documento | 34 aserciones aprobadas, ROLLBACK |
| Regresión de carreras, abonos y consumo de reservas | 16 comprobaciones aprobadas |
| API, permisos, errores409 y ocultación de importes | 14 tests aprobados |
| Reacción del frontend a409 y fallo de red | 3 tests aprobados |
| Regresión de ticket/reimpresión y transporte simulado | 11 tests aprobados |
| PIN, roles y sesiones | 9 tests aprobados |
| Reportes, guardas y navegación | Suites existentes aprobadas |
| TypeScript, ESLint dirigido y build webpack | Sin errores |

El ensayo de37 cubre cobro100 durante conteo500; activación y abono efectivo de órdenes; entradas, depósitos, gastos y retiros; par de movimientos neto cero; reintentos de inicio, cierre, cobro y abono; doble cierre simultáneo; cobro confirmado mientras el cierre espera; inicio de conteo que espera a un cobro en curso; cierre que gana a un movimiento tardío; token de otro PIN; y bloqueo de accesos directos.

En navegador real con Auth/PIN local: inicio de conteo500 → cobro100 por API → cierre rechazado409 sin esperado → campos vacíos y conteo nuevo → contado600/reserva500 → cierre con diferencia0 y entrega100. Capturas: [rechazo sin esperado](../../verification/retail-cash-count-v3/01-caja-cambio-recontar-sin-esperado.png), [campos vacíos](../../verification/retail-cash-count-v3/02-conteo-nuevo-campos-vacios.png), [cierre correcto](../../verification/retail-cash-count-v3/03-cierre-tras-recuento-correcto.png). [Respuesta HTTP](../../verification/retail-cash-count-v3/http-evidence.json) y logs quedan en la misma carpeta. No hubo trabajos de impresión ni conexiones a Epson/QZ.

**Reproducibilidad aislada.** Desde la carpeta de aplicación, con el Node24 local y las dependencias existentes:

```sh
NODE_BIN=../../recovery-local/node-v24.22.1-darwin-arm64/bin/node
"$NODE_BIN" scripts/test-pos-retail-cash-v2.mjs
"$NODE_BIN" scripts/test-pos-retail-count-ui.mjs
"$NODE_BIN" scripts/test-pos-cash-close-navigation.mjs
"$NODE_BIN" node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

El arnés `scripts/test-pos-retail-count-guard-postgres.py` usa exclusivamente la base fija `cometa_cash_count_guard_v3` del contenedor sintético. Para el ensayo de migración se restaura allí una copia sintética con esquema/ACL ANTERIORES a ambos archivos; luego:

```sh
python3 scripts/test-pos-retail-count-guard-postgres.py --prepare-legacy-open
docker exec -i cometa-cash-close-test-db psql -X -U postgres -d cometa_cash_count_guard_v3 -v ON_ERROR_STOP=1 -f - < supabase/migrations/20261103010000_pos_retail_cash_handover_v2.sql
docker exec -i cometa-cash-close-test-db psql -X -U postgres -d cometa_cash_count_guard_v3 -v ON_ERROR_STOP=1 -f - < supabase/migrations/20261103020000_pos_retail_cash_count_guard_v3.sql
python3 scripts/test-pos-retail-count-guard-postgres.py
```

La preparación rechaza una base ya migrada antes de crear datos. El ensayo consume y limpia su fixture; para repetir el ensayo completo hay que restaurar otra vez la copia sintética anterior. Los estados auxiliares quedan privados en /tmp, sin credenciales en Git. Las regresiones de asignación y concurrencia normales pueden repetirse sobre la copia ya migrada `cometa_cash_retail_v2`; su adaptador de prueba inicia un conteo idempotente por intención de cierre y no está incorporado en la aplicación. Nunca ejecutar estos arneses sobre producción.

**Orden de publicación, preparado y NO ejecutado.**

1. Revisar y aprobar el candidato completo desde la rama dedicada, excluyendo QZ y el checkpoint local. Preparar respaldo/PITR recuperable y comprobar solo en lectura el historial de migraciones. Si hay pendientes ajenas a estos dos archivos, detenerse y revisarlas.
2. Coordinar la ventana operativa y las terminales. No cerrar automáticamente turnos ni corregir históricos. No se necesita cerrar un turno para migrarlo.
3. Aplicar primero `20261103010000` si aún no existe en el historial, y DESPUÉS `20261103020000`, con ON_ERROR_STOP, transacción y timeout de bloqueo corto. No repetir la primera si ya estaba aplicada. La nueva migración notifica la recarga de esquema PostgREST.
4. Confirmar por consulta autorizada que el contrato devuelve3. Publicar después la app candidata con su build webpack. Una app508cbc5 espera2 y se bloqueará de forma segura durante la transición; formularios viejos no pueden cerrar sin el control nuevo. Recargar las terminales e iniciar conteos nuevos, sin recuperar importes de borradores anteriores al cambio.
5. Verificar disponibilidad, versión, sesión/PIN y autorización en solo lectura. No crear ventas, abonos, movimientos, cierres ni impresiones remotas de prueba. Vigilar409 de recuento: son rechazos seguros, no cierres parciales. El uso comercial y la entrega física reales corresponden al operador.

**Recuperación.** Un fallo SQL previo a COMMIT revierte esa migración. Si la primera se aplicó y la segunda falla, no publicar la app nueva: mantener la ventana y corregir hacia delante. Si ambas se aplicaron y falla la app, mantener la pausa operativa de caja y publicar una versión compatible con contrato3; volver sin más a508cbc5 no restaura escritura porque espera2. No eliminar los triggers, bajar el contrato ni reutilizar conteos antiguos para forzar cierres. Con datos nuevos ya confirmados, conservar snapshots, reservas, recepciones y solicitudes idempotentes. La revisión histórica de los400 permanece en su documento separado, sin ejecutar correcciones.
