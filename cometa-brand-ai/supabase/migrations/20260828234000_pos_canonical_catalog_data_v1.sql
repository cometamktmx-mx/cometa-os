-- Canonical, non-personal POS catalog data required by clean local resets.

INSERT INTO public.pos_profile_catalog (code, name, description, icon_code, launch_status, sort_order)
VALUES
  ('unconfigured', 'Sin configurar', 'El negocio todavía no ha elegido un perfil operativo.', 'settings', 'internal', 0),
  ('coffee_shop', 'Cafetería', 'Bebidas, tamaños, ingredientes y modificadores.', 'store', 'upcoming', 50),
  ('fashion', 'Moda y calzado', 'Productos con tallas, colores, variantes y existencias.', 'product', 'live', 10),
  ('restaurant', 'Restaurante', 'Platillos, recetas, mesas, comandas y cocina.', 'store', 'upcoming', 60),
  ('retail', 'Retail general', 'Venta directa de productos físicos y presentaciones.', 'store', 'live', 20)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon_code = EXCLUDED.icon_code,
  launch_status = EXCLUDED.launch_status,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.pos_capability_catalog (code, name, description, category, launch_status, sort_order)
VALUES
  ('batches', 'Lotes', 'Controla existencias separadas por lote.', 'pharmacy', 'upcoming', 130),
  ('colors', 'Colores', 'Habilita color como atributo recomendado.', 'catalog', 'live', 30),
  ('combos', 'Combos', 'Agrupa productos y descuenta sus componentes.', 'catalog', 'upcoming', 100),
  ('direct_inventory', 'Inventario directo', 'Descuenta unidades de la variante vendida.', 'inventory', 'live', 40),
  ('expiration_dates', 'Caducidades', 'Registra fechas de vencimiento y alertas.', 'pharmacy', 'upcoming', 140),
  ('ingredients', 'Ingredientes', 'Gestiona insumos, unidades y costos de preparación.', 'food', 'upcoming', 80),
  ('kitchen_tickets', 'Comandas', 'Envía productos al área de preparación.', 'restaurant', 'upcoming', 120),
  ('loyalty', 'Fidelización', 'Clientes, puntos, recompensas y tarjeta digital.', 'growth', 'live', 60),
  ('modifiers', 'Modificadores', 'Extras, sustituciones y elecciones del cliente.', 'food', 'upcoming', 90),
  ('recipes', 'Recetas', 'Descuenta ingredientes al vender un producto preparado.', 'food', 'upcoming', 70),
  ('services', 'Servicios', 'Permite vender conceptos sin inventario físico.', 'catalog', 'live', 50),
  ('sizes', 'Tallas', 'Habilita talla como atributo recomendado.', 'catalog', 'live', 20),
  ('tables', 'Mesas', 'Abre cuentas por mesa y mantiene pedidos pendientes.', 'restaurant', 'upcoming', 110),
  ('variants', 'Variantes', 'Permite varias presentaciones o combinaciones por producto.', 'catalog', 'live', 10)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  launch_status = EXCLUDED.launch_status,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.pos_profile_capability_defaults (profile_code, capability_code, enabled)
VALUES
  ('coffee_shop', 'direct_inventory', true),
  ('coffee_shop', 'ingredients', true),
  ('coffee_shop', 'loyalty', true),
  ('coffee_shop', 'modifiers', true),
  ('coffee_shop', 'recipes', true),
  ('coffee_shop', 'variants', true),
  ('fashion', 'colors', true),
  ('fashion', 'direct_inventory', true),
  ('fashion', 'loyalty', true),
  ('fashion', 'sizes', true),
  ('fashion', 'variants', true),
  ('restaurant', 'combos', true),
  ('restaurant', 'direct_inventory', true),
  ('restaurant', 'ingredients', true),
  ('restaurant', 'kitchen_tickets', true),
  ('restaurant', 'loyalty', true),
  ('restaurant', 'modifiers', true),
  ('restaurant', 'recipes', true),
  ('restaurant', 'tables', true),
  ('retail', 'direct_inventory', true),
  ('retail', 'loyalty', true),
  ('retail', 'variants', true)
ON CONFLICT (profile_code, capability_code) DO UPDATE SET
  enabled = EXCLUDED.enabled;

