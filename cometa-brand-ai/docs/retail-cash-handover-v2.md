Caja Retail: conteo, reserva y recepción de fondo

Implementación preparada sin despliegue. Next declarado e instalado: 16.4.4; build efectivo `next build --webpack`. Rama de entrega: `feature/retail-cash-handover-release-20261102`, basada en `origin/main` de seguridad (`1605738`), sin incluir el checkpoint local de simulación ni los archivos QZ pendientes de la copia principal.

**Carpetas de esta Mac.** Abrir el proyecto de revisión en `/Users/camiloguerrero/Downloads/supabase-recovery-20261014/cometa-retail-cash-20261102/cometa-brand-ai`. La copia principal continúa en `cometa-production-20261023`, con sus commits y QZ intactos. El lanzador aislado disponible en esta Mac se ejecuta desde la carpeta superior `supabase-recovery-20261014`: `recovery-local/node-v24.22.1-darwin-arm64/bin/node recovery-local/start-cash-v2.mjs`. Usa exclusivamente loopback: aplicación 55410, gateway 55441, REST separado 55448 y base Docker `cometa_cash_retail_v2`. El acceso Auth es el servicio sintético existente. No copiar `.env` productivos al proyecto. Configuración privada y tokens quedan fuera de Git.

**Candidato actualizado:** el control de conteo se completó después de508cbc5. Ver [vigencia del conteo y orden de publicación v3](retail-cash-count-guard-v3.md); exige ambas migraciones y contrato3.

**Comportamiento entregado.**

- El cajero con CASH no recibe apertura, esperado, resumen, movimientos ni componentes del turno abierto que permitan reconstruirlo desde Caja o bootstrap. Una cuenta anfitriona administradora no cambia esta decisión. El permiso efectivo del PIN requiere CASH + REPORTS para supervisar; la consulta debe solicitar explícitamente `supervision=1`. La pantalla comienza en conteo ciego, también para supervisores. Al cambiar operador se remonta el espacio de trabajo y se eliminan datos y diálogos de la sesión anterior. Se revoca lectura directa de caja/movimientos/pagos a anon/authenticated; las consultas pasan por APIs con PIN, marca, sucursal y dispositivo. No se añaden permisos a operadores.
- El resumen previo al conteo no contiene importes deducibles. Se pide TODO el dinero físico, incluido el fondo, antes de separar. Fondo reservado obligatorio, cero válido, máximo lo contado, centavos exactos. Entrega declarada = contado − reserva. Diferencia = contado − esperado; la reserva no altera esta resta ni genera un gasto/retiro.
- Cierre, importes de asignación, reserva pendiente, evento financiero, documento v2 e idempotencia se confirman en una sola transacción. Un fallo del documento revierte todo. Imprimir/reimprimir nunca completa ni recalcula este documento. La entrega externa está declarada, sin recepción externa confirmada; no se inventa una confirmación física.
- La siguiente apertura de la misma caja muestra la reserva pendiente y exige contar lo recibido. Una diferencia exige motivo. La reserva se enlaza a una apertura y se consume una vez bajo bloqueo de caja, fila y clave idempotente. El importe real recibido determina la apertura; la discrepancia de custodia no modifica el cierre de origen.
- Se separa un aporte físico nuevo, con motivo, del fondo recibido. Apertura = recibido + aporte; no se crea otra entrada por ninguno de estos componentes. Si no hay reserva estructurada se puede confirmar fondo existente con motivo de origen independiente: no se atribuye a un cierre antiguo ni se inventa una discrepancia contra un importe desconocido.
- Entradas/depósitos manuales requieren una declaración de aporte físico NUEVO en UI, API y RPC. Separar dinero del cajón se registra al cerrar como reserva. La declaración conserva lo manifestado por el operador; no demuestra por sí sola que existieran billetes. Ajustes/reversos conservan sus permisos y su trazabilidad, sin rebautizarlos como aportes físicos.
- Historial y reportes muestran reserva, entrega declarada, recepción, discrepancia y aporte. El historial nuevo usa el desglose del documento v2. El reporte distingue el documento original de las fuentes consultadas. Se incluyen cortes por fecha de cierre aunque abrieran antes y no tengan cobros en el periodo. Los movimientos de cada turno conservan sus fechas originales.
- Se avisa de turnos que abrieron un día anterior según la zona horaria de la sucursal y se ofrece cerrar/preparar relevo. No hay cierre automático ni redistribución de operaciones. El conteo físico debe coordinarse con el equipo: no se pausa automáticamente el cobro durante los minutos de conteo. Si hay operaciones de efectivo entre el inicio del conteo y el cierre, la nueva guarda exige recontar antes de guardar; las posteriores al cierre se rechazan.

Listado inicial de508cbc5 (la continuación v3 se detalla en su guía): [changed-files.txt](../../verification/retail-cash-v2/changed-files.txt).

