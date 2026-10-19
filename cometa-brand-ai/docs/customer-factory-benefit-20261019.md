# Beneficio de fábrica por cliente — Retail

Casilla desactivada por defecto en alta, edición y alta rápida. Solo `SETTINGS` (Administrador o permiso administrativo explícito) puede cambiarla. La RPC comprueba sesión PIN, operador, negocio y caducidad; registra operador, usuario anfitrión, fecha y anterior/nuevo. Ventas puede seleccionar al cliente sin recibir permiso para otorgar el beneficio.

La cotización recibe un ID de cliente y consulta el beneficio persistido. Extiende el motor existente: elimina el umbral de piezas, sin acumular descuento por cliente y volumen. Conserva reemplazos por ID de producto, exclusiones y piso cero. La línea aplicada muestra **Precio de fábrica por cliente**. La venta guarda `retail_pricing_snapshot`; las notas/cajitas conservan su snapshot de cotización.

Magenta mantiene descuento general 10 y Banditas 5, configurado en el ID `4d1afc58-fd94-447c-8619-352969374124`. El ID `22873a43-aee6-4313-b110-38262c80b907` (Banditas Mayoreo) se excluye exclusivamente de la eliminación del mínimo por cliente: su precio de catálogo y regla de volumen anterior no se reescriben.

Cambiar/quitar cliente en venta obtiene una cotización del servidor y pide aceptar diferencias. Cambiar la casilla nunca reescribe operaciones existentes. Notas/cajitas exigen confirmar la cotización exacta antes de sustituir el acuerdo; pagos, reservas y vencimiento se conservan.

## Validación

- PostgreSQL desechable: normal 1/49/50, beneficiado 1/50 sin acumulación, Banditas beneficiado 1 = 10 y normal 1 = 15 / 49 = 735 / 50 = 500, Mayoreo comparado con su regla previa.
- Notas y cajitas rechazan recálculo no confirmado. Toggle conserva snapshots, depósitos, reservas y vencimiento; ventas históricas inmutables.
- Venta con snapshot, reintento sin duplicación; alta transaccional cliente/beneficio; auditoría sin evento duplicado al repetir el mismo valor; denegación sin permiso, cliente ajeno y FOOD.
- `node scripts/test-pos-retail-orders-local.mjs` y `node scripts/test-pos-retail-workspace-api.mjs`: aprobados.
- TypeScript y build: aprobados. Regresiones `test-pos-retail-orders-api`, `test-pos-retail-terminal`, `test-pos-ticket-compact`: aprobadas; sin impresión ni cajón reales.

Migración `20261020001000_pos_customer_factory_benefit.sql` aplicada el 19 de octubre de 2026 a las 22:23:50 UTC, después de respaldo/restauración y ensayo. Verificación transaccional de datos existentes; ningún cliente real fue beneficiado como prueba (tabla nueva vacía al publicar).

## Archivos del bloque

- `src/app/api/pos/customers/route.ts`
- `src/app/api/pos/retail-orders/route.ts`
- `src/app/brand/[brandSlug]/pos/customers/page.tsx`
- `src/app/brand/[brandSlug]/pos/register/page.tsx`
- `src/app/brand/[brandSlug]/pos/orders/page.tsx`
- `src/lib/pos/retail-orders.ts`
- `supabase/migrations/20261020001000_pos_customer_factory_benefit.sql`
- `scripts/test-pos-customer-factory-benefit.mjs`
- Este documento.

La lista de archivos compartidos de verificación/publicación está en [Inventario](retail-inventory-20261019.md). La casilla no se activó a clientes reales; esa decisión queda en manos de los administradores del negocio.
