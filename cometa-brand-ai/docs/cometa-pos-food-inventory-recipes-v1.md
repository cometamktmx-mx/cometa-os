# Food Inventory & Recipes V1

Estado: implementación local; pendiente de certificación PostgreSQL. No aplicar la migración a producción hasta ejecutar las suites SQL aisladas.

## Modelo operativo

`pos_inventory` sigue siendo la única fuente de saldo por variante y sucursal. Los insumos son productos `ingredient`, inventario `direct`, no vendibles, comprables y con seguimiento físico. Los preparados son productos `prepared`, inventario `recipe`, sin saldo propio. No se admiten recetas anidadas ni híbridos.

La migración aditiva es `20260918120000_pos_food_inventory_recipes_v1.sql`. Crea exclusivamente `pos_food_ingredient_settings`, `pos_food_recipe_versions`, `pos_food_recipe_components`, `pos_food_modifier_recipe_effects`, `pos_food_item_recipe_snapshots` y `pos_food_sale_consumptions`. Reutiliza presentaciones, recepciones, movimientos, unidades, variantes y ventas existentes.

Las presentaciones tienen contenido convertido a unidad base, costo configurado y proveedor opcional. Editarlas no cambia saldo ni costo vigente. Una entrada usa la recepción existente; la creación inicial deriva costo base de la primera presentación. El costo vigente reside globalmente en la variante. Las recepciones mantienen la política de actualización de costo existente; también se permite actualizar explícitamente costo por contenido.

Unidades idempotentes: mg/g/kg (masa), ml/l (volumen, símbolo visible L), piece (conteo). Las conversiones se validan en servidor y sólo entre dimensiones compatibles. Los paquetes tienen contenido explícitamente configurado; el conteo de paquetes no es una conversión genérica piece → masa/volumen. El stock y cada consumo deben ser representables exactamente con tres decimales; cantidades incompatibles se rechazan. Los costos unitarios usan seis decimales.

## Recetas y cierre

Cada guardado publica una versión inmutable por variante, con cantidad/unidad capturadas y cantidad/unidad base. Las reglas ADD, REMOVE y REPLACE son independientes del precio de los modifiers. Las remociones y reemplazos afectan el componente base; las adiciones se agregan después. Dos reglas que alteran el mismo origen se rechazan por ambigüedad.

SEND resuelve receta y modifiers autorizados, captura componentes efectivos, costo vigente, reglas y prueba de procedencia en un snapshot separado e inmutable. No modifica el snapshot de precio de modifiers, KDS ni stock. Los cambios administrativos posteriores no modifican el pedido enviado.

La extensión V4 se activa exclusivamente por el contexto Food existente validado. Tras crear la venta canónica y después del retorno temprano de idempotencia, llama al helper privado `pos_food_consume_sale_recipes_v1` dentro de esa misma transacción. Bloquea existencias de insumos y productos directos en orden determinista, valida stock físico disponible, descuenta, crea movimientos vinculados a venta y registros por item/insumo con costo histórico. Si falla cualquier etapa, se revierte el intento completo de cierre. Los pagos parciales de transacciones anteriores permanecen. Un retry final devuelve la venta histórica sin ejecutar nuevamente el helper.

Retail conserva las ramas direct/none existentes. Los guardas de precisión en recepción y ajuste se activan sólo para productos ingredient. Los productos recipe se rechazan por la entrada genérica de venta sin procedencia SEND.

## Costo, rendimiento y merma

Costo por componente = cantidad base × costo unitario vigente. Costo receta = suma de componentes. Utilidad bruta estimada = precio − costo; margen = (precio − costo) / precio, no calculable con precio cero. No representa utilidad neta.

Rendimiento físico = mínimo de floor((stock − reservado) / requerido) por insumo. Se devuelve el insumo limitante y remanente. Por separado se calcula stock utilizable estimado y rendimiento considerando merma. Configurar merma no descuenta existencia; las ventas consumen cantidades físicas de receta.