**Persistencia y compatibilidad de asignación.** Primera migración [20261103010000_pos_retail_cash_handover_v2.sql](../supabase/migrations/20261103010000_pos_retail_cash_handover_v2.sql). Añade columnas nullable a `pos_cash_sessions`; tablas `pos_retail_cash_reserves`, `pos_retail_cash_documents` y `pos_retail_cash_requests_v2`; restricciones, unicidades, guardas y el wrapper de la RPC existente. Conserva internamente el motor monetario previo con ejecución directa revocada. Las nuevas tablas no tienen acceso de navegador ni escritura directa service_role; la RPC SECURITY DEFINER es la frontera de mutación. Los documentos y asignaciones cerradas son inmutables; una recepción consumida no puede reescribirse.

No hay UPDATE/backfill de cierres existentes. Una reserva cero es un dato explícito y se confirma/consume en la siguiente apertura; NULL significa desconocido. Los tickets v1 conservan su snapshot; los históricos sin desglose siguen indicándolo. Reserva, entrega o componentes de apertura ausentes dicen «No registrado»; tampoco se convierten en cero al cerrar un turno que ya estaba abierto antes de la migración. QZ, sus firmas y sus permisos no se modifican.

**Pruebas y capturas.** Evidencia sintética en [verification/retail-cash-v2](../../verification/retail-cash-v2). El flujo real de navegador usó login Auth local, dos operadores con PIN, APIs Next y PostgreSQL. Apertura500 + venta cash1500 + anticipo cash500 → esperado2500; contado2400 → −100; reserva500 → entrega declarada1900. Después, otra operadora recibió450 y aportó50 nuevos: apertura500, discrepancia de recepción−50, cierre anterior intacto. No se hizo clic en imprimir ni se conectó una impresora.

| Evidencia | Captura |
|---|---|
| Turno de un día anterior y conteo ciego | [03](../../verification/retail-cash-v2/03-turno-dia-anterior.png) |
| Contado total2400 y reserva500 | [04](../../verification/retail-cash-v2/04-conteo-total-y-reserva.png) |
| Entrega declarada antes de confirmar | [05](../../verification/retail-cash-v2/05-confirmacion-entrega-declarada.png) |
| Resultado: faltante100, reserva500, entrega1900 | [06](../../verification/retail-cash-v2/06-resultado-faltante-y-entrega.png) |
| Recepción450, discrepancia−50 y aporte50 separado | [07](../../verification/retail-cash-v2/07-recepcion-distinta-y-aporte-separado.png) |
| Historial preservado tras recibir | [08](../../verification/retail-cash-v2/08-historial-recepcion-sin-alterar-cierre.png) |
| Supervisión explícita del PIN autorizado | [09](../../verification/retail-cash-v2/09-supervision-autorizada.png) |
| Entrada exige declaración física; sin crear movimiento | [10](../../verification/retail-cash-v2/10-entrada-solo-aporte-fisico.png) |
| Fondo independiente, sin atribuir origen histórico; vista previa | [11](../../verification/retail-cash-v2/11-apertura-independiente-sin-inventar-historicos.png) |
| Ticket de reimpresión desde snapshot original | [12](../../verification/retail-cash-v2/12-ticket-reimpresion-snapshot.png) |

Las capturas son de Chromium local, no maquetas. Se revisaron visualmente conteo, resultado, recepción y movimiento. Las solicitudes del navegador se limitaron a loopback. El navegador integrado no estaba disponible; se usó Chromium ya instalado, sin instalar dependencias.

**Resultados:** Resultados de508cbc5 conservados como línea base:34 aserciones PostgreSQL,14 comprobaciones concurrentes/abonos, 10 tests nuevos de API/documento, 11 regresiones de caja/impresión, 9 de PIN/permisos y las suites de reportes/navegación aprobados. TypeScript, build webpack y ESLint dirigido sin errores. Migración completa ensayada desde cero con las ACL originales en `cometa_cash_retail_final`. El recorrido visual usa otra copia (`cometa_cash_retail_v2`), manteniendo intacto `postgres` para QZ. Los logs y el resumen están en [results.json](../../verification/retail-cash-v2/results.json).

**Comandos de validación.** Ejecutar desde la carpeta de aplicación, con las dependencias ya disponibles:

```sh
NODE_BIN=../../recovery-local/node-v24.22.1-darwin-arm64/bin/node
"$NODE_BIN" node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
"$NODE_BIN" scripts/test-pos-retail-cash-v2.mjs
"$NODE_BIN" scripts/test-pos-cash-close-navigation.mjs
"$NODE_BIN" scripts/test-pos-retail-report.mjs
"$NODE_BIN" scripts/test-pos-retail-report-api.mjs
"$NODE_BIN" scripts/test-pos-food-access-server-v1.mjs

docker exec -i cometa-cash-close-test-db psql -X -U postgres -d cometa_cash_retail_v2 -v ON_ERROR_STOP=1 -f - < supabase/tests/pos_retail_cash_handover_v2.sql
python3 scripts/test-pos-retail-cash-postgres.py
```