INSERT INTO public.pos_plans (code, name, description, list_price, currency, billing_interval, active, sort_order)
VALUES
  ('pos_start', 'Cometa POS', 'Punto de venta, inventario, clientes, fidelización y reportes básicos.', 999.00, 'MXN', 'month', true, 10),
  ('pro', 'Cometa POS Pro', 'Operación, fidelización e inteligencia para crecer.', 499.00, 'MXN', 'month', true, 0)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  list_price = EXCLUDED.list_price,
  currency = EXCLUDED.currency,
  billing_interval = EXCLUDED.billing_interval,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.pos_plan_limits (
  plan_code, max_locations, max_registers, max_users, max_products, max_customers,
  includes_loyalty, includes_digital_card, includes_basic_insights
)
VALUES
  ('pos_start', 1, 1, 3, NULL, NULL, true, true, true),
  ('pro', 1, 2, 5, NULL, NULL, true, false, true)
ON CONFLICT (plan_code) DO UPDATE SET
  max_locations = EXCLUDED.max_locations,
  max_registers = EXCLUDED.max_registers,
  max_users = EXCLUDED.max_users,
  max_products = EXCLUDED.max_products,
  max_customers = EXCLUDED.max_customers,
  includes_loyalty = EXCLUDED.includes_loyalty,
  includes_digital_card = EXCLUDED.includes_digital_card,
  includes_basic_insights = EXCLUDED.includes_basic_insights,
  updated_at = now();

INSERT INTO public.pos_entitlements (id, code, name, description, category, active)
VALUES
  ('f4e1186c-9aa0-491b-b986-be92640ece51', 'intelligence.pulsar', 'PULSAR AI', 'Inteligencia comercial interpretativa.', 'intelligence', true),
  ('6e3e3ed1-b394-4fec-9b8a-602209ecf072', 'intelligence.signals', 'Señales comerciales', 'Señales deterministas.', 'intelligence', true),
  ('23791531-bbad-43ce-86a1-193b5f44c82d', 'pos.access', 'Acceso a Cometa POS', 'Acceso al producto operativo Cometa POS.', 'pos', true),
  ('263b6c1f-b237-4966-bf23-709564a6ed79', 'pos.cash', 'Caja', 'Operación de caja.', 'pos', true),
  ('c7e0ed1e-1a66-449b-981c-f49a05395909', 'pos.customers', 'Clientes', 'Directorio e historial de clientes.', 'pos', true),
  ('bad9e6f7-8b5f-4900-925e-0b2a809e4cd4', 'pos.inventory', 'Inventario', 'Existencias y movimientos.', 'pos', true),
  ('f7b37599-c1c9-4562-88f0-1980773e0925', 'pos.loyalty', 'Fidelización', 'Puntos, niveles y visitas.', 'pos', true),
  ('2f472e0a-6077-42c0-a04a-658fa063e4cc', 'pos.products', 'Productos', 'Catálogo de productos y variantes.', 'pos', true),
  ('2f4a5f88-2044-43b4-901d-ec9d9b364f7b', 'pos.reports', 'Reportes', 'Analítica ejecutiva.', 'pos', true),
  ('b3bd487a-d150-4111-ad5a-518a96239493', 'pos.sales', 'Ventas', 'Registro y consulta de ventas.', 'pos', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  active = EXCLUDED.active,
  updated_at = now();

WITH canonical_relations(plan_code, entitlement_code) AS (
  VALUES
    ('pos_start', 'intelligence.signals'),
    ('pos_start', 'pos.access'),
    ('pos_start', 'pos.cash'),
    ('pos_start', 'pos.customers'),
    ('pos_start', 'pos.inventory'),
    ('pos_start', 'pos.loyalty'),
    ('pos_start', 'pos.products'),
    ('pos_start', 'pos.reports'),
    ('pos_start', 'pos.sales'),
    ('pro', 'intelligence.pulsar'),
    ('pro', 'intelligence.signals'),
    ('pro', 'pos.access'),
    ('pro', 'pos.cash'),
    ('pro', 'pos.customers'),
    ('pro', 'pos.inventory'),
    ('pro', 'pos.loyalty'),
    ('pro', 'pos.products'),
    ('pro', 'pos.reports'),
    ('pro', 'pos.sales')
)
INSERT INTO public.pos_plan_entitlements (plan_code, entitlement_id)
SELECT relation.plan_code, entitlement.id
FROM canonical_relations relation
JOIN public.pos_entitlements entitlement ON entitlement.code = relation.entitlement_code
ON CONFLICT (plan_code, entitlement_id) DO NOTHING;
