# Inventario Retail

Implementado sobre el árbol más reciente de `origin/main` (0fba894), conservando las correcciones de tickets y Banditas que ya estaban publicadas y aún no tenían commit. FOOD conserva el componente anterior. Offline queda fuera del alcance.

## Uso

- **Recibir** suma únicamente las cantidades capturadas. Reutiliza `pos_complete_inventory_receipt_v2`; no convierte una entrada en un ajuste absoluto. Un costo no informado conserva el costo anterior y queda identificado en `metadata.retail_cost_inputs`, separado del cero aritmético heredado del recibo.
- **Contar** registra el físico presente, incluidas reservas; vacío no cambia nada y cero es un conteo. Bloquea cifras inferiores a reservas. El token de versión de PostgreSQL detecta cambios concurrentes; actualizar/reconciliar conserva lo capturado.
- **Salida temporal** reduce físico y disponible, conserva propiedad fuera de tienda y no genera venta ni cobro. Regresos parciales y totales contra el folio. Una baja autorizada reduce el pendiente fuera de tienda, con auditoría y sin descontar nuevamente otras prendas presentes.

Lista por ID de producto padre, búsqueda de código base/nombre/SKU/barcode, alternativa por variante, categorías, disponibilidad, paginación y filtros persistentes. Matriz de combinaciones existentes, tabla para otros atributos, captura de varios modelos, resumen y guardado único. Escáner explícito sin captura global del foco. Nuevo producto reutiliza el creador transaccional y su clave de reintento; códigos numerados revisables y combinaciones seleccionables.

En tienda incluye reservado. Disponible = en tienda − reservado. Fuera = enviado − regresado − baja autorizada. El reporte Retail añade fuera y propiedad total sin alterar métricas financieras.

## Evidencia

Capturas de componentes React reales con datos sintéticos locales, sin sesión ni movimientos reales:

- [Lista por modelo](retail-inventory-20261019/lista-modelos.png)
- [Matriz](retail-inventory-20261019/matriz.png)
- [Poca altura: viewport equivalente al 125 %](retail-inventory-20261019/matriz-125-poca-altura.png)
- [Salidas temporales](retail-inventory-20261019/salidas-temporales.png)

La prueba usa 60 modelos, ocho colores, cuatro tallas y una combinación inexistente. Verifica Tab, scroll interno y pie accesible a 819 × 448 píxeles CSS, equivalentes a una pantalla de 1024 × 560 al 125 %. No representa una sesión visual autenticada de producción.

Pruebas ejecutadas y aprobadas:

- `node scripts/test-pos-retail-orders-local.mjs`: PostgreSQL desechable; recepción múltiple/idempotencia, cero, reservas, versión concurrente, salida vs reserva concurrente, regreso parcial/total, baja, permisos, FOOD y conciliación reporte/fuente. Incluye regresiones de ventas, notas, cajitas y Banditas.
- `node scripts/test-pos-eleventa-local.mjs`: creador real, creación concurrente, un stock inicial, rollback, rechazo de cambios de payload y aislamiento.
- `node scripts/test-pos-retail-workspace-api.mjs`: rutas reales, autenticación/PIN/permisos/sucursal, validación y conflictos.
- `node scripts/render-pos-retail-inventory.mjs`: render y teclado locales.
- TypeScript sin emisión, build Next.js y `git diff --check`: aprobados. Lint de archivos nuevos sin errores. Deuda previa de `any` y hooks en productos/clientes/registro conservada.

Migración `20261019230000_pos_retail_inventory_workspace.sql` aplicada el 19 de octubre de 2026 a las 22:23:32 UTC. Respaldo DB y 76 archivos Storage restaurados y verificados antes de aplicar. Verificación transaccional de contenido de todas las tablas públicas existentes y `auth.users`; cero lotes/salidas ficticios en producción. Evidencia privada de recuperación en `build/retail-workspace-production/audit`, excluida de Git.

## Archivos del bloque

- `src/app/api/pos/retail-inventory/route.ts`
- `src/app/api/pos/products/route.ts`
- `src/app/brand/[brandSlug]/pos/inventory/page.tsx`
- `src/app/brand/[brandSlug]/pos/inventory/retail-inventory.tsx`
- `src/app/brand/[brandSlug]/pos/inventory/retail-inventory-create.tsx`
- `src/app/brand/[brandSlug]/pos/inventory/retail-inventory.css`
- `src/app/brand/[brandSlug]/pos/products/page.tsx`
- `src/app/brand/[brandSlug]/components/pos-retail-reports.tsx`
- `src/lib/pos/retail-inventory.ts`
- `src/lib/pos/retail-report.ts`
- `supabase/migrations/20261019230000_pos_retail_inventory_workspace.sql`
- `scripts/test-pos-retail-inventory.mjs`
- `scripts/render-pos-retail-inventory.mjs`
- Este documento y sus cinco archivos de evidencia.

Verificaciones y publicación compartidas con beneficio: `scripts/test-pos-retail-orders-local.mjs`, `scripts/test-pos-retail-workspace-api.mjs`, `scripts/rehearse-magenta-recovery.mjs`, `scripts/apply-pos-retail-workspace-production.mjs`.