El SQL termina en ROLLBACK, incluida la inyección de fallo de documento. Python usa el nombre fijo de la base sintética, crea su propia marca de prueba y limpia solo ese fixture. Nunca sustituir esos destinos por producción. El ensayo desde cero de la migración se hace en otra copia sintética, con los mismos esquemas y ACL previas. La base original `postgres` del trabajo QZ se conserva.

La regresión de documentos/transporte es `verification/cash-close/verify.cjs`: se ejecutó desde una copia temporal con la raíz de esta rama para mantener sus fixtures HTML fuera de Git. El único ajuste a su fixture financiero fue añadir reserva cero explícita al cierre nuevo. Incluye reimpresión v1, error QZ simulado, guardas de impresión y fallo de almacenamiento de ticket. La prueba nueva añade lectura directa del documento v2 sin RPCs de totales. La confirmación física Epson y el incidente QZ siguen siendo independientes.

**Publicación posterior, aún no ejecutada.**

1. Revisar este diff y la [propuesta histórica separada](magenta-cash-historical-review-proposal.md). Aprobar la ventana de cambio. No mezclar los tres archivos QZ pendientes, el documento QZ ni el checkpoint local de simulación. No incluir secretos, dumps sintéticos, cookies o estados privados en el PR.
2. Obtener copia recuperable/PITR y verificar el historial de migraciones con el proceso habitual de Supabase en solo lectura. La lista/dry-run debe contener únicamente las dos migraciones aprobadas, en orden; detenerse si aparece cualquier otra pendiente. Comprobar firmas de funciones/índices contra el preflight del SQL. No ejecutar `db reset`, seeds ni suites de prueba sobre producción.
3. Coordinar una pausa operativa de apertura/cierre y movimientos de caja en las terminales durante la ventana. No cerrar cajas reales como parte técnica del cambio. Los turnos existentes pueden continuar y cerrarse después con el nuevo formulario. Las nuevas columnas siguen NULL hasta que se usa el nuevo flujo.
4. Aplicar primero20261103010000 y después20261103020000 mediante el flujo de migraciones del proyecto. Usar `ON_ERROR_STOP`, timeout de bloqueo corto y transacción; el archivo ya contiene BEGIN/COMMIT. El reemplazo del reporte falla íntegramente si el ancla del esquema no coincide. Registrar versión aplicada y resultado. No ejecutar pruebas sintéticas en ese destino.
5. Publicar la aplicación ya verificada mediante su build webpack existente. La app nueva comprueba `pos_retail_cash_contract_v2()=3` antes de escribir y rechaza una base sin migrar sin llamar al comando financiero; necesita la migración; una app antigua no puede enviar el nuevo cierre sin reserva. Durante la ventana esos intentos fallan sin escribir. Pedir recarga de terminales: no mantener formularios antiguos abiertos. Las entradas antiguas sin declaración física también se rechazan. Esto es compatibilidad de lectura e históricos, con corte de escritura intencional para clientes obsoletos.
6. Verificar en solo lectura versión de app/migración, disponibilidad, sesiones/PIN y acceso de reportes. No generar ventas, cobros, cierres, movimientos ni impresiones remotas de prueba. El primer uso comercial real queda a cargo del operador. Capturar evidencia operativa de entrega/recepción cuando ocurra realmente. Reanudar operación y vigilar rechazos/reintentos.

**Recuperación.** Si falla la migración antes de COMMIT se revierte íntegra; mantener la app anterior y registrar el error sin forzar el esquema. Si se aplicó pero falla el despliegue, mantener la pausa de mutaciones de caja y publicar una corrección hacia delante; las APIs antiguas no deben inventar reserva cero para sortear la validación. Si ya se creó cualquier documento v2, no borrar columnas/tablas, no renombrar el motor de vuelta ni reescribir snapshots. Restaurar una copia aparte/PITR para investigar; reconciliar las solicitudes idempotentes antes de cualquier intervención aprobada. Un rollback de aplicación requiere una versión compatible con el contrato v2. No se proporciona un down destructivo que pierda reservas o recepciones.

**Límites operativos.** La entrega declarada no certifica que un tercero recibió el efectivo externo. La recepción del fondo confirma lo declarado por el siguiente operador y conserva su identidad, momento y motivo; no es prueba física independiente. Una discrepancia no se compensa automáticamente. La interpretación de los400 históricos sigue pendiente. No se implementan devoluciones monetarias ni ajustes de históricos en esta rama.
