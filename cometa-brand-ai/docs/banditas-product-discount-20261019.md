# Banditas: excepción por producto

Identidad autorizada: `magenta-fitwear`, producto `4d1afc58-fd94-447c-8619-352969374124` («Banditas»), precio base $15. La excepción es un descuento de $5 por pieza desde 50 unidades del mismo producto, combinando variantes según la regla existente del negocio. Sustituye los $10 generales. No se configura una excepción para `22873a43-aee6-4313-b110-38262c80b907` («Banditas Mayoreo»).

## Implementación

La migración `20261019193000_pos_product_discount_override.sql` agrega `pos_retail_rules.product_discounts`, un mapa de IDs a descuentos. El motor canónico `pos_retail_quote_v1` usa la excepción cuando existe y conserva la regla general para los demás productos. Cero es una excepción válida; quitarla restaura la regla general. No se modifican los precios del catálogo ni la fórmula de impuestos, redondeo o totales.

La configuración se edita en Pedidos → Configuración comercial → buscar modelo → Excepción de descuento por modelo. La API exige permisos SETTINGS y `pos.settings.manage`, resuelve la marca y delega la validación al servidor. La RPC valida producto activo de esa marca e importe numérico no negativo con hasta dos decimales. La escritura bloquea la misma fila de reglas que utilizan ventas y pedidos. Se conservan RLS y privilegios existentes; FOOD no puede configurar la excepción.

No se actualizan automáticamente cotizaciones, políticas, pagos, reservas ni ventas guardadas. Si guardar, abonar, activar, convertir o liquidar implica cambiar la cotización guardada, el servidor requiere `confirmed_quote` idéntica a la cotización actual. La pantalla solicita confirmación explícita; una vista previa automática no basta. Si cambia la regla entre la revisión y el guardado, la operación devuelve `prices_changed` sin cobrar ni guardar. Los comprobantes históricos siguen usando sus snapshots.

## Pruebas ejecutadas

Base PostgreSQL local desechable con esquema real y migraciones: PASS. No se crearon ventas de prueba en producción.

| Piezas | Precio unitario | Total esperado y obtenido |
|---|---|---|
| 49 | $15 | $735 |
| 50 | $10 | $500 |
| 51 | $10 | $510 |

También pasaron:

- 20 + 15 + 15 en variantes del mismo producto: $500.
- 49 Banditas y una pieza de otro modelo de $100: $835, sin completar el umbral con otro producto.
- 50 Banditas y 50 de otro modelo de $100: $5.000, aplicando $5 y $10 respectivamente una sola vez.
- Notas, conversión en venta, venta directa y liquidación de cajita con reintentos idempotentes.
- Notas/cajitas previas mantienen su precio hasta confirmación; una cotización nueva sin confirmación explícita no guarda ni recibe abonos.
- Ediciones 49/50/51 conservan depósitos, vencimiento y política aceptada.
- Cotización obsoleta rechazada en guardado y venta directa.
- Configuración cero, eliminación, negativos, exceso de decimales, tipo incorrecto y producto inexistente.
- Exclusión FOOD, permisos de operador/host y aislamiento de marca.
- Huella de ventas anteriores idéntica después de los escenarios.

Comandos: `node scripts/test-pos-retail-orders-local.mjs` (incluye `test-pos-product-discount.mjs`); `node scripts/test-pos-retail-orders-api.mjs`; `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`; ESLint dirigido al código de aplicación y scripts nuevos; `git diff --check`. Todos PASS. Build remoto Next/TypeScript también PASS.

## Publicación y preservación

Migración aplicada el 19 de octubre de 2026 a las 19:22 UTC, hash `753bccc566c0f7c64e234a8d5782128f201e8cf80c0bbaa4747cc70e99e95279`. Respaldo restaurado y ensayo aislado PASS, incluidos 76 objetos de Storage con hashes verificados. El aplicador comparó huellas de todas las tablas públicas y `auth.users` dentro de la misma transacción, excluyendo únicamente la nueva columna; comprobó que la única excepción fuera el ID autorizado y validó 49/50/51 antes de COMMIT. Registro de migración y hash comprobados después de aplicar.

El primer intento se abortó sin aplicar la migración por un error de sintaxis en la comprobación auxiliar del aplicador. Se corrigió el paréntesis de la expresión CASE y el segundo intento pasó todas las comprobaciones; la migración ensayada permaneció idéntica.

Consulta posterior de solo lectura en producción: 49=$735, 50=$500, 51=$510. Precios base: Banditas $15 y Banditas Mayoreo $10, ambos preservados. Regla general $10, mínimo 50 y combinación por producto conservados. No se modificaron variables de entorno ni la configuración QZ.

Despliegue `dpl_JCuDtWtYSshTMbpk175ADncR78m5`, `https://cometa-qo21zbz87-cometa-os-s-projects.vercel.app`, READY y promovido. `vercel alias ls` confirma `app.cometaos.com` apuntando al nuevo despliegue. Build y TypeScript remotos PASS. HTTP posterior: `/login` 200; API de pedidos 401 sin sesión. No se creó commit ni push.

No se realizó impresión física ni una compra/cobro real para verificar este cambio. La validación física del ticket de la entrega anterior sigue pendiente.

## Archivos de esta corrección

1. `supabase/migrations/20261019193000_pos_product_discount_override.sql`
2. `src/lib/pos/retail-orders.ts`
3. `src/app/api/pos/retail-orders/route.ts`
4. `src/app/brand/[brandSlug]/pos/orders/page.tsx`
5. `scripts/test-pos-retail-orders-api.mjs`
6. `scripts/test-pos-retail-orders-local.mjs`
7. `scripts/test-pos-product-discount.mjs`
8. `scripts/apply-pos-product-discount-production.mjs`
9. `docs/banditas-product-discount-20261019.md`

Se conservaron los cambios de tickets de la entrega anterior y los archivos ajenos no rastreados. Los respaldos, manifiestos y resultados privados permanecen bajo `build/`; la copia de despliegue queda bajo `.next/`, sin incluir secretos en la publicación.