## Administración y autorización

Inventario Food: `/brand/[brandSlug]/pos/admin/inventory`. Incluye insumos, presentaciones, stock físico/utilizable, mínimos, proveedor, entradas, ajustes, costo vigente y movimientos. El editor Food de productos ofrece Información, Precio, Receta, Modificadores y Disponibilidad; conserva acceso al catálogo de productos directos.

API: `/api/pos/food/recipes`, con sesión Food ADMIN, sucursal autorizada, perfil Food y capacidades comerciales de inventario/productos. Brand, host y operador se resuelven del contexto autenticado. Las seis tablas tienen RLS y no se exponen directamente al cliente. Los comandos administrativos usan una clave estable y auditoría existente para reintentos.

## Verificación

Ejecutar:

```text
node_modules/.bin/tsc.cmd --noEmit --incremental false --pretty false
node --test scripts/test-pos-food-operations-v1.mjs scripts/test-pos-food-modifiers-v1.mjs scripts/test-pos-food-inventory-recipes-v1.mjs
node scripts/test-pos-food-integration-v1.mjs
node scripts/audit-pos-retail-readiness.mjs
git diff --check
```

El runner PostgreSQL requiere Docker local con el contenedor Supabase existente. Acepta `COMETA_LOCAL_DOCKER_EXE` para una ruta explícita a docker.exe. Crea una base aislada, aplica la cadena local de migraciones y ejecuta Food Operations, Modifiers, Split & Payments e Inventory & Recipes. También preserva un motor V4 anterior como oráculo diferencial de Retail. Las fixtures SQL se revierten por defecto; no usar `--persist` durante certificación.

Resultados locales actuales: TypeScript sin errores; ESLint dirigido sin errores en archivos nuevos y administrativos; 30 pruebas Node pasan (Operations 15, Modifiers 4, Inventory & Recipes 11); auditoría Retail 24/24; diff sin errores de whitespace. El editor histórico de productos conserva una infracción ESLint y tres warnings preexistentes. Modifiers emite un warning React de key preexistente.

PostgreSQL no pudo arrancar: `spawnSync docker ENOENT`. Por tanto, las suites SQL de pagos parciales, consumo atómico, rollback, concurrencia e históricos están escritas pero sus resultados no están certificados. También queda pendiente revisión visual autenticada con datos de una base local.

La auditoría estática `audit-pos-split-payments-v1.mjs` tampoco completa: referencia `supabase/migrations/20260812_loyalty_v4b2a_sale_engine.sql`, que ya no está en esa ubicación. Es un bloqueo preexistente del script; no se modificó fuera del alcance. La suite SQL de Split & Payments permanece incluida en el runner aislado.

## Archivos de este bloque

- `supabase/migrations/20260918120000_pos_food_inventory_recipes_v1.sql`
- `supabase/tests/pos_food_inventory_recipes_v1.sql`
- `src/lib/pos/food-recipes-shared.ts`
- `src/lib/pos/food-recipes-server.ts`
- `src/lib/pos/food-server.ts`
- `src/app/api/pos/food/recipes/route.ts`
- `src/app/brand/[brandSlug]/components/pos-food-recipes-admin.tsx`
- `src/app/brand/[brandSlug]/components/pos-food-modifiers-admin.tsx`
- `src/app/brand/[brandSlug]/pos/admin/inventory/page.tsx`
- `src/app/brand/[brandSlug]/pos/admin/page.tsx`
- `src/app/brand/[brandSlug]/pos/products/page.tsx`
- `scripts/test-pos-food-inventory-recipes-v1.mjs`
- `scripts/test-pos-food-integration-v1.mjs`
- `docs/cometa-pos-food-inventory-recipes-v1.md`

Se preservan los cambios previos del workspace. Sin commit, push, remoto ni migraciones aplicadas a una base operativa.
