# Smoke test — COMETA POS Plans & Entitlements V1

No ejecutar con datos productivos. Usar brands de prueba o una transacción rollback.

## Brand nueva / Pro trial

1. Crear una cuenta y un negocio fashion o retail. Esperado: profile conserva el giro y subscription usa `pro`.
2. Revisar lifecycle. Esperado: `trial`, aproximadamente 15 días, acceso permitido.
3. Revisar bootstrap. Esperado: plan Pro 499.00 MXN; límites 1 sucursal, 2 cajas y 5 usuarios.
4. Confirmar Principal y Caja 1. Esperado: usage 1/1/1; owner incluido en usuarios.
5. Reintentar creación con la misma key. Esperado: misma brand, una subscription y un solo `trial_started`.
6. Abrir POS y completar una operación normal. Esperado: CORE-1 y lifecycle siguen autorizando el trial.

## Start

1. Asignar `start` mediante el mecanismo administrativo/test existente.
2. Confirmar límites 1/1/2.
3. Confirmar acceso a ventas, caja, productos, inventario, clientes y reportes.
4. Confirmar que loyalty, Signals y PULSAR no están incluidos por plan.
5. Intentar crear una segunda ubicación/caja mediante endpoints productivos. Esperado: códigos de límite existentes.

## Pro

1. Asignar `pro` y confirmar límites 1/2/5.
2. Confirmar loyalty, Signals y PULSAR en entitlements efectivos.
3. Confirmar que `platform.multi_location` no está incluido.

## Multi

1. Asignar `multi` y confirmar límites 4/8/10.
2. Confirmar que hereda Pro y añade `platform.multi_location`.
3. No asumir reportes consolidados ni intelligence multi-location hasta que exista su experiencia productiva.

## Regresión

1. Verificar que `pos_start` sigue en catálogo como legacy.
2. Verificar que migraciones de trials conservan `started_at` y `trial_ends_at`.
3. Verificar que no existe un plan POS `cometa_os`, integración Stripe ni endpoint nuevo de invitaciones.
